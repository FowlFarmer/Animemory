import express from "express";
import cookieParser from "cookie-parser";
import { z } from "zod";
import { config } from "./config.js";
import {
  clearProviderToken,
  finishOAuth,
  startOAuth,
  tokenForProvider
} from "./auth.js";
import { getProvider, providers } from "./providers/index.js";
import { matchEntries } from "./services/matcher.js";
import { parseAnimeList } from "./services/parser.js";
import type { ProviderId } from "./types.js";

const providerSchema = z.enum(["mal", "anilist"]);

const parseRequestSchema = z.object({
  text: z.string().min(1)
});

const matchRequestSchema = z.object({
  provider: providerSchema,
  entries: z.array(
    z.object({
      id: z.string(),
      raw: z.string(),
      title: z.string(),
      year: z.number().optional(),
      status: z
        .enum(["current", "planning", "completed", "paused", "dropped", "repeating"])
        .optional(),
      score: z.number().optional(),
      progress: z.number().optional(),
      notes: z.string().optional()
    })
  )
});

const applyRequestSchema = z.object({
  provider: providerSchema,
  selections: z.array(
    z.object({
      parsedId: z.string(),
      providerAnimeId: z.number(),
      status: z
        .enum(["current", "planning", "completed", "paused", "dropped", "repeating"])
        .optional(),
      score: z.number().optional(),
      progress: z.number().optional(),
      notes: z.string().optional()
    })
  )
});

const app = express();

app.set("trust proxy", 1);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/status", async (req, res, next) => {
  try {
    const connected = await Promise.all(
      Object.keys(providers).map(async (provider) => ({
        id: provider,
        connected: Boolean(await tokenForProvider(req, provider as ProviderId))
      }))
    );
    res.json({ providers: connected, gemini: Boolean(config.gemini.apiKey) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/parse", async (req, res, next) => {
  try {
    const body = parseRequestSchema.parse(req.body);
    const entries = await parseAnimeList(body.text);
    res.json({ entries });
  } catch (error) {
    next(error);
  }
});

app.post("/api/match", async (req, res, next) => {
  try {
    const body = matchRequestSchema.parse(req.body);
    const provider = getProvider(body.provider);
    const token = await tokenForProvider(req, body.provider);
    const matches = await matchEntries(provider, body.entries, token);
    res.json({ matches });
  } catch (error) {
    next(error);
  }
});

app.post("/api/apply", async (req, res, next) => {
  try {
    const body = applyRequestSchema.parse(req.body);
    const token = await tokenForProvider(req, body.provider);
    if (!token) {
      res.status(401).json({ error: "not_connected", message: "Connect this provider first." });
      return;
    }

    const provider = getProvider(body.provider);
    const results = [];

    for (const selection of body.selections) {
      try {
        const saved = await provider.saveAnimeEntry(selection, token);
        results.push({ parsedId: selection.parsedId, ok: true, saved });
      } catch (error) {
        results.push({
          parsedId: selection.parsedId,
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

app.get(["/auth/:provider/start", "/api/auth/:provider/start"], async (req, res, next) => {
  try {
    await startOAuth(providerSchema.parse(req.params.provider), req, res);
  } catch (error) {
    next(error);
  }
});

app.get(["/auth/:provider/callback", "/api/auth/:provider/callback"], async (req, res, next) => {
  try {
    await finishOAuth(providerSchema.parse(req.params.provider), req, res);
  } catch (error) {
    next(error);
  }
});

app.post(["/auth/:provider/logout", "/api/auth/:provider/logout"], async (req, res, next) => {
  try {
    await clearProviderToken(req, providerSchema.parse(req.params.provider));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(400).json({ error: "request_failed", message });
  }
);

export default app;
