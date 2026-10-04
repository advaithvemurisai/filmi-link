import { addDays } from './daily'
import type { Node } from './graph'

export interface Result {
  links: number
  par: number
  seconds: number
  hints: number
  gaveUp: boolean
  path: Node[]
  /** Played on the puzzle's own day (archive plays don't count toward streaks). */
  live: boolean
}
export interface Progress { path: Node[]; startedAt: number; hints: number }
/** A chain left untouched for days shouldn't record days of play time; the server also bounds this. */
export const MAX_SECONDS = 12 * 3600
/** `home` is the language of the player's optional home-industry daily. */
export interface Settings { hard: boolean; home?: string }

/** Which daily: the shared pan-India one, or a home-industry one by language code. */
export type Track = 'all' | string

/** Parsed value if it has the same shape as the fallback; a corrupted or hand-edited entry falls back instead of crashing. */
const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return fallback
    const v = JSON.parse(raw)
    return v !== null && typeof v === typeof fallback && Array.isArray(v) === Array.isArray(fallback) ? (v as T) : fallback
  } catch {
    return fallback
  }
}
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage unavailable: play continues without persistence */
  }
}

const resultsKey = (track: Track) => (track === 'all' ? 'fl:results' : `fl:results:${track}`)
export const loadResults = (track: Track = 'all') => read<Record<string, Result>>(resultsKey(track), {})
export const saveResults = (all: Record<string, Result>, track: Track = 'all') => write(resultsKey(track), all)

const progressKey = (track: Track, dateKey: string) =>
  track === 'all' ? `fl:progress:${dateKey}` : `fl:progress:${track}:${dateKey}`
export const loadProgress = (dateKey: string, track: Track = 'all') => {
  const p = read<Progress | null>(progressKey(track, dateKey), null)
  return p && Array.isArray(p.path) ? p : null
}
export const saveProgress = (dateKey: string, p: Progress, track: Track = 'all') => write(progressKey(track, dateKey), p)

/** Films from the last few random chains, newest first, so free play doesn't repeat them soon. */
const RECENT_FILMS = 120
export const loadRecentFilms = () => read<string[]>('fl:recent', [])
export function rememberFilms(...ids: string[]) {
  const next = [...ids, ...loadRecentFilms().filter((f) => !ids.includes(f))].slice(0, RECENT_FILMS)
  write('fl:recent', next)
}

export const loadSettings = () => read<Settings>('fl:settings', { hard: false })
export const saveSettings = (s: Settings) => write('fl:settings', s)

/** True once this browser has finished any daily: returning players skip the landing page. */
export const hasPlayed = () => Object.keys(loadResults()).length > 0

/** The parts of a result stats need (friends' results arrive without their chains). */
export type Score = Pick<Result, 'links' | 'par' | 'gaveUp' | 'live'> & { hints?: number }

/** Box-office rating for a solved puzzle, by how many links over the shortest chain. */
export const RATINGS = ['Blockbuster', 'Hit', 'Flop', 'Disaster'] as const
export type Rating = (typeof RATINGS)[number]
/** A hint-assisted shortest chain is a Hit, not a Blockbuster. */
export function ratingFor(links: number, par: number, hints = 0): Rating {
  const r = RATINGS[Math.min(3, Math.max(0, links - par))]
  return r === 'Blockbuster' && hints > 0 ? 'Hit' : r
}
export const rate = (r: Score): Rating | null => (r.gaveUp ? null : ratingFor(r.links, r.par, r.hints))
/** Class for a day cell in calendars and boards: its rating's colour, or a give-up. */
export const tierClass = (r: Score | undefined) => (!r ? '' : r.gaveUp ? 'is-lost' : `t-${rate(r)!.toLowerCase()}`)

export function computeStats(results: Record<string, Score>, today: string) {
  const entries = Object.values(results)
  const solved = entries.filter((r) => !r.gaveUp)
  const isWin = (d: string) => !!results[d] && !results[d].gaveUp && results[d].live

  // Streak counts back from today, or from yesterday if today isn't played yet.
  let cursor = results[today]?.live ? today : addDays(today, -1)
  let streak = 0
  while (isWin(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }

  let best = 0
  let run = 0
  for (const d of Object.keys(results).sort()) {
    if (!isWin(d)) run = 0
    else run = isWin(addDays(d, -1)) ? run + 1 : 1
    best = Math.max(best, run)
  }

  const tiers: Partial<Record<Rating, number>> = {}
  for (const r of solved) {
    const k = rate(r)!
    tiers[k] = (tiers[k] ?? 0) + 1
  }
  return { played: entries.length, solved: solved.length, streak, best, blockbusters: tiers.Blockbuster ?? 0, tiers }
}

/** Everyone a player has linked through: person id → first date and how many chains. */
export type Cast = Record<string, { d: string; n: number }>
export const loadCast = () => read<Cast>('fl:cast', {})

/** Add a solved chain's people to the collection. Returns the ids collected for the first time. */
export function collectCast(path: Node[], date: string): string[] {
  const cast = loadCast()
  const fresh: string[] = []
  for (const n of path) {
    if (n.kind !== 'person') continue
    if (!cast[n.id]) {
      cast[n.id] = { d: date, n: 0 }
      fresh.push(n.id)
    }
    cast[n.id].n++
  }
  write('fl:cast', cast)
  return fresh
}
