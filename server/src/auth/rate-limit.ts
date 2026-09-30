import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { collectionNames, type RateLimitDocument } from "../db/documents";

export const HOUR_MS = 60 * 60 * 1_000;
export const FIFTEEN_MINUTES_MS = 15 * 60 * 1_000;
export const DAY_MS = 24 * HOUR_MS;

export interface RateLimitDecision {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export function createRateLimitKey(scope: string, identifier: string, now: Date, windowMs: number): {
  id: string;
  expiresAt: Date;
} {
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const identifierHash = createHash("sha256").update(identifier).digest("hex");

  return {
    id: `${scope}:${identifierHash}:${windowStart}`,
    expiresAt: new Date(windowStart + windowMs),
  };
}

/**
 * Atomically increments one fixed-window counter. Only a digest of an email
 * address or IP is included in the persisted key.
 */
export async function incrementRateLimit(
  database: Db,
  id: string,
  expiresAt: Date,
  limit: number,
  now: Date,
): Promise<RateLimitDecision> {
  const counters = database.collection<RateLimitDocument>(collectionNames.rateLimits);

  try {
    await counters.updateOne(
      { _id: id },
      {
        $inc: { count: 1 },
        $setOnInsert: { createdAt: now, expiresAt },
      },
      { upsert: true },
    );
  } catch (error) {
    // Concurrent first requests can race while MongoDB creates the upsert.
    // The unique _id winner creates the record; the other request increments it.
    if (!isDuplicateKeyError(error)) throw error;
    await counters.updateOne({ _id: id }, { $inc: { count: 1 } });
  }

  const counter = await counters.findOne({ _id: id });
  if (!counter) {
    throw new Error("Rate-limit counter disappeared before it could be checked.");
  }

  return {
    allowed: counter.count <= limit,
    count: counter.count,
    retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt.getTime() - now.getTime()) / 1_000)),
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}
