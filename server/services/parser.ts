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

  if (config.openaiApiKey) {
    const llmParsed = await parseWithLlm(trimmed).catch(() => null);
    if (llmParsed?.length) return llmParsed;
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

async function parseWithLlm(text: string): Promise<ParsedAnimeEntry[]> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openaiModel,
      input: [
        {
          role: "system",
          content:
            "Extract anime list entries from messy text. Return only JSON: an array of objects with title, raw, optional year, status, score, progress, notes. Status must be one of current, planning, completed, paused, dropped, repeating. Scores are 0-10."
        },
        {
          role: "user",
          content: text
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI parse failed: ${response.status}`);
  }

  const json = (await response.json()) as { output_text?: string; output?: unknown };
  const rawText = json.output_text ?? collectOutputText(json.output);
  const parsed = parsedSchema.parse(JSON.parse(extractJson(rawText)));

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

function extractJson(value: string): string {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();

  const start = value.indexOf("[");
  const end = value.lastIndexOf("]");
  if (start >= 0 && end > start) return value.slice(start, end + 1);

  return value;
}
