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
const developmentKey = crypto.randomBytes(32);

export function newOauthState(provider: ProviderId, codeVerifier?: string): OAuthState {
  return {
    provider,
    state: crypto.randomBytes(24).toString("base64url"),
    codeVerifier,
    expiresAt: Date.now() + OAUTH_TTL_MS
  };
}

export function readOAuthState(req: Request): OAuthState | null {
  return unseal<OAuthState>(req.cookies?.[OAUTH_COOKIE]);
}

export function writeOAuthState(res: Response, state: OAuthState): void {
  writeCookie(res, OAUTH_COOKIE, state, OAUTH_TTL_MS);
}

export function clearOAuthState(res: Response): void {
  res.clearCookie(OAUTH_COOKIE, cookieOptions());
}

export function readProviderToken(req: Request, provider: ProviderId): ProviderToken | null {
  return unseal<ProviderToken>(req.cookies?.[providerCookieName(provider)]);
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
  res.cookie(name, seal(value), { ...cookieOptions(), maxAge });
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

function seal(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const token = [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");

  if (token.length > 3800) {
    throw new Error("Encrypted provider token is too large for a browser cookie.");
  }

  return token;
}

function unseal<T>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  const [iv, tag, ciphertext, extra] = value.split(".");
  if (!iv || !tag || !ciphertext || extra) return null;

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final()
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

function encryptionKey(): Buffer {
  const raw = config.session.encryptionKey;
  if (!raw) {
    if (config.isProduction) {
      throw new Error("SESSION_ENCRYPTION_KEY is required in production.");
    }
    return developmentKey;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }
  return key;
}
