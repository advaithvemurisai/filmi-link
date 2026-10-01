import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildIndex, isValidChain, linkCount, randomPuzzle, shortestPath, startFaces, type GraphData, type Node } from './graph'
import { validChallenge, validResults } from './results'
import { addDays, dayDiff, puzzleFor, puzzleNumber, type PuzzleFile } from './daily'
import { collectCast, computeStats, loadCast, loadProgress, loadResults, ratingFor, type Result } from './storage'

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
  it('rejects chains saved against other data', () => {
    const good: Node[] = [{ kind: 'film', id: 'A' }, { kind: 'person', id: 'p1' }, { kind: 'film', id: 'B' }]
    expect(isValidChain(idx, good, 'A')).toBe(true)
    expect(isValidChain(idx, good, 'A', 'C')).toBe(false)
    expect(isValidChain(idx, [{ kind: 'film', id: 'f116' }], 'A')).toBe(false)
    expect(isValidChain(idx, [{ kind: 'film', id: 'A' }, { kind: 'person', id: 'p300' }], 'A')).toBe(false)
    expect(isValidChain(idx, undefined, 'A')).toBe(false)
  })
  it('returns null when unreachable', () => {
    expect(shortestPath(idx, { kind: 'film', id: 'A' }, 'D')).toBeNull()
  })
})

describe('shipped data', () => {
  const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8')) as GraphData
  const idx = buildIndex(graph)
  const tracks = ['puzzles', 'puzzles-hi', 'puzzles-ta', 'puzzles-te', 'puzzles-ml', 'puzzles-kn']
    .map((name) => `public/data/${name}.json`)
    .filter((path) => existsSync(path))

  it.each(tracks)('%s: every scheduled puzzle is solvable in exactly par links', (path) => {
    const file = JSON.parse(readFileSync(path, 'utf8')) as PuzzleFile
    for (const pz of file.puzzles.slice(0, 120)) {
      const p = shortestPath(idx, { kind: 'film', id: pz.s }, pz.e)
      expect(p, `${pz.s}→${pz.e}`).not.toBeNull()
      expect(linkCount(p!)).toBe(pz.par)
    }
  })

  it.each(tracks)('%s: alternate routes are real shortest chains and reveals name real people', (path) => {
    const file = JSON.parse(readFileSync(path, 'utf8')) as PuzzleFile
    for (const pz of file.puzzles.slice(0, 120)) {
      for (const ids of pz.alts ?? []) {
        const chain = ids.map((id, i): Node => ({ kind: i % 2 === 0 ? 'film' : 'person', id }))
        expect(isValidChain(idx, chain, pz.s, pz.e), ids.join('>')).toBe(true)
        expect(linkCount(chain)).toBe(pz.par)
        // Every hop is a real credit.
        for (let i = 1; i < chain.length; i += 2) {
          const credits = new Set((idx.filmCredits[chain[i - 1].id] ?? []).map((c) => c.id))
          const next = new Set((idx.filmCredits[chain[i + 1].id] ?? []).map((c) => c.id))
          expect(credits.has(chain[i].id) && next.has(chain[i].id), ids.join('>')).toBe(true)
        }
      }
      if (pz.spot) expect(pz.spot.p in graph.people).toBe(true)
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
    expect(s.tiers).toEqual({ Blockbuster: 3, Hit: 1 })
    expect(s.blockbusters).toBe(3)
  })
  it('rates by links over par, and a hint caps a shortest chain at Hit', () => {
    expect([2, 3, 4, 5, 9].map((links) => ratingFor(links, 2))).toEqual(['Blockbuster', 'Hit', 'Flop', 'Disaster', 'Disaster'])
    expect(ratingFor(2, 2, 1)).toBe('Hit')
    expect(ratingFor(3, 2, 1)).toBe('Hit')
  })
  it('a give-up breaks the streak', () => {
    expect(computeStats({ '2026-09-28': r(2), '2026-09-29': r(2, true, true) }, '2026-09-29').streak).toBe(0)
  })
})

describe('results survive data refreshes (QA C4)', () => {
  const idx = buildIndex(tiny)
  const file: PuzzleFile = { epoch: '2026-09-01', puzzles: [{ s: 'A', e: 'C', par: 2 }, { s: 'A', e: 'C', par: 1 }] }
  const chain: Node[] = [{ kind: 'film', id: 'A' }, { kind: 'person', id: 'p1' }, { kind: 'film', id: 'B' }, { kind: 'person', id: 'p2' }, { kind: 'film', id: 'C' }]
  const result = (par: number): Result => ({ links: 2, par, seconds: 30, hints: 0, gaveUp: false, live: true, path: chain })

  it('keeps a result recorded when par was higher than the schedule now says', () => {
    const kept = validResults(idx, file, { '2026-09-01': result(3), '2026-09-02': result(2) })
    expect(Object.keys(kept)).toEqual(['2026-09-01', '2026-09-02'])
    expect(kept['2026-09-01'].par).toBe(3) // rating stays against the par it was played at
  })
  it('still drops a result whose chain no longer exists or is for a different puzzle', () => {
    const wrongEnd: Result = { ...result(2), path: chain.slice(0, 3) }
    const gone: Result = { ...result(2), path: [{ kind: 'film', id: 'A' }, { kind: 'person', id: 'p9' }, { kind: 'film', id: 'C' }] }
    expect(validResults(idx, file, { '2026-09-01': wrongEnd, '2026-09-02': gone })).toEqual({})
  })
})

describe('landing first-move faces (QA A3)', () => {
  it('leaves out people with no other film, keeping order director → music → cast', () => {
    // B: p1 (director, also in A), p2 (actor, also in C), p3 would dead-end.
    const data: GraphData = {
      ...tiny,
      people: { ...tiny.people, p4: { n: 'Four', i: null } },
      credits: { ...tiny.credits, B: [['p2', 'Actor'], ['p4', 'Actor'], ['p1', 'Director']] },
    }
    const idx = buildIndex(data)
    expect(startFaces(idx, 'B')).toEqual(['p1', 'p2'])
  })
  it('every scheduled India daily offers at least 4 non-dead-end faces', () => {
    const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8')) as GraphData
    const file = JSON.parse(readFileSync('public/data/puzzles.json', 'utf8')) as PuzzleFile
    const idx = buildIndex(graph)
    for (const pz of file.puzzles) {
      const faces = startFaces(idx, pz.s)
      expect(faces.length, pz.s).toBeGreaterThanOrEqual(4)
      expect(faces.every((id) => idx.personFilms[id].length > 1), pz.s).toBe(true)
    }
  })
})

describe('challenge links (QA A5)', () => {
  it('rejects impossible or absurd scores', () => {
    expect([0, 1, 2].map((n) => validChallenge(n, 3))).toEqual([false, false, false])
    expect([3, 4, 12].map((n) => validChallenge(n, 3))).toEqual([true, true, true])
    expect(validChallenge(99, 3)).toBe(false)
  })
})

describe('corrupted storage (QA C5)', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v }, removeItem: (k: string) => { delete store[k] } })
  })
  it('falls back for null, wrong-shape and unparseable entries instead of crashing', () => {
    store['fl:results'] = 'null'
    store['fl:cast'] = 'null'
    expect(loadResults()).toEqual({})
    expect(loadCast()).toEqual({})
    store['fl:results'] = '[1,2]'; expect(loadResults()).toEqual({})
    store['fl:results'] = '"text"'; expect(loadResults()).toEqual({})
    store['fl:results'] = '{oops'; expect(loadResults()).toEqual({})
    store['fl:progress:2026-09-30'] = '{"path":"nope"}'; expect(loadProgress('2026-09-30')).toBeNull()
    expect(() => collectCast([{ kind: 'person', id: 'p1' }], '2026-09-30')).not.toThrow()
  })
})
