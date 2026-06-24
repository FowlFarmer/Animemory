const STATUS_WORDS: Array<[RegExp, string]> = [
  [/\b(watching|current|started|airing)\b/i, "current"],
  [/\b(plan(?:ning)?|ptw|watchlist|to watch)\b/i, "planning"],
  [/\b(completed|complete|finished|done)\b/i, "completed"],
  [/\b(on hold|paused|hold)\b/i, "paused"],
  [/\b(dropped|drop)\b/i, "dropped"],
  [/\b(rewatching|rewatching|repeat(?:ing)?)\b/i, "repeating"]
];

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|season|s)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferStatus(raw: string): string | undefined {
  return STATUS_WORDS.find(([pattern]) => pattern.test(raw))?.[1];
}

export function inferScore(raw: string): number | undefined {
  const tenPoint = raw.match(/\b(10|[0-9](?:\.[0-9])?)\s*\/\s*10\b/i);
  if (tenPoint) return Number(tenPoint[1]);

  const labeled = raw.match(/\b(?:score|rating)\s*[:=-]?\s*(10|[0-9](?:\.[0-9])?)\b/i);
  if (labeled) return Number(labeled[1]);

  return undefined;
}

export function inferProgress(raw: string): number | undefined {
  const episode = raw.match(/\b(?:ep|eps|episode|episodes)\s*[:#-]?\s*(\d+)\b/i);
  if (episode) return Number(episode[1]);

  const seen = raw.match(/\b(\d+)\s*(?:ep|eps|episodes)\b/i);
  if (seen) return Number(seen[1]);

  return undefined;
}

export function inferYear(raw: string): number | undefined {
  const year = raw.match(/\b(19[6-9]\d|20[0-4]\d)\b/);
  return year ? Number(year[1]) : undefined;
}

export function roughTitleFromLine(raw: string): string {
  return raw
    .replace(/^\s*[-*•\d.)]+\s*/, "")
    .replace(/\b(?:ep|eps|episode|episodes)\s*[:#-]?\s*\d+\b/gi, "")
    .replace(/\b\d+\s*(?:ep|eps|episodes)\b/gi, "")
    .replace(/\b(?:score|rating)\s*[:=-]?\s*(?:10|[0-9](?:\.[0-9])?)\b/gi, "")
    .replace(/\b(?:10|[0-9](?:\.[0-9])?)\s*\/\s*10\b/gi, "")
    .replace(/\b(19[6-9]\d|20[0-4]\d)\b/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\b(plan to watch|to watch|on hold|watching|current|started|airing|planning|plan|ptw|watchlist|completed|complete|finished|done|paused|hold|dropped|drop|rewatching|repeat(?:ing)?)\b/gi, "")
    .replace(/\s*[-–—|,;:]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarity(left: string, right: string): number {
  const leftTrim = left.trim();
  const rightTrim = right.trim();
  if (leftTrim && leftTrim === rightTrim) return 1;
  if (leftTrim.toLowerCase() === rightTrim.toLowerCase()) return 1;

  const a = new Set(normalizeTitle(left).split(" ").filter(Boolean));
  const b = new Set(normalizeTitle(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }

  return overlap / Math.max(a.size, b.size);
}
