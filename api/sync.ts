/**
 * Player accounts and synced results for a small group of friends.
 *
 * A player is a name + 4-digit PIN. Logging in returns a random token the browser keeps, so the PIN
 * is only ever sent once per device. Storage is Upstash Redis over its REST API (free tier): one JSON
 * value per player plus a set of all player keys. Streaks are never stored; clients derive them
 * from results, exactly as they do offline.
 */

export interface Store {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  sadd(key: string, member: string): Promise<void>
  smembers(key: string): Promise<string[]>
  mget(keys: string[]): Promise<(string | null)[]>
  /** INCR, starting a TTL on first increment. Returns the new count. */
  bump(key: string, ttlSeconds: number): Promise<number>
  del(key: string): Promise<void>
}

export function upstash(url: string, token: string): Store {
  const cmd = async (...args: (string | number)[]) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(args),
    })
    if (!r.ok) throw new Error(`Upstash ${r.status}`)
    return ((await r.json()) as { result: unknown }).result
  }
  return {
    get: async (k) => (await cmd('GET', k)) as string | null,
    set: async (k, v) => void (await cmd('SET', k, v)),
    sadd: async (k, m) => void (await cmd('SADD', k, m)),
    smembers: async (k) => (await cmd('SMEMBERS', k)) as string[],
    mget: async (keys) => (keys.length ? ((await cmd('MGET', ...keys)) as (string | null)[]) : []),
    bump: async (k, ttl) => {
      const n = (await cmd('INCR', k)) as number
      if (n === 1) await cmd('EXPIRE', k, ttl)
      return n
    },
    del: async (k) => void (await cmd('DEL', k)),
  }
}

/** In-memory store for local dev and tests. */
export function memoryStore(): Store {
  const kv = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  return {
    get: async (k) => kv.get(k) ?? null,
    set: async (k, v) => void kv.set(k, v),
    sadd: async (k, m) => void (sets.get(k) ?? sets.set(k, new Set()).get(k)!).add(m),
    smembers: async (k) => [...(sets.get(k) ?? [])],
    mget: async (keys) => keys.map((k) => kv.get(k) ?? null),
    bump: async (k) => {
      const n = Number(kv.get(k) ?? 0) + 1
      kv.set(k, String(n))
      return n
    },
    del: async (k) => void kv.delete(k),
  }
}

type Node = { kind: 'film' | 'person'; id: string }
export interface Entry {
  links: number
  par: number
  seconds: number
  hints: number
  gaveUp: boolean
  path: Node[]
  live: boolean
}
interface Player {
  name: string
  salt: string
  pinHash: string
  token: string
  created: string
  results: Record<string, Entry>
}

const USERS = 'cl:users'
const userKey = (key: string) => `cl:user:${key}`
const failKey = (key: string) => `cl:fail:${key}`
const MAX_FAILS = 8
const LOCKOUT_SECONDS = 15 * 60

const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u
const PIN_RE = /^\d{4}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const hex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)))

async function hashPin(pin: string, salt: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' }, key, 256,
  )
  return hex(bits)
}

function sameString(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const int = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null

/** Accept only well-formed results; anything odd is dropped rather than stored. */
function cleanEntry(v: unknown): Entry | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  const links = int(r.links, 50), par = int(r.par, 20), seconds = int(r.seconds, 7 * 86400), hints = int(r.hints, 50)
  if (links === null || par === null || seconds === null || hints === null) return null
  if (!Array.isArray(r.path) || r.path.length > 101) return null
  const path: Node[] = []
  for (const n of r.path as unknown[]) {
    const o = n as Record<string, unknown>
    if (!o || (o.kind !== 'film' && o.kind !== 'person') || typeof o.id !== 'string' || o.id.length > 24) return null
    path.push({ kind: o.kind, id: o.id })
  }
  return { links, par, seconds, hints, gaveUp: r.gaveUp === true, live: r.live === true, path }
}

/** First result for a day wins: a puzzle can't be replayed for a better score. */
function merge(into: Record<string, Entry>, incoming: unknown) {
  if (!incoming || typeof incoming !== 'object') return
  let n = Object.keys(into).length
  for (const [date, v] of Object.entries(incoming as Record<string, unknown>)) {
    if (n >= 5000) break
    if (!DATE_RE.test(date) || date in into) continue
    const e = cleanEntry(v)
    if (e) {
      into[date] = e
      n++
    }
  }
}

export interface Reply { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): Reply => ({ status, body: { error } })

async function authed(store: Store, body: Record<string, unknown>): Promise<Player | Reply> {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const token = typeof body.token === 'string' ? body.token : ''
  const raw = name && (await store.get(userKey(name.toLowerCase())))
  const p = raw ? (JSON.parse(raw) as Player) : null
  if (!p || !token || !sameString(p.token, token)) return fail(401, 'Please sign in again.')
  return p
}

export async function handle(store: Store, method: string, body: unknown): Promise<Reply> {
  if (method !== 'POST') return fail(405, 'Use POST.')
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>

  if (b.action === 'login') {
    const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : ''
    const pin = typeof b.pin === 'string' ? b.pin : ''
    if (!NAME_RE.test(name)) return fail(400, 'Names are 2–20 letters or numbers.')
    if (!PIN_RE.test(pin)) return fail(400, 'The PIN is 4 digits.')
    const key = name.toLowerCase()

    const raw = await store.get(userKey(key))
    let p: Player
    let created = false
    if (!raw) {
      const salt = randomHex(16)
      p = { name, salt, pinHash: await hashPin(pin, salt), token: randomHex(24), created: new Date().toISOString(), results: {} }
      await store.sadd(USERS, key)
      created = true
    } else {
      p = JSON.parse(raw) as Player
      if ((Number(await store.get(failKey(key))) || 0) >= MAX_FAILS) {
        return fail(429, 'Too many wrong PINs. Try again in 15 minutes.')
      }
      if (!sameString(await hashPin(pin, p.salt), p.pinHash)) {
        await store.bump(failKey(key), LOCKOUT_SECONDS)
        return fail(401, `Wrong PIN for ${p.name}. New here? Pick a different name.`)
      }
      await store.del(failKey(key))
    }
    merge(p.results, b.results)
    await store.set(userKey(key), JSON.stringify(p))
    return { status: 200, body: { name: p.name, token: p.token, results: p.results, created } }
  }

  if (b.action === 'sync') {
    const p = await authed(store, b)
    if ('status' in p) return p
    const before = Object.keys(p.results).length
    merge(p.results, b.results)
    if (Object.keys(p.results).length !== before) {
      await store.set(userKey(p.name.toLowerCase()), JSON.stringify(p))
    }
    return { status: 200, body: { results: p.results } }
  }

  if (b.action === 'board') {
    const me = await authed(store, b)
    if ('status' in me) return me
    const keys = await store.smembers(USERS)
    const rows = await store.mget(keys.map(userKey))
    const players = rows.flatMap((raw) => {
      if (!raw) return []
      const p = JSON.parse(raw) as Player
      // Chains stay private: friends see scores, not the route (no spoilers).
      const results = Object.fromEntries(Object.entries(p.results).map(([d, e]) => [d, { ...e, path: undefined }]))
      return [{ name: p.name, results }]
    })
    return { status: 200, body: { players } }
  }

  return fail(400, 'Unknown action.')
}

interface Req { method?: string; body?: unknown }
interface Res { status(code: number): { json(body: unknown): void } }

export default async function handler(req: Req, res: Res) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return res.status(503).json({ error: 'Sync isn’t set up on this server yet.' })
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const out = await handle(upstash(url, token), req.method ?? 'GET', body)
    res.status(out.status).json(out.body)
  } catch {
    res.status(500).json({ error: 'Sync failed. Your results are still saved on this device.' })
  }
}
