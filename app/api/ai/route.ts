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
import { createClient } from "@/lib/supabase/server";

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
const TOKENS_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:countTokens`;
const MAX_OUTPUT_TOKENS = 1000;
const MIN_OUTPUT_TOKENS = 256;
const MAX_INPUT_TOKENS = 3000;
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

class AiQuotaError extends Error {}
class AiInputLimitError extends Error {}

function generationRequest(
  system: string,
  body: ReturnType<typeof contents>,
  maxOutputTokens: number,
) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: body,
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: REPLY_SCHEMA,
    },
  };
}

async function inputTokens(
  key: string,
  request: ReturnType<typeof generationRequest>,
): Promise<number> {
  const response = await fetch(TOKENS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      generateContentRequest: { model: `models/${MODEL}`, ...request },
    }),
  });
  const json = (await response.json().catch(() => null)) as
    | { totalTokens?: number; error?: { message?: string } }
    | null;
  if (!response.ok || !Number.isSafeInteger(json?.totalTokens) || (json?.totalTokens ?? 0) <= 0) {
    throw new Error(json?.error?.message ?? "Gemini could not count this request's tokens.");
  }
  return json!.totalTokens!;
}

async function reserveTokens(
  supabase: Supabase,
  key: string,
  system: string,
  body: ReturnType<typeof contents>,
) {
  const counted = await inputTokens(
    key,
    generationRequest(system, body, MAX_OUTPUT_TOKENS),
  );
  if (counted > MAX_INPUT_TOKENS) {
    throw new AiInputLimitError(
      "This request is too long. Keep the input under 3,000 tokens and try again.",
    );
  }

  const reserve = async (tokens: number) =>
    supabase.rpc("reserve_ai_tokens", { p_tokens: tokens }).single();

  let output = MAX_OUTPUT_TOKENS;
  let held = await reserve(output);
  if (held.error || !held.data) {
    throw new Error("Tingraph AI token allowance could not be checked.");
  }

  if (!held.data.allowed || !held.data.reservation_id) {
    output = Math.min(MAX_OUTPUT_TOKENS, held.data.remaining);
    if (output < MIN_OUTPUT_TOKENS) {
      throw new AiQuotaError(
        "Your daily Tingraph AI token limit is reached, or this request is larger than the remaining allowance. It resets at 00:00 UTC.",
      );
    }
    held = await reserve(output);
    if (held.error || !held.data) {
      throw new Error("Tingraph AI token allowance could not be checked.");
    }
    if (!held.data.allowed || !held.data.reservation_id) {
      throw new AiQuotaError(
        "Your daily Tingraph AI token limit is reached. It resets at 00:00 UTC.",
      );
    }
  }

  return {
    id: held.data.reservation_id,
    tokens: output,
    maxOutputTokens: output,
  };
}

async function settleTokens(
  supabase: Supabase,
  reservation: { id: string; tokens: number },
  actual: number,
): Promise<void> {
  const { error } = await supabase.rpc("settle_ai_tokens", {
    p_reservation_id: reservation.id,
    p_tokens: actual,
  });
  if (error) {
    // Reservation remains charged at its safe upper bound and expires after 15 minutes.
    console.error("Tingraph AI token settlement failed", error.message);
  }
}

/** One call. Throws with something worth showing the reader when it fails. */
async function ask(
  supabase: Supabase,
  key: string,
  system: string,
  body: ReturnType<typeof contents>,
  attempt: "initial" | "retry",
): Promise<AiReply> {
  const reservation = await reserveTokens(supabase, key, system, body);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(generationRequest(system, body, reservation.maxOutputTokens)),
    });
  } catch (cause) {
    await settleTokens(supabase, reservation, 0);
    throw cause;
  }

  const json = (await response.json().catch(() => null)) as Reply | null;
  const prompt = json?.usageMetadata?.promptTokenCount;
  const total = json?.usageMetadata?.totalTokenCount;
  const actual =
    Number.isSafeInteger(prompt) && Number.isSafeInteger(total) && total! >= prompt!
      ? Math.min(total! - prompt!, reservation.tokens)
      : response.ok
        ? reservation.tokens
        : 0;
  await settleTokens(supabase, reservation, actual);
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return say("Sign up or sign in to use Tingraph AI.", "", 401);
  }

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
    reply = await ask(supabase, key, system, turns, "initial");
  } catch (cause) {
    if (cause instanceof AiInputLimitError) {
      return say(cause.message, "", 413);
    }
    if (cause instanceof AiQuotaError) {
      return say(cause.message, "", 429);
    }
    console.error("Tingraph AI initial request failed", cause);
    return say(
      "Tingraph AI could not answer right now. Try again.",
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
        supabase,
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
    } catch (cause) {
      if (cause instanceof AiInputLimitError) {
        return say(cause.message, "", 413);
      }
      if (cause instanceof AiQuotaError) {
        return say(cause.message, "", 429);
      }
      // the second call failing is the same outcome as it not helping
    }
  }

  return complaint
    ? say(
        `${reply.message}\n\nI could not write that as source the editor will draw — ${complaint}. Try describing it a little differently.`,
      )
    : say(reply.message, reply.source);
}
