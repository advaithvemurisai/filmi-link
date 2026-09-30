export interface PuzzleDef { s: string; e: string; par: number }
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

/** Puzzle number (1-based) for a date, or null before the epoch. Wraps if the schedule runs out. */
export function puzzleNumber(file: PuzzleFile, dateKey: string): number | null {
  const n = dayDiff(file.epoch, dateKey)
  return n < 0 ? null : n + 1
}

export function puzzleFor(file: PuzzleFile, dateKey: string): PuzzleDef | null {
  const n = puzzleNumber(file, dateKey)
  return n === null ? null : file.puzzles[(n - 1) % file.puzzles.length]
}
