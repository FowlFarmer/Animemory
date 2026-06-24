import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { readJson } from "./lib/http.js";
import {
  clearOAuthState,
  clearProviderTokenCookie,
  newOauthState,
  readOAuthState,
  readProviderToken,
  type ProviderToken,
  writeOAuthState,
  writeProviderToken
} from "./session.js";
import type { ProviderId } from "./types.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
};

export async function startOAuth(
  provider: ProviderId,
  _req: Request,
  res: Response
): Promise<void> {
  const verifier = provider === "mal" ? crypto.randomBytes(64).toString("base64url") : undefined;
  const oauth = newOauthState(provider, verifier);
  writeOAuthState(res, oauth);

  if (provider === "mal") {
    const url = new URL("https://myanimelist.net/v1/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", required(config.mal.clientId, "MAL_CLIENT_ID"));
    url.searchParams.set("redirect_uri", config.mal.redirectUri);
    // MAL only supports PKCE plain (challenge must equal verifier).
    url.searchParams.set("code_challenge", verifier!);
    url.searchParams.set("code_challenge_method", "plain");
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
  const oauth = readOAuthState(req);

  if (
    !code ||
    !oauth ||
    oauth.provider !== provider ||
    oauth.state !== state ||
    oauth.expiresAt < Date.now()
  ) {
    clearOAuthState(res);
    res.redirect(`${config.appOrigin}?auth=${provider}&error=invalid_state`);
    return;
  }

  const token =
    provider === "mal"
      ? await exchangeMalToken(code, oauth.codeVerifier)
      : await exchangeAniListToken(code);

  clearOAuthState(res);
  writeProviderToken(res, provider, toProviderToken(token));
  res.redirect(`${config.appOrigin}?auth=${provider}&connected=true`);
}

export async function tokenForProvider(
  req: Request,
  res: Response,
  provider: ProviderId
): Promise<string | undefined> {
  const stored = readProviderToken(req, provider);
  if (!stored) return undefined;

  if (
    provider === "mal" &&
    stored.refreshToken &&
    stored.expiresAt !== undefined &&
    stored.expiresAt <= Date.now() + 60_000
  ) {
    const refreshed = await refreshMalToken(stored.refreshToken);
    const token = toProviderToken(refreshed);
    writeProviderToken(res, provider, token);
    return token.accessToken;
  }

  return stored.accessToken;
}

export function clearProviderToken(res: Response, provider: ProviderId): void {
  clearProviderTokenCookie(res, provider);
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

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
