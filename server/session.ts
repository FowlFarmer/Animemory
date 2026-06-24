import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import type { ProviderId } from "./types.js";
import { config } from "./config.js";

export type ProviderToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type AppSession = {
  providers: Partial<Record<ProviderId, ProviderToken>>;
  oauth?: {
    provider: ProviderId;
    state: string;
    codeVerifier?: string;
    expiresAt: number;
  };
};

type EncryptedSession = {
  ciphertext: string;
  iv: string;
  tag: string;
  version: 1;
};

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_MS = 10 * 60 * 1000;
const memorySessions = new Map<string, { value: AppSession; expiresAt: number }>();

const redis =
  config.session.redisUrl && config.session.redisToken
    ? new Redis({
        url: config.session.redisUrl,
        token: config.session.redisToken
      })
    : null;

export async function readSession(sessionId: string): Promise<AppSession | null> {
  if (redis) {
    const encrypted = await redis.get<EncryptedSession>(key(sessionId));
    return encrypted ? decryptSession(encrypted) : null;
  }

  const item = memorySessions.get(sessionId);
  if (!item || item.expiresAt < Date.now()) {
    memorySessions.delete(sessionId);
    return null;
  }
  return item.value;
}

export async function writeSession(sessionId: string, session: AppSession): Promise<void> {
  if (config.isProduction && !redis) {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.");
  }

  if (redis) {
    await redis.set(key(sessionId), encryptSession(session), { ex: SESSION_TTL_SECONDS });
    return;
  }

  memorySessions.set(sessionId, {
    value: session,
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (redis) {
    await redis.del(key(sessionId));
    return;
  }
  memorySessions.delete(sessionId);
}

export function createSessionId(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function newSession(): AppSession {
  return { providers: {} };
}

export function newOauthState(
  provider: ProviderId,
  codeVerifier?: string
): NonNullable<AppSession["oauth"]> {
  return {
    provider,
    state: crypto.randomBytes(24).toString("base64url"),
    codeVerifier,
    expiresAt: Date.now() + OAUTH_TTL_MS
  };
}

function key(sessionId: string): string {
  return `animemory:session:${sessionId}`;
}

function encryptSession(session: AppSession): EncryptedSession {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    version: 1
  };
}

function decryptSession(value: EncryptedSession): AppSession {
  if (value.version !== 1) throw new Error("Unsupported session record version.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as AppSession;
}

function encryptionKey(): Buffer {
  const raw = config.session.encryptionKey;
  if (!raw) {
    throw new Error("SESSION_ENCRYPTION_KEY is required whenever Redis sessions are enabled.");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be a 32-byte base64 value.");
  }
  return key;
}
