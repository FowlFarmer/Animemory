import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { readJson } from "./lib/http.js";
import {
  createSessionId,
  newOauthState,
  newSession,
  readSession,
  type AppSession,
  type ProviderToken,
  writeSession
} from "./session.js";
import type { ProviderId } from "./types.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
};

const SESSION_COOKIE = "animemory_session";

export async function startOAuth(
  provider: ProviderId,
  req: Request,
  res: Response
): Promise<void> {
  const { sessionId, session } = await loadOrCreateSession(req, res);
  const verifier = provider === "mal" ? crypto.randomBytes(64).toString("base64url") : undefined;
  const oauth = newOauthState(provider, verifier);
  session.oauth = oauth;
  await writeSession(sessionId, session);

  if (provider === "mal") {
    const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", required(config.mal.clientId, "MAL_CLIENT_ID"));
    url.searchParams.set("redirect_uri", config.mal.redirectUri);
    url.searchParams.set("code_challenge", sha256Base64Url(verifier!));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", oauth.state);
    res.redirect(url.toString());
    return;
  }

  const url = new URL("https://anilist.co/api/v2/oauth/authorize");
  url.searchParams.set("client_id", required(config.anilist.clientId, "ANILIST_CLIENT_ID"));
  url.searchParams.set("redirect_uri", config.anilist.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", oauth.state);
  res.redirect(url.toString());
}

export async function finishOAuth(
  provider: ProviderId,
  req: Request,
  res: Response
): Promise<void> {
  const code = String(req.query.code ?? "");
  const state = String(req.query.state ?? "");
  const sessionId = readSessionId(req);
  const session = sessionId ? await readSession(sessionId) : null;
  const oauth = session?.oauth;

  if (
    !code ||
    !sessionId ||
    !session ||
    !oauth ||
    oauth.provider !== provider ||
    oauth.state !== state ||
    oauth.expiresAt < Date.now()
  ) {
    res.redirect(`${config.appOrigin}?auth=${provider}&error=invalid_state`);
    return;
  }

  const token =
    provider === "mal"
      ? await exchangeMalToken(code, oauth.codeVerifier)
      : await exchangeAniListToken(code);

  session.providers[provider] = toProviderToken(token);
  delete session.oauth;
  await writeSession(sessionId, session);
  res.redirect(`${config.appOrigin}?auth=${provider}&connected=true`);
}

export async function tokenForProvider(
  req: Request,
  provider: ProviderId
): Promise<string | undefined> {
  const sessionId = readSessionId(req);
  if (!sessionId) return undefined;
  const session = await readSession(sessionId);
  const stored = session?.providers[provider];
  if (!session || !stored) return undefined;

  if (
    provider === "mal" &&
    stored.refreshToken &&
    stored.expiresAt !== undefined &&
    stored.expiresAt <= Date.now() + 60_000
  ) {
    const refreshed = await refreshMalToken(stored.refreshToken);
    session.providers.mal = toProviderToken(refreshed);
    await writeSession(sessionId, session);
    return session.providers.mal.accessToken;
  }

  return stored.accessToken;
}

export async function clearProviderToken(
  req: Request,
  provider: ProviderId
): Promise<void> {
  const sessionId = readSessionId(req);
  if (!sessionId) return;
  const session = await readSession(sessionId);
  if (!session) return;

  delete session.providers[provider];
  await writeSession(sessionId, session);
}

async function loadOrCreateSession(
  req: Request,
  res: Response
): Promise<{ sessionId: string; session: AppSession }> {
  const existingId = readSessionId(req);
  const existing = existingId ? await readSession(existingId) : null;
  if (existingId && existing) return { sessionId: existingId, session: existing };

  const sessionId = createSessionId();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
  return { sessionId, session: newSession() };
}

function readSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

function toProviderToken(token: TokenResponse): ProviderToken {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined
  };
}

async function exchangeMalToken(code: string, codeVerifier?: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", required(config.mal.clientId, "MAL_CLIENT_ID"));
  if (config.mal.clientSecret) body.set("client_secret", config.mal.clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", config.mal.redirectUri);
  body.set("code_verifier", required(codeVerifier, "PKCE verifier"));

  return readJson(
    await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    })
  );
}

async function exchangeAniListToken(code: string): Promise<TokenResponse> {
  return readJson(
    await fetch("https://anilist.co/api/v2/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: required(config.anilist.clientId, "ANILIST_CLIENT_ID"),
        client_secret: required(config.anilist.clientSecret, "ANILIST_CLIENT_SECRET"),
        redirect_uri: config.anilist.redirectUri,
        code
      })
    })
  );
}

async function refreshMalToken(refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("client_id", required(config.mal.clientId, "MAL_CLIENT_ID"));
  if (config.mal.clientSecret) body.set("client_secret", config.mal.clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  return readJson(
    await fetch("https://myanimelist.net/v1/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    })
  );
}

function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
