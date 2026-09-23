import "server-only";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
import { parsePlannerJson } from "@/lib/shot-plan";
import { cleanupPunctuation } from "@/lib/tts-punctuation";
import {
  DIRECTOR_EMOTIONS,
  DIRECTOR_PACES,
  registerBand,
} from "@/config/tts-director";
import type { TtsDirectorCampaignContext, TtsPhoneticEntry } from "@/lib/types";

/**
 * VO Director's LLM layer. Same dual-provider pattern as transcript-ai.ts:
 * OpenAI when configured, otherwise ModelArk; structured output via
 * "Return ONLY JSON" system prompts + parsePlannerJson (no function-calling,
 * no zod — nothing in this codebase uses either).
 */

class TtsDirectorAiError extends Error {}

export function ttsDirectorAiConfigured(): boolean {
  return openaiConfigured() || Boolean(process.env.ARK_API_KEY?.trim());
}

async function chat(opts: {
  messages: { role: "system" | "user"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const providers = openaiConfigured() ? [openaiChat] : [arkChat];
  let firstError: Error | null = null;
  for (const provider of providers) {
    try {
      const text = await provider(opts);
      if (text) return text;
    } catch (err) {
      firstError ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  throw firstError ?? new TtsDirectorAiError("No text model responded");
}

function tokenBudget(text: string): number {
  return Math.min(2000 + Math.ceil(text.length / 50), 8000);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min = 0, max = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function coerceEmotion(value: unknown): string {
  const s = asString(value).toLowerCase();
  return (DIRECTOR_EMOTIONS as readonly string[]).includes(s) ? s : "neutral";
}

function coercePace(value: unknown): "slow" | "normal" | "fast" {
  const s = asString(value).toLowerCase();
  return (DIRECTOR_PACES as readonly string[]).includes(s)
    ? (s as "slow" | "normal" | "fast")
    : "normal";
}

function coerceAvoid(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string").slice(0, 6);
}

// --- Pass 1: whole-script direction --------------------------------------

export type DirectionSegment = {
  original: string;
  emotion: string;
  intensity: number;
  pace: "slow" | "normal" | "fast";
  continuity: string;
  avoid: string[];
  suggestedStability: number;
  suggestedSpeed: number;
};

export type DirectionResult = {
  overallDirection: { dialect: string; register: string; emotional_arc: string };
  segments: DirectionSegment[];
};

const DIRECTION_SYSTEM = [
  "You are a VO director reading a full Arabic voice-over script before any",
  "line is touched — read the WHOLE script and the campaign context first, so",
  "every segment's direction is contextual, not isolated.",
  "Segment the script into natural performance beats: merge short fragments",
  "that are one thought, split long compounds — do NOT naively split on every",
  "sentence period. Each segment's `original` must be copied VERBATIM from",
  "the input, concatenated in order must reproduce the input.",
  `emotion must be exactly one of: ${DIRECTOR_EMOTIONS.join(", ")}.`,
  "intensity is 0.0-1.0. pace is slow, normal, or fast. continuity is a short",
  "phrase describing how this beat relates to the previous one (e.g.",
  "'response_to_previous_line', 'open_thought', 'new_topic'). avoid is a short",
  "list of performance notes on what NOT to do (e.g. 'defensive', 'triumphant').",
  "suggested_stability is 0.0-1.0 (higher = steadier/less expressive delivery).",
  "suggested_speed is a rate multiplier around 1.0 — never below 0.7 or above 1.2.",
  'Return ONLY JSON: {"overall_direction":{"dialect":"emirati","register":"…",',
  '"emotional_arc":"short phrase describing the arc, e.g. reflective > proud > warm"},',
  '"segments":[{"original":"…","emotion":"…","intensity":0.0,"pace":"…",',
  '"continuity":"…","avoid":["…"],"suggested_stability":0.0,"suggested_speed":1.0}]}',
].join(" ");

export async function runDirectionPass(
  originalText: string,
  campaignContext: TtsDirectorCampaignContext
): Promise<DirectionResult> {
  const contextLines = [
    campaignContext.speaker && `Speaker: ${campaignContext.speaker}`,
    campaignContext.audience && `Audience: ${campaignContext.audience}`,
    campaignContext.intention && `Intention: ${campaignContext.intention}`,
    campaignContext.notes && `Notes: ${campaignContext.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat({
    messages: [
      { role: "system", content: DIRECTION_SYSTEM },
      {
        role: "user",
        content: `${contextLines ? `Campaign context:\n${contextLines}\n\n` : ""}Script:\n${originalText}`,
      },
    ],
    temperature: 0.3,
    maxTokens: tokenBudget(originalText),
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parsePlannerJson(raw) as Record<string, unknown>;
  } catch {
    throw new TtsDirectorAiError("Could not read the script direction — try again");
  }

  const od = (parsed.overall_direction ?? {}) as Record<string, unknown>;
  const segments = (Array.isArray(parsed.segments) ? parsed.segments : [])
    .map((s) => {
      const o = s as Record<string, unknown>;
      return {
        original: asString(o.original),
        emotion: coerceEmotion(o.emotion),
        intensity: asNumber(o.intensity, 0.5),
        pace: coercePace(o.pace),
        continuity: asString(o.continuity),
        avoid: coerceAvoid(o.avoid),
        suggestedStability: asNumber(o.suggested_stability, 0.5),
        // Clamped to Munsit's actual accepted range (MIN_SPEED/MAX_SPEED in
        // config/tts.ts) — the model sometimes suggests outside it, which
        // Munsit rejects outright rather than clamping itself.
        suggestedSpeed: asNumber(o.suggested_speed, 1.0, 0.7, 1.2),
      };
    })
    .filter((s) => s.original.length > 0);

  if (segments.length === 0) {
    throw new TtsDirectorAiError("The direction pass returned no segments");
  }

  return {
    overallDirection: {
      dialect: asString(od.dialect, "emirati"),
      register: asString(od.register),
      emotional_arc: asString(od.emotional_arc),
    },
    segments,
  };
}

// --- Pass 2: written -> spoken dialect adaptation ------------------------

function dialectSystemPrompt(registerStrength: number): string {
  const band = registerBand(registerStrength);
  const bandRule =
    band === "light"
      ? "Register is LIGHT — stay close to the written form. Adapt only unavoidable spoken contractions."
      : band === "strong"
        ? "Register is STRONG — full colloquial Emirati, natural spoken word choices throughout."
        : "Register is MEDIUM — natural conversational Gulf Arabic, not full slang, not stiff MSA.";

  return [
    "You adapt written Arabic into natural spoken Emirati, one line at a time,",
    "for a voice-over. You are given each line's emotion/pace/continuity from a",
    "prior direction pass — use it for context, do not repeat it.",
    bandRule,
    "HARD RULE: never substitute a word purely to make the dialect more",
    "obvious — only where a real Emirati speaker performing this exact",
    "register would actually say it that way. A prestigious/formal line can",
    "stay closer to written Arabic even at a higher register-strength setting",
    "if that reads better; if that tension exists, say so in register_note.",
    "Preserve names, numbers, and quoted text verbatim. Never drop or add content.",
    "Output exactly one line per input line, same order, numbered from 1.",
    'Return ONLY JSON: {"lines":[{"n":1,"spoken":"…","register_note":"…"}]}',
    "register_note is a short string, empty when there's nothing to flag.",
  ].join(" ");
}

export async function runDialectPass(
  segments: { original: string; emotion: string; pace: string; continuity: string }[],
  overallRegister: string,
  registerStrength: number
): Promise<{ spoken: string; registerNote: string }[]> {
  const numbered = segments
    .map(
      (s, i) =>
        `${i + 1}. [${s.emotion}, ${s.pace}, ${s.continuity || "n/a"}] ${s.original}`
    )
    .join("\n");

  const raw = await chat({
    messages: [
      { role: "system", content: dialectSystemPrompt(registerStrength) },
      {
        role: "user",
        content: `Overall register: ${overallRegister || "natural"}\n\nLines:\n${numbered}`,
      },
    ],
    temperature: 0.3,
    maxTokens: tokenBudget(numbered) + 500,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parsePlannerJson(raw) as Record<string, unknown>;
  } catch {
    throw new TtsDirectorAiError("Could not read the dialect adaptation — try again");
  }

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const byIndex = new Map<number, { spoken: string; registerNote: string }>();
  for (const line of lines) {
    const l = line as Record<string, unknown>;
    const n = Number(l.n);
    if (!Number.isFinite(n)) continue;
    byIndex.set(n, { spoken: asString(l.spoken), registerNote: asString(l.register_note) });
  }

  return segments.map((s, i) => byIndex.get(i + 1) ?? { spoken: s.original, registerNote: "" });
}

// --- Pass 3: phonetic adaptation for Faseeh ------------------------------

function phoneticSystemPrompt(dictionary: TtsPhoneticEntry[]): string {
  const entries = dictionary
    .map((e) => `${e.canonical} -> ${e.respelling}`)
    .join("\n");
  return [
    "You adjust Arabic text purely for TTS pronunciation — never restyle,",
    "reword, or change meaning; only respell words that a TTS engine mispronounces.",
    "This is a known-good pronunciation dictionary for the words that appear",
    "in this script (canonical -> respelling). If you use one of these words,",
    "you MUST respell it EXACTLY as given here — never invent a different",
    "respelling for a word already in this list:",
    entries || "(no known dictionary entries apply to this script)",
    "You may propose NEW respellings for words not in that list if you have",
    "strong reason to believe Faseeh mispronounces them — report those",
    "separately as new_mappings, never blend them silently into the main text",
    "without also reporting them.",
    "Do not touch punctuation or add <break> tags in this pass.",
    "Output exactly one line per input line, same order, numbered from 1.",
    'Return ONLY JSON: {"lines":[{"n":1,"tts":"…",',
    '"applied":[{"canonical":"…","respelling":"…"}],',
    '"new_mappings":[{"canonical":"…","respelling":"…","reason":"…"}]}]}',
    "applied/new_mappings are empty arrays when nothing changed.",
  ].join(" ");
}

export type PhoneticLineResult = {
  tts: string;
  applied: { canonical: string; respelling: string }[];
  newMappings: { canonical: string; respelling: string; reason: string }[];
};

export async function runPhoneticPass(
  spokenLines: string[],
  dictionary: TtsPhoneticEntry[]
): Promise<PhoneticLineResult[]> {
  const numbered = spokenLines.map((s, i) => `${i + 1}. ${s}`).join("\n");

  const raw = await chat({
    messages: [
      { role: "system", content: phoneticSystemPrompt(dictionary) },
      { role: "user", content: `Lines:\n${numbered}` },
    ],
    temperature: 0.1,
    maxTokens: tokenBudget(numbered) + 500,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parsePlannerJson(raw) as Record<string, unknown>;
  } catch {
    throw new TtsDirectorAiError("Could not read the phonetic adaptation — try again");
  }

  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const byIndex = new Map<number, PhoneticLineResult>();
  for (const line of lines) {
    const l = line as Record<string, unknown>;
    const n = Number(l.n);
    if (!Number.isFinite(n)) continue;
    byIndex.set(n, {
      tts: asString(l.tts),
      applied: (Array.isArray(l.applied) ? l.applied : [])
        .map((a) => {
          const o = a as Record<string, unknown>;
          return { canonical: asString(o.canonical), respelling: asString(o.respelling) };
        })
        .filter((a) => a.canonical),
      newMappings: (Array.isArray(l.new_mappings) ? l.new_mappings : [])
        .map((m) => {
          const o = m as Record<string, unknown>;
          return {
            canonical: asString(o.canonical),
            respelling: asString(o.respelling),
            reason: asString(o.reason),
          };
        })
        .filter((m) => m.canonical && m.respelling),
    });
  }

  return spokenLines.map(
    (s, i) => byIndex.get(i + 1) ?? { tts: s, applied: [], newMappings: [] }
  );
}

// --- Quick Optimize: merged single pass ----------------------------------

export type QuickOptimizeSegment = DirectionSegment & {
  spoken: string;
  tts: string;
  phoneticApplied: { canonical: string; respelling: string }[];
  phoneticNewMappings: { canonical: string; respelling: string; reason: string }[];
};

export type QuickOptimizeResult = {
  overallDirection: { dialect: string; register: string; emotional_arc: string };
  segments: QuickOptimizeSegment[];
};

function quickSystemPrompt(registerStrength: number, dictionary: TtsPhoneticEntry[]): string {
  const band = registerBand(registerStrength);
  const bandRule =
    band === "light"
      ? "Register is LIGHT — stay close to the written form."
      : band === "strong"
        ? "Register is STRONG — full colloquial Emirati."
        : "Register is MEDIUM — natural conversational Gulf Arabic.";
  const entries = dictionary.map((e) => `${e.canonical} -> ${e.respelling}`).join("\n");

  return [
    "You are a VO director doing a single fast pass over a whole Arabic",
    "voice-over script: read it all first, then for each segment produce",
    "performance direction AND a spoken-Emirati AND TTS-ready adaptation.",
    "Segment into natural performance beats — do not naively split on every",
    "sentence period. `original` must be copied VERBATIM from the input.",
    "`spoken` adapts written Arabic to natural spoken Emirati.",
    bandRule,
    "Never substitute a word purely to sound more dialect — only where the",
    "register actually calls for it.",
    "`tts` further respells only for TTS pronunciation (no restyling). Known",
    "pronunciation fixes for words in this script — use these exact",
    "respellings if the word appears:",
    entries || "(none apply)",
    `emotion must be exactly one of: ${DIRECTOR_EMOTIONS.join(", ")}. intensity 0.0-1.0.`,
    "pace is slow, normal, or fast. Preserve names/numbers/quotes verbatim.",
    "suggested_speed is a rate multiplier around 1.0 — never below 0.7 or above 1.2.",
    'Return ONLY JSON: {"overall_direction":{"dialect":"emirati","register":"…",',
    '"emotional_arc":"…"},"segments":[{"original":"…","spoken":"…","tts":"…",',
    '"emotion":"…","intensity":0.0,"pace":"…","continuity":"…","avoid":["…"],',
    '"suggested_stability":0.0,"suggested_speed":1.0,',
    '"phonetic_applied":[{"canonical":"…","respelling":"…"}]}]}',
  ].join(" ");
}

export async function runQuickOptimize(
  originalText: string,
  campaignContext: TtsDirectorCampaignContext,
  registerStrength: number,
  dictionary: TtsPhoneticEntry[]
): Promise<QuickOptimizeResult> {
  const contextLines = [
    campaignContext.speaker && `Speaker: ${campaignContext.speaker}`,
    campaignContext.audience && `Audience: ${campaignContext.audience}`,
    campaignContext.intention && `Intention: ${campaignContext.intention}`,
    campaignContext.notes && `Notes: ${campaignContext.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chat({
    messages: [
      { role: "system", content: quickSystemPrompt(registerStrength, dictionary) },
      {
        role: "user",
        content: `${contextLines ? `Campaign context:\n${contextLines}\n\n` : ""}Script:\n${originalText}`,
      },
    ],
    temperature: 0.3,
    maxTokens: tokenBudget(originalText) + 800,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parsePlannerJson(raw) as Record<string, unknown>;
  } catch {
    throw new TtsDirectorAiError("Could not read the optimized script — try again");
  }

  const od = (parsed.overall_direction ?? {}) as Record<string, unknown>;
  const segments = (Array.isArray(parsed.segments) ? parsed.segments : [])
    .map((s) => {
      const o = s as Record<string, unknown>;
      const original = asString(o.original);
      const spoken = asString(o.spoken, original);
      const rawTts = asString(o.tts, spoken);
      const cleaned = cleanupPunctuation(rawTts);
      return {
        original,
        spoken,
        tts: cleaned.text,
        emotion: coerceEmotion(o.emotion),
        intensity: asNumber(o.intensity, 0.5),
        pace: coercePace(o.pace),
        continuity: asString(o.continuity),
        avoid: coerceAvoid(o.avoid),
        suggestedStability: asNumber(o.suggested_stability, 0.5),
        // Clamped to Munsit's actual accepted range (MIN_SPEED/MAX_SPEED in
        // config/tts.ts) — the model sometimes suggests outside it, which
        // Munsit rejects outright rather than clamping itself.
        suggestedSpeed: asNumber(o.suggested_speed, 1.0, 0.7, 1.2),
        phoneticApplied: (Array.isArray(o.phonetic_applied) ? o.phonetic_applied : [])
          .map((a) => {
            const p = a as Record<string, unknown>;
            return { canonical: asString(p.canonical), respelling: asString(p.respelling) };
          })
          .filter((a) => a.canonical),
        phoneticNewMappings: [] as { canonical: string; respelling: string; reason: string }[],
      };
    })
    .filter((s) => s.original.length > 0);

  if (segments.length === 0) {
    throw new TtsDirectorAiError("Quick Optimize returned no segments");
  }

  return {
    overallDirection: {
      dialect: asString(od.dialect, "emirati"),
      register: asString(od.register),
      emotional_arc: asString(od.emotional_arc),
    },
    segments,
  };
}
