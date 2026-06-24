import "dotenv/config";

function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return /^(1|true|yes)$/i.test(value.trim());
}

export const config = {
  appOrigin: process.env.APP_ORIGIN ?? "http://127.0.0.1:5173",
  port: Number(process.env.PORT ?? 8787),
  isProduction: process.env.NODE_ENV === "production",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite",
    // Off by default while testing the deterministic fallback parser.
    disabled: envFlag(process.env.GEMINI_DISABLED, true)
  },
  mal: {
    clientId: process.env.MAL_CLIENT_ID,
    clientSecret: process.env.MAL_CLIENT_SECRET,
    redirectUri:
      process.env.MAL_REDIRECT_URI ?? "http://127.0.0.1:8787/api/auth/mal/callback"
  },
  anilist: {
    clientId: process.env.ANILIST_CLIENT_ID,
    clientSecret: process.env.ANILIST_CLIENT_SECRET,
    redirectUri:
      process.env.ANILIST_REDIRECT_URI ??
      "http://127.0.0.1:8787/api/auth/anilist/callback"
  }
};

export function isGeminiParserEnabled(): boolean {
  return Boolean(config.gemini.apiKey && !config.gemini.disabled);
}
