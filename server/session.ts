import crypto from "node:crypto";
import type { Request, Response } from "express";
import { config } from "./config.js";
import type { ProviderId } from "./types.js";

export type ProviderToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type OAuthState = {
  provider: ProviderId;
  state: string;
  codeVerifier?: string;
  expiresAt: number;
};

const OAUTH_COOKIE = "animemory_oauth";
const PROVIDER_COOKIE_PREFIX = "animemory_token_";
const OAUTH_TTL_MS = 10 * 60 * 1000;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function newOauthState(provider: ProviderId, codeVerifier?: string): OAuthState {
  return {
    provider,
    state: crypto.randomBytes(24).toString("base64url"),
    codeVerifier,
    expiresAt: Date.now() + OAUTH_TTL_MS
  };
}

export function readOAuthState(req: Request): OAuthState | null {
  return decode<OAuthState>(req.cookies?.[OAUTH_COOKIE]);
}

export function writeOAuthState(res: Response, state: OAuthState): void {
  writeCookie(res, OAUTH_COOKIE, state, OAUTH_TTL_MS);
}

export function clearOAuthState(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, cookieOptions());
}

export function readProviderToken(req: Request, provider: ProviderId): ProviderToken | null {
  return decode<ProviderToken>(req.cookies?.[providerCookieName(provider)]);
}

export function writeProviderToken(
  res: Response,
  provider: ProviderId,
  token: ProviderToken
): void {
  writeCookie(res, providerCookieName(provider), token, TOKEN_TTL_MS);
}

export function clearProviderTokenCookie(res: Response, provider: ProviderId): void {
  res.clearCookie(providerCookieName(provider), cookieOptions());
}

function writeCookie<T>(res: Response, name: string, value: T, maxAge: number): void {
  res.cookie(name, encode(value), { ...cookieOptions(), maxAge });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProduction,
    path: "/"
  };
}

function providerCookieName(provider: ProviderId): string {
  return `${PROVIDER_COOKIE_PREFIX}${provider}`;
}

function encode(value: unknown): string {
  const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  if (encoded.length > 3800) throw new Error("Provider token is too large for a browser cookie.");
  return encoded;
}

function decode<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
