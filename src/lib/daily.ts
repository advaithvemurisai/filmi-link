export interface PuzzleDef {
  s: string
  e: string
  par: number
  /** The week's theme, e.g. "Composer Week" or "Released this week: Sholay (1975)". */
  theme?: string
  /** A surprising link on a shortest route, revealed after playing. */
  spot?: { p: string; t: string }
  /** Alternate shortest routes as id lists, films and people alternating, start first. */
  alts?: string[][]
  /** Generator's grade from chain length and how many (findable) shortest routes exist: 1 easy, 2 medium, 3 hard. */
  d?: number
}

const GRADES = ['Easy', 'Medium', 'Hard']
/** The puzzle's own difficulty; older files without a grade fall back to its length. */
export const difficultyOf = (p: PuzzleDef) => GRADES[Math.min(3, Math.max(1, p.d ?? p.par - 1)) - 1]
export interface PuzzleFile { epoch: string; puzzles: PuzzleDef[] }

const DAY = 86_400_000

/** Local calendar date as YYYY-MM-DD. */
export function localDateKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const toUTC = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export const dayDiff = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / DAY)

export function addDays(key: string, n: number): string {
  const d = new Date(toUTC(key) + n * DAY)
  return d.toISOString().slice(0, 10)
}

/** Milliseconds until the next local midnight, when the next daily unlocks. */
export function msToMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}

/** Puzzle number (1-based) for a date, or null before the epoch. Wraps if the schedule runs out. */
export function puzzleNumber(file: PuzzleFile, dateKey: string): number | null {
  const n = dayDiff(file.epoch, dateKey)
  return n < 0 ? null : n + 1
}

export function puzzleFor(file: PuzzleFile, dateKey: string): PuzzleDef | null {
  const n = puzzleNumber(file, dateKey)
  return n === null ? null : file.puzzles[(n - 1) % file.puzzles.length]
}
