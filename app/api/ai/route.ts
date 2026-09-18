import {
  REPLY_SCHEMA,
  refuses,
  retryPrompt,
  systemPrompt,
  unfence,
  type AiReply,
} from "@/lib/ai/chat";
import {
  attachmentProblem,
  attachmentsProblem,
} from "@/lib/ai/attachments";
import { TEMPLATES } from "@/lib/templates";
import { DiagramCategory, LayoutDirection } from "@/lib/types";

/**
 * Tingraph AI's one endpoint.
 *
 * The key never leaves the server, so the panel talks to this rather than to
 * Google. Two things happen here that could not happen in the browser: the
 * notation's whole briefing is folded into the system prompt without shipping
 * it to every reader, and the source that comes back is run through the
 * editor's own parser and layout before it is handed over — a reply that would
 * not draw is sent back to the model once with the parser's complaint, and
 * dropped if it fails again. What reaches the panel with a `source` on it is
 * always ready to generate.
 *
 * The lightest model in the family: this is a small, well-briefed writing job
 * with a schema on the end of it, and Flash-Lite thinks at `minimal` by
 * default, which is as cheap as it gets. Google retires a Flash-Lite for new
 * keys about as often as it ships one — 2.5 was gated within months — so the
 * name is overridable rather than something to come back and edit.
 */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
export const runtime = "nodejs";

/** How much conversation is carried back, and how much of one message. */
const TURNS = 8;
const CHARS = 4000;

interface Turn {
  role: "you" | "ai";
  text: string;
  source?: string;
}

interface Attachment {
  mimeType: string;
  data: string;
}

interface Ask {
  category: DiagramCategory;
  direction: LayoutDirection;
  /** the source in the editor, which is what a change is a change to */
  code: string;
  /** the whole conversation, the reader's newest message last */
  turns: Turn[];
}

/** A reply the panel can always render, whatever went wrong. */
function say(message: string, source = "", status = 200): Response {
  return Response.json({ message, source } satisfies AiReply, { status });
}

function readAsk(body: unknown): Ask | null {
  const ask = body as Partial<Ask> | null;
  if (
    !ask ||
    typeof ask.category !== "string" ||
    !(ask.category in TEMPLATES) ||
    !Array.isArray(ask.turns) ||
    ask.turns.length === 0
  ) {
    return null;
  }
  return {
    category: ask.category as DiagramCategory,
    direction: ask.direction === "right" ? "right" : "down",
    code: typeof ask.code === "string" ? ask.code.slice(0, CHARS) : "",
    turns: ask.turns
      .slice(-TURNS)
      .filter((turn) => turn && typeof turn.text === "string")
      .map((turn) => ({
        role: turn.role === "ai" ? "ai" : "you",
        text: turn.text.slice(0, CHARS),
        source: typeof turn.source === "string" ? turn.source.slice(0, CHARS) : undefined,
      })),
  };
}

/**
 * The conversation, said the way `generateContent` asks for it. A turn of the
 * model's is given back as the JSON object it actually emitted, so a diagram
 * it wrote but the reader has not drawn yet is still there to be changed.
 */
function contents(turns: Turn[], attachments: Attachment[]) {
  return turns.map((turn, index) => ({
    role: turn.role === "ai" ? "model" : "user",
    parts: [
      {
        text:
          turn.role === "ai"
            ? JSON.stringify({ message: turn.text, source: turn.source ?? "" })
            : turn.text,
      },
      ...(turn.role === "you" && index === turns.length - 1
        ? attachments.map((attachment) => ({ inlineData: attachment }))
        : []),
    ],
  }));
}

type Part = { text?: string; inlineData?: Attachment };
type Reply = {
  candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>;
  error?: { message?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

/** One call. Throws with something worth showing the reader when it fails. */
async function ask(
  key: string,
  system: string,
  body: ReturnType<typeof contents>,
  attempt: "initial" | "retry",
): Promise<AiReply> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: body,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
        responseSchema: REPLY_SCHEMA,
      },
    }),
  });

  const json = (await response.json().catch(() => null)) as Reply | null;
  console.info(
    `Tingraph AI token usage ${JSON.stringify({
      model: MODEL,
      attempt,
      status: response.status,
      inputTokens: json?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: json?.usageMetadata?.candidatesTokenCount ?? null,
      thoughtTokens: json?.usageMetadata?.thoughtsTokenCount ?? null,
      totalTokens: json?.usageMetadata?.totalTokenCount ?? null,
    })}`,
  );
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Gemini answered ${response.status}.`);
  }
  const text = json?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("");
  if (!text) {
    throw new Error("Gemini answered with nothing.");
  }
  const parsed = JSON.parse(text) as Partial<AiReply>;
  return {
    message: typeof parsed.message === "string" ? parsed.message.trim() : "",
    source: typeof parsed.source === "string" ? unfence(parsed.source) : "",
  };
}

/** Converts browser-uploaded files only after their type and size are bounded. */
async function readAttachments(form: FormData): Promise<Attachment[] | null> {
  const files = form.getAll("attachments");
  let totalBytes = 0;
  const attachments: Attachment[] = [];

  for (const entry of files) {
    if (!(entry instanceof File)) {
      return null;
    }
    const mimeType = entry.type.toLowerCase();
    if (attachmentProblem(mimeType, entry.size)) {
      return null;
    }
    totalBytes += entry.size;
    if (attachmentsProblem(files.length, totalBytes)) {
      return null;
    }
    attachments.push({
      mimeType,
      data: Buffer.from(await entry.arrayBuffer()).toString("base64"),
    });
  }

  return attachments;
}

export async function POST(request: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return say(
      "Tingraph AI is not set up yet: GEMINI_API_KEY is missing from the server. Put a key in .env.local and restart the dev server.",
      "",
      503,
    );
  }

  const form = await request.formData().catch(() => null);
  const askField = form?.get("ask");
  let body: unknown = null;
  if (typeof askField === "string") {
    try {
      body = JSON.parse(askField);
    } catch {
      // malformed multipart fields are a bad request, not a route failure
    }
  }
  const input = readAsk(body);
  const attachments = form ? await readAttachments(form).catch(() => null) : null;
  if (!input || !attachments) {
    return say("That message did not come through. Try sending it again.", "", 400);
  }

  const system = systemPrompt(input.category, input.code);
  const turns = contents(input.turns, attachments);

  let reply: AiReply;
  try {
    reply = await ask(key, system, turns, "initial");
  } catch (cause) {
    return say(
      `Tingraph AI could not answer: ${cause instanceof Error ? cause.message : String(cause)}`,
      "",
      502,
    );
  }

  if (!reply.source) {
    return say(reply.message || "I have nothing to draw for that.");
  }

  // the reply has to survive the editor's own parser and layout, or it is not
  // ready to generate however good it looks
  let complaint = refuses(reply.source, input.direction);
  if (complaint) {
    try {
      const second = await ask(
        key,
        system,
        [
          ...turns,
          { role: "model", parts: [{ text: JSON.stringify(reply) }] },
          { role: "user", parts: [{ text: retryPrompt(reply.source, complaint) }] },
        ],
        "retry",
      );
      complaint = second.source ? refuses(second.source, input.direction) : "nothing came back";
      if (!complaint) {
        return say(second.message || reply.message, second.source);
      }
    } catch {
      // the second call failing is the same outcome as it not helping
    }
  }

  return complaint
    ? say(
        `${reply.message}\n\nI could not write that as source the editor will draw — ${complaint}. Try describing it a little differently.`,
      )
    : say(reply.message, reply.source);
}
