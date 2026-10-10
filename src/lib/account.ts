import type { Result, Score } from './storage'

/** A signed-in player on this device. The PIN is never stored; the server's token stands in for it. */
export interface Account { name: string; token: string }
type FriendScores = Record<string, Score & Pick<Result, 'seconds' | 'hints'> & { rare?: boolean }>
/** A friend's scores for the India daily plus any home-cinema dailies, never their chains. */
export interface Friend { name: string; results: FriendScores; home?: Record<string, FriendScores> }

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

/** Home-cinema results by language code, synced alongside the India daily's. */
export type HomeResults = Record<string, Record<string, Result>>

export const login = (name: string, pin: string, results: Record<string, Result>, home: HomeResults) =>
  call<{ name: string; token: string; results: Record<string, Result>; home: HomeResults; created: boolean }>({ action: 'login', name, pin, results, home })

export const sync = (a: Account, results: Record<string, Result>, home: HomeResults) =>
  call<{ results: Record<string, Result>; home: HomeResults }>({ action: 'sync', ...a, results, home })

export const fetchFriends = (a: Account) => call<{ players: Friend[] }>({ action: 'board', ...a })

/** How many players took the same route as you on a day's pan-India daily (the server reads your stored chain). */
export const fetchRouteShare = (a: Account, date: string) =>
  call<{ count: number; total: number }>({ action: 'route', ...a, date })
