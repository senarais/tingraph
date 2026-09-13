import { computeLayout } from "@/lib/layout/compute-layout";
import { parseDSL } from "@/lib/parser/parse-dsl";
import { briefingFor, KEYWORD, NOTATION_NAME } from "@/lib/guide";
import { DSLError, DiagramCategory, LayoutDirection } from "@/lib/types";

/**
 * Tingraph AI, in one file: what it is told, what it must answer with, and
 * what "ready to generate" is checked against.
 *
 * The chatbot answers twice over. `message` is the sentence the reader sees in
 * the panel; `source` is the whole diagram, written in the notation the sheet
 * is already in, so pressing Generate on it draws — there is no step between
 * the reply and the sheet. Everything the model knows about the language comes
 * from `briefingFor`, which is the same description the syntax guide draws its
 * tables from, so the chatbot can never drift from the language.
 */

export interface AiReply {
  /** one or two sentences for the reader */
  message: string;
  /** the whole diagram as Tingraph source, or empty when there is none */
  source: string;
}

/** One line of the conversation, as the panel keeps it. */
export interface AiTurn {
  role: "you" | "ai";
  text: string;
}

/** The two fields, said the way the Gemini API asks for a schema. */
export const REPLY_SCHEMA = {
  type: "OBJECT",
  properties: {
    message: {
      type: "STRING",
      description: "One or two short sentences for the reader. Plain prose.",
    },
    source: {
      type: "STRING",
      description: "The whole diagram as Tingraph source, or an empty string.",
    },
  },
  required: ["message", "source"],
  propertyOrdering: ["message", "source"],
};

/**
 * What the model is told before every message.
 *
 * The source on the sheet goes in here rather than into the conversation: it
 * is whatever the reader has *now*, which a turn from three messages ago would
 * misreport, and a change is nearly always a change to that rather than to
 * anything the model wrote.
 */
export function systemPrompt(category: DiagramCategory, code: string): string {
  const keyword = KEYWORD[category];
  return [
    `You are Tingraph AI, the assistant inside the Tingraph diagram editor. The sheet in front of the reader is a ${NOTATION_NAME[category]}, and what you write is drawn straight onto it.`,
    "",
    briefingFor(category),
    "",
    "THE SOURCE ON THE SHEET RIGHT NOW",
    code.trim() || "(the sheet is empty)",
    "",
    "ANSWER",
    "- `message`: one or two short sentences for the reader, in the language they wrote in. Plain prose — no code, no markdown, no fences, and never the source repeated back.",
    `- \`source\`: the whole diagram as Tingraph source — one \`${keyword} "…" { … }\` block, nothing before it and nothing after it, no fences and no commentary.`,
    "- Write the whole diagram every time. The sheet is redrawn from `source`, so a fragment would throw the rest of the drawing away.",
    "- A change means the source above with that one change made. Keep every other element, id and label exactly as it is.",
    "- Do not invent keywords or settings: use only the ones listed under SYNTAX.",
    "- Keep labels short enough to read inside a box, and keep every id unique.",
    `- ${keyword} is the only notation this sheet can draw. If the reader asks for another one, say so in \`message\` and leave \`source\` empty.`,
    "- When there is nothing to draw — a greeting, a question about the language — leave `source` empty and answer in `message`.",
  ].join("\n");
}

/**
 * Whether a reply really is ready to generate: the same parse and layout the
 * editor runs before it draws, so anything that passes here draws there.
 * Returns the complaint to hand back to the model, or null when it is good.
 */
export function refuses(source: string, direction: LayoutDirection): string | null {
  try {
    computeLayout(parseDSL(source), direction);
    return null;
  } catch (cause) {
    if (cause instanceof DSLError) {
      return `line ${cause.line}: ${cause.message}`;
    }
    return cause instanceof Error ? cause.message : String(cause);
  }
}

/**
 * What the model is told when its first attempt would not draw. It is handed
 * back its own source with the parser's own words, which is far more use to it
 * than being asked to try again.
 */
export function retryPrompt(source: string, complaint: string): string {
  return [
    "That source does not parse, so it cannot be drawn. The parser says:",
    complaint,
    "",
    "This is what you wrote:",
    source,
    "",
    "Write the whole diagram again, fixed. Keep `message` as it was.",
  ].join("\n");
}

/** Fences the model may add despite being told not to, taken back off. */
export function unfence(source: string): string {
  const fenced = source.trim().match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : source).trim();
}
