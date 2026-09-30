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
export interface Settings { hard: boolean }

const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
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

export const loadResults = () => read<Record<string, Result>>('fl:results', {})
export const saveResults = (all: Record<string, Result>) => write('fl:results', all)

export const loadProgress = (dateKey: string) => read<Progress | null>(`fl:progress:${dateKey}`, null)
export const saveProgress = (dateKey: string, p: Progress) => write(`fl:progress:${dateKey}`, p)

export const loadSettings = () => read<Settings>('fl:settings', { hard: false })
export const saveSettings = (s: Settings) => write('fl:settings', s)

/** The parts of a result stats need (friends' results arrive without their chains). */
export type Score = Pick<Result, 'links' | 'par' | 'gaveUp' | 'live'>

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

  const atPar = solved.filter((r) => r.links <= r.par).length
  const overPar: Record<string, number> = {}
  for (const r of solved) {
    const over = r.links - r.par
    const k = over <= 0 ? 'Par' : over >= 3 ? '+3+' : `+${over}`
    overPar[k] = (overPar[k] ?? 0) + 1
  }
  return { played: entries.length, solved: solved.length, streak, best, atPar, overPar }
}
