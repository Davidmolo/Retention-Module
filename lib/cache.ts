/**
 * Cache: Redis (if REDIS_URL) → in-memory fallback.
 * Never blocks the request for long — Redis failures fall through to DB.
 */
import Redis from 'ioredis'

const memory = new Map<string, { exp: number; value: string }>()

let redis: Redis | null | undefined
let redisDisabled = false

function getRedis(): Redis | null {
  if (redisDisabled) return null
  if (redis !== undefined) return redis
  const url = process.env.REDIS_URL?.trim()
  if (!url) {
    redis = null
    return null
  }
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 800,
      commandTimeout: 800,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    })
    redis.on('error', () => {
      redisDisabled = true
      try {
        redis?.disconnect()
      } catch {
        /* ignore */
      }
      redis = null
    })
    return redis
  } catch {
    redis = null
    redisDisabled = true
    return null
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const now = Date.now()
  const mem = memory.get(key)
  if (mem && mem.exp > now) {
    try {
      return JSON.parse(mem.value) as T
    } catch {
      memory.delete(key)
    }
  }

  const client = getRedis()
  if (!client) return null

  try {
    if (client.status !== 'ready') {
      const ok = await withTimeout(client.connect().then(() => true), 800)
      if (!ok) {
        redisDisabled = true
        return null
      }
    }
    const raw = await withTimeout(client.get(key), 800)
    if (!raw) return null
    memory.set(key, { exp: now + 30_000, value: raw })
    return JSON.parse(raw) as T
  } catch {
    redisDisabled = true
    return null
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 60
): Promise<void> {
  const raw = JSON.stringify(value)
  memory.set(key, { exp: Date.now() + ttlSeconds * 1000, value: raw })

  const client = getRedis()
  if (!client) return
  try {
    if (client.status !== 'ready') {
      const ok = await withTimeout(client.connect().then(() => true), 800)
      if (!ok) return
    }
    await withTimeout(client.set(key, raw, 'EX', ttlSeconds), 800)
  } catch {
    redisDisabled = true
  }
}

export async function cacheDel(key: string | string[]): Promise<void> {
  const keys = Array.isArray(key) ? key : [key]
  for (const k of keys) memory.delete(k)
  const client = getRedis()
  if (!client || !keys.length) return
  try {
    if (client.status === 'ready') {
      await withTimeout(client.del(...keys), 800)
    }
  } catch {
    redisDisabled = true
  }
}

export const CACHE_KEYS = {
  retentionOverview: 'retention:overview:v4',
  retentionDriver: (id: string) => `retention:driver:${id}:v4`,
} as const
