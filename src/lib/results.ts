import { isValidChain, type Index } from './graph'
import { puzzleFor, type PuzzleFile } from './daily'
import type { Result } from './storage'

/**
 * Keep only results whose chain still runs from that day's start film to its target film in the
 * current data. A stored `par` is deliberately not compared with the schedule: a data refresh can
 * lower a published puzzle's par, and that must not erase a player's streak. The result keeps the par
 * it was played against, so its rating doesn't change.
 */
export function validResults(idx: Index, file: PuzzleFile, results: Record<string, Result>) {
  const valid: Record<string, Result> = {}
  for (const [d, r] of Object.entries(results)) {
    const pz = puzzleFor(file, d)
    if (pz && isValidChain(idx, r.path, pz.s, r.gaveUp ? undefined : pz.e)) valid[d] = r
  }
  return valid
}

/** A friend's challenge only makes sense if it's possible: at least par links, and not absurdly many. */
export const validChallenge = (links: number, par: number) => links >= par && links <= 12
