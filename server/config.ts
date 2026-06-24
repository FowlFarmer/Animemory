import "dotenv/config";

export const config = {
  appOrigin: process.env.APP_ORIGIN ?? "http://127.0.0.1:5173",
  port: Number(process.env.PORT ?? 8787),
  isProduction: process.env.NODE_ENV === "production",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"
  },
  mal: {
    clientId: process.env.MAL_CLIENT_ID,
    clientSecret: process.env.MAL_CLIENT_SECRET,
    redirectUri:
      process.env.MAL_REDIRECT_URI ?? "http://127.0.0.1:8787/auth/mal/callback"
  },
  anilist: {
    clientId: process.env.ANILIST_CLIENT_ID,
    clientSecret: process.env.ANILIST_CLIENT_SECRET,
    redirectUri:
      process.env.ANILIST_REDIRECT_URI ??
      "http://127.0.0.1:8787/auth/anilist/callback"
  },
  session: {
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
    encryptionKey: process.env.SESSION_ENCRYPTION_KEY
  }
};
