import { isValidChain, linkCount, shortestPath, type Index, type Node } from './graph'
import { puzzleFor, type PuzzleDef, type PuzzleFile } from './daily'
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

/** A friend's score on the puzzle being played, with their chain when the link carried a valid one. */
export type Friend = { links: number; path: Node[] | null }

/**
 * A free-play share link carries the random puzzle itself, so friends play the same pair:
 * `?r=<start film>.<end film>` plus `-<links>.<id>.<id>…` when the sharer finished it.
 */
export interface FreeLink { s: string; e: string; links: number | null; mids: string[] }
export function parseFreeLink(search: string): FreeLink | null {
  const m = /^(\d{1,9})\.(\d{1,9})(?:-(\d{1,2})((?:\.\d{1,9}){0,23}))?$/.exec(new URLSearchParams(search).get('r') ?? '')
  return m ? { s: m[1], e: m[2], links: m[3] ? Number(m[3]) : null, mids: m[4] ? m[4].slice(1).split('.') : [] } : null
}
/** Rebuild a shared free-play puzzle from the graph; null if the films are gone or no longer connect. */
export function freeFromLink(idx: Index, l: FreeLink): { puzzle: PuzzleDef; friend?: Friend } | null {
  const { films } = idx.data
  if (l.s === l.e || !(l.s in films) || !(l.e in films)) return null
  const best = shortestPath(idx, { kind: 'film', id: l.s }, l.e)
  if (!best) return null
  const puzzle: PuzzleDef = { s: l.s, e: l.e, par: linkCount(best) }
  if (l.links === null || !validChallenge(l.links, puzzle.par)) return { puzzle }
  let path: Node[] | null = null
  if (l.mids.length === l.links * 2 - 1) {
    const full: Node[] = [
      { kind: 'film', id: l.s },
      ...l.mids.map((id, i): Node => ({ kind: i % 2 === 0 ? 'person' : 'film', id })),
      { kind: 'film', id: l.e },
    ]
    if (isValidChain(idx, full, l.s, l.e) && linkCount(full) === l.links) path = full
  }
  return { puzzle, friend: { links: l.links, path } }
}
