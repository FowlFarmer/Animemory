import { z } from "zod";
import { config } from "../config.js";
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

export async function parseAnimeList(text: string): Promise<ParsedAnimeEntry[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (config.gemini.apiKey) {
    const geminiParsed = await parseWithGemini(trimmed).catch(() => null);
    if (geminiParsed?.length) return geminiParsed;
  }

  return parseDeterministically(trimmed);
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
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: animeEntryJsonSchema
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini parse failed: ${response.status}`);
  }

  const json = (await response.json()) as { output_text?: string; outputText?: string; output?: unknown };
  const rawText = json.output_text ?? json.outputText ?? collectOutputText(json.output);
  const parsed = parsedSchema.parse(JSON.parse(rawText));

  return parsed.map((entry, index) => ({
    id: `parsed-${index + 1}`,
    raw: entry.raw ?? entry.title,
    ...entry
  }));
}

function collectOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) =>
      Array.isArray((item as { content?: unknown[] }).content)
        ? ((item as { content: Array<{ text?: string }> }).content ?? []).map(
            (content) => content.text ?? ""
          )
        : []
    )
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
