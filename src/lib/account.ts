import type { Result, Score } from './storage'

/** A signed-in player on this device. The PIN is never stored; the server's token stands in for it. */
export interface Account { name: string; token: string }
export interface Friend { name: string; results: Record<string, Score & Pick<Result, 'seconds' | 'hints'>> }

const KEY = 'fl:account'

export function loadAccount(): Account | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return a && typeof a.name === 'string' && typeof a.token === 'string' ? a : null
  } catch {
    return null
  }
}

export function saveAccount(a: Account | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a))
    else localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

export class SyncError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${import.meta.env.BASE_URL}api/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new SyncError('You look offline. Results are saved on this device.', 0)
  }
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new SyncError(json.error ?? 'Sync is unavailable right now.', r.status)
  return json as T
}

export const login = (name: string, pin: string, results: Record<string, Result>) =>
  call<{ name: string; token: string; results: Record<string, Result>; created: boolean }>({ action: 'login', name, pin, results })

export const sync = (a: Account, results: Record<string, Result>) =>
  call<{ results: Record<string, Result> }>({ action: 'sync', ...a, results })

export const fetchFriends = (a: Account) => call<{ players: Friend[] }>({ action: 'board', ...a })
