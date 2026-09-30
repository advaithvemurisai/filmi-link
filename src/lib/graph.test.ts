import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildIndex, linkCount, randomPuzzle, shortestPath, type GraphData, type Node } from './graph'
import { addDays, dayDiff, puzzleFor, puzzleNumber, type PuzzleFile } from './daily'
import { computeStats, type Result } from './storage'

// Tiny graph: A —p1— B —p2— C,  D isolated.
const tiny: GraphData = {
  meta: { source: 'seed', generated: '', films: 4, people: 3 },
  films: {
    A: { t: 'A', y: 2000, l: 'hi', p: null, pop: 3 },
    B: { t: 'B', y: 2001, l: 'ta', p: null, pop: 2 },
    C: { t: 'C', y: 2002, l: 'te', p: null, pop: 1 },
    D: { t: 'D', y: 2003, l: 'ml', p: null, pop: 1 },
  },
  people: { p1: { n: 'One', i: null }, p2: { n: 'Two', i: null }, p3: { n: 'Three', i: null } },
  credits: { A: [['p1', 'Actor']], B: [['p1', 'Director'], ['p2', 'Actor']], C: [['p2', 'Music']], D: [['p3', 'Actor']] },
}

describe('shortestPath', () => {
  const idx = buildIndex(tiny)
  it('finds the alternating film/person chain', () => {
    const p = shortestPath(idx, { kind: 'film', id: 'A' }, 'C')!
    expect(p.map((n) => n.id)).toEqual(['A', 'p1', 'B', 'p2', 'C'])
    expect(linkCount(p)).toBe(2)
  })
  it('works from a person node (used by hints)', () => {
    const p = shortestPath(idx, { kind: 'person', id: 'p1' }, 'C')!
    expect(p[1]).toEqual<Node>({ kind: 'film', id: 'B' })
  })
  it('returns null when unreachable', () => {
    expect(shortestPath(idx, { kind: 'film', id: 'A' }, 'D')).toBeNull()
  })
})

describe('shipped data', () => {
  const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8')) as GraphData
  const file = JSON.parse(readFileSync('public/data/puzzles.json', 'utf8')) as PuzzleFile
  const idx = buildIndex(graph)

  it('every scheduled puzzle is solvable in exactly par links', () => {
    for (const pz of file.puzzles.slice(0, 120)) {
      const p = shortestPath(idx, { kind: 'film', id: pz.s }, pz.e)
      expect(p, `${pz.s}→${pz.e}`).not.toBeNull()
      expect(linkCount(p!)).toBe(pz.par)
    }
  })
  it('random puzzles are solvable and hit the requested par when possible', () => {
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const want of [2, 3, 4]) {
      const pz = randomPuzzle(idx, want, rng)!
      expect(pz.par).toBe(want)
      expect(linkCount(shortestPath(idx, { kind: 'film', id: pz.s }, pz.e)!)).toBe(want)
    }
  })
})

describe('daily schedule', () => {
  const file: PuzzleFile = { epoch: '2026-09-01', puzzles: [{ s: 'A', e: 'C', par: 2 }, { s: 'B', e: 'C', par: 1 }] }
  it('numbers days from the epoch and wraps', () => {
    expect(puzzleNumber(file, '2026-08-31')).toBeNull()
    expect(puzzleNumber(file, '2026-09-01')).toBe(1)
    expect(puzzleFor(file, '2026-09-03')).toEqual(file.puzzles[0])
  })
  it('handles month boundaries and DST-free day math', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(dayDiff('2026-03-01', '2026-04-01')).toBe(31)
  })
})

describe('stats', () => {
  const r = (links: number, live = true, gaveUp = false): Result =>
    ({ links, par: 2, seconds: 60, hints: 0, gaveUp, path: [], live })
  it('counts streaks from yesterday if today is unplayed, ignoring archive plays', () => {
    const s = computeStats(
      { '2026-09-26': r(2), '2026-09-27': r(3), '2026-09-28': r(2), '2026-09-24': r(2, false) },
      '2026-09-29',
    )
    expect(s.streak).toBe(3)
    expect(s.best).toBe(3)
    expect(s.overPar).toEqual({ Par: 3, '+1': 1 })
  })
  it('a give-up breaks the streak', () => {
    expect(computeStats({ '2026-09-28': r(2), '2026-09-29': r(2, true, true) }, '2026-09-29').streak).toBe(0)
  })
})
