import type { MiddlewareHandler } from "hono";

// ---- In-memory rate limiter (single-instance, no Redis needed) ----

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const MAX_STORE_SIZE = 10_000;

/**
 * Evict entries when the store exceeds MAX_STORE_SIZE.
 * 1. Delete all expired entries (resetAt <= now)
 * 2. If still over, delete oldest 10% by resetAt
 */
function evictIfNeeded(): void {
  if (store.size < MAX_STORE_SIZE) return;

  const now = Date.now();
  // Pass 1: delete expired entries
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }

  // Pass 2: if still over, delete oldest 10% by resetAt
  if (store.size >= MAX_STORE_SIZE) {
    const entries = [...store.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toDelete = Math.ceil(store.size * 0.1);
    for (let i = 0; i < toDelete; i++) {
      store.delete(entries[i]![0]);
    }
  }
}

// Clean up expired entries every 1 minute
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  },
  1 * 60 * 1000,
);

/**
 * Extract client IP from request, accounting for reverse proxies.
 *
 * Prefer Cloudflare's cf-connecting-ip (set by Cloudflare and cannot be
 * spoofed by the client), then x-real-ip (set by Nginx), then the first
 * entry of x-forwarded-for, and finally fall back to "unknown".
 */
function getClientIp(req: Request): string {
  // Cloudflare sets this header; it cannot be spoofed by the client
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // x-forwarded-for may contain multiple IPs: "client, proxy1, proxy2"
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }

  return "unknown";
}

/**
 * Create a rate-limiting middleware.
 *
 * @param maxRequests – maximum number of requests allowed in the window
 * @param windowMs   – time window in milliseconds (default: 60 000 = 1 min)
 * @param prefix     – key prefix to separate different limiters (e.g. "general", "trips-create")
 */
export function rateLimit(opts: {
  maxRequests: number;
  windowMs?: number;
  prefix?: string;
}): MiddlewareHandler {
  const { maxRequests, windowMs = 60_000, prefix = "global" } = opts;

  return async (c, next) => {
    const ip = getClientIp(c.req.raw);
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      // First request in window or window expired — start fresh
      entry = { count: 1, resetAt: now + windowMs };
      evictIfNeeded();
      store.set(key, entry);
    } else {
      entry.count++;
    }

    // Set standard rate-limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSec = Math.ceil((entry.resetAt - now) / 1000);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSec));

    if (entry.count > maxRequests) {
      c.header("Retry-After", String(resetSec));
      return c.json(
        {
          ok: false,
          error: {
            code: "RATE_LIMITED" as const,
            message: "Trop de requêtes. Réessayez dans quelques instants.",
          },
        },
        429,
      );
    }

    await next();
  };
}

/** @internal Exposed for testing only */
export function _getStoreSize(): number {
  return store.size;
}

/** @internal Exposed for testing only — clear all entries */
export function _clearStore(): void {
  store.clear();
}

/** @internal Exposed for testing only — directly insert a store entry */
export function _setStoreEntry(key: string, entry: RateLimitEntry): void {
  store.set(key, entry);
}

/** @internal Exposed for testing only */
export const _MAX_STORE_SIZE = MAX_STORE_SIZE;
