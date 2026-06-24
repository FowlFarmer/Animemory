import { z } from "zod";
import { config, isGeminiParserEnabled } from "../config.js";
import type { ParsedAnimeEntry } from "../types.js";
import {
  inferProgress,
  inferScore,
  inferStatus,
  inferYear,
  roughTitleFromLine
} from "../lib/text.js";

const parsedEntrySchema = z.object({
  title: z.string().min(1),
  raw: z.string().optional(),
  year: z.number().int().min(1960).max(2049).optional(),
  status: z
    .enum(["current", "planning", "completed", "paused", "dropped", "repeating"])
    .optional(),
  score: z.number().min(0).max(10).optional(),
  progress: z.number().int().min(0).optional(),
  notes: z.string().optional()
});

const parsedSchema = z.array(parsedEntrySchema);

export type ParseParser = "gemini" | "fallback";

export type ParseParserReason =
  | "no_api_key"
  | "gemini_disabled"
  | "gemini_empty"
  | "gemini_error";

export type ParseAnimeListResult = {
  entries: ParsedAnimeEntry[];
  parser: ParseParser;
  reason?: ParseParserReason;
};

export async function parseAnimeList(text: string): Promise<ParseAnimeListResult> {
  const trimmed = text.trim();
  if (!trimmed) return { entries: [], parser: "fallback" };

  if (isGeminiParserEnabled()) {
    try {
      const geminiParsed = await parseWithGemini(trimmed);
      if (geminiParsed.length) {
        console.log(`[parse] parser=gemini entries=${geminiParsed.length}`);
        return { entries: geminiParsed, parser: "gemini" };
      }
      console.log("[parse] parser=fallback reason=gemini_empty");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[parse] parser=fallback reason=gemini_error message=${message}`);
      const entries = parseDeterministically(trimmed);
      console.log(`[parse] parser=fallback entries=${entries.length}`);
      return { entries, parser: "fallback", reason: "gemini_error" };
    }
  } else if (config.gemini.disabled) {
    console.log("[parse] parser=fallback reason=gemini_disabled");
  } else {
    console.log("[parse] parser=fallback reason=no_api_key");
  }

  const entries = parseDeterministically(trimmed);
  console.log(`[parse] parser=fallback entries=${entries.length}`);
  return {
    entries,
    parser: "fallback",
    reason: config.gemini.disabled
      ? "gemini_disabled"
      : config.gemini.apiKey
        ? "gemini_empty"
        : "no_api_key"
  };
}

function parseDeterministically(text: string): ParsedAnimeEntry[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw, index) => ({
      id: `parsed-${index + 1}`,
      raw,
      title: roughTitleFromLine(raw),
      year: inferYear(raw),
      status: inferStatus(raw) as ParsedAnimeEntry["status"],
      score: inferScore(raw),
      progress: inferProgress(raw)
    }))
    .filter((entry) => entry.title.length > 0);
}

async function parseWithGemini(text: string): Promise<ParsedAnimeEntry[]> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "x-goog-api-key": config.gemini.apiKey!,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.gemini.model,
      input: [
        "Extract anime list entries from the text below.",
        "Return an array of objects. Preserve each original source line in raw.",
        "Status must be current, planning, completed, paused, dropped, or repeating.",
        "Scores are 0 through 10. Do not invent entries or fields.",
        "Input:",
        text
      ].join("\n\n"),
      response_format: [
        {
          type: "text",
          mime_type: "application/json",
          schema: animeEntryJsonSchema
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini parse failed: ${response.status}`);
  }

  const json = (await response.json()) as GeminiInteractionResponse;
  if (json.status && json.status !== "completed") {
    throw new Error(`Gemini interaction status=${json.status}`);
  }

  const rawText =
    json.output_text ??
    json.outputText ??
    extractModelOutputText(json.steps) ??
    extractModelOutputText(json.output);

  if (!rawText.trim()) {
    throw new Error(
      `Gemini returned no text output (status=${json.status ?? "unknown"}, steps=${json.steps?.length ?? 0})`
    );
  }

  const parsed = parsedSchema.parse(JSON.parse(rawText));

  return parsed.map((entry, index) => ({
    id: `parsed-${index + 1}`,
    raw: entry.raw ?? entry.title,
    ...entry
  }));
}

type GeminiInteractionStep = {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type GeminiInteractionResponse = {
  status?: string;
  output_text?: string;
  outputText?: string;
  output?: GeminiInteractionStep[];
  steps?: GeminiInteractionStep[];
};

function extractModelOutputText(steps: unknown): string {
  if (!Array.isArray(steps)) return "";

  const modelSteps = steps.filter(
    (step): step is GeminiInteractionStep =>
      typeof step === "object" && step !== null && (step as GeminiInteractionStep).type === "model_output"
  );
  const lastStep = modelSteps.at(-1);
  if (!lastStep?.content) return "";

  return lastStep.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("");
}

const animeEntryJsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      raw: { type: "string" },
      year: { type: "integer", minimum: 1960, maximum: 2049 },
      status: {
        type: "string",
        enum: ["current", "planning", "completed", "paused", "dropped", "repeating"]
      },
      score: { type: "number", minimum: 0, maximum: 10 },
      progress: { type: "integer", minimum: 0 },
      notes: { type: "string" }
    },
    required: ["title"]
  }
};
