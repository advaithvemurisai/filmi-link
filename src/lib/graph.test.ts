import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { buildIndex, canUse, isValidChain, linkCount, randomPuzzle, shortestPath, startFaces, type GraphData, type Node } from './graph'
import { freeFromLink, parseFreeLink, validChallenge, validResults } from './results'
import { addDays, dayDiff, puzzleFor, puzzleNumber, ruleOf, type PuzzleFile } from './daily'
import { collectCast, computeStats, loadCast, loadProgress, loadResults, ratingFor, saveResults, type Result } from './storage'

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

describe('free-play share links', () => {
  const idx = buildIndex(tiny)
  it('parses the pair, with the score and chain when present', () => {
    expect(parseFreeLink('?r=12.34')).toEqual({ s: '12', e: '34', links: null, mids: [] })
    expect(parseFreeLink('?r=12.34-2.5.6.7')).toEqual({ s: '12', e: '34', links: 2, mids: ['5', '6', '7'] })
    expect(parseFreeLink('?r=12')).toBeNull()
    expect(parseFreeLink('?c=1-2')).toBeNull()
  })
  it('rebuilds the puzzle and par from the graph', () => {
    expect(freeFromLink(idx, { s: 'A', e: 'C', links: null, mids: [] })).toEqual({ puzzle: { s: 'A', e: 'C', par: 2 } })
  })
  it("rebuilds the friend's chain when it is valid", () => {
    const r = freeFromLink(idx, { s: 'A', e: 'C', links: 2, mids: ['p1', 'B', 'p2'] })!
    expect(r.friend?.links).toBe(2)
    expect(r.friend?.path?.map((n) => n.id)).toEqual(['A', 'p1', 'B', 'p2', 'C'])
    // A chain naming unknown films keeps the score but drops the route.
    expect(freeFromLink(idx, { s: 'A', e: 'C', links: 2, mids: ['p1', 'X', 'p2'] })!.friend).toEqual({ links: 2, path: null })
    // A score under par is impossible, so it is ignored.
    expect(freeFromLink(idx, { s: 'A', e: 'C', links: 1, mids: [] })!.friend).toBeUndefined()
  })
  it('rejects unknown, identical or unconnected films', () => {
    expect(freeFromLink(idx, { s: 'A', e: 'Z', links: null, mids: [] })).toBeNull()
    expect(freeFromLink(idx, { s: 'A', e: 'A', links: null, mids: [] })).toBeNull()
    expect(freeFromLink(idx, { s: 'A', e: 'D', links: null, mids: [] })).toBeNull()
  })
})

// Full-graph BFS over ~19k films; CI runners are slower than local machines.
describe('shipped data', { timeout: 30_000 }, () => {
  const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8')) as GraphData
  const idx = buildIndex(graph)
  const tracks = ['puzzles', 'puzzles-hi', 'puzzles-ta', 'puzzles-te', 'puzzles-ml', 'puzzles-kn']
    .map((name) => `public/data/${name}.json`)
    .filter((path) => existsSync(path))

  it.each(tracks)('%s: every scheduled puzzle is solvable in exactly par links under its rule', (path) => {
    const file = JSON.parse(readFileSync(path, 'utf8')) as PuzzleFile
    for (const pz of file.puzzles.slice(0, 120)) {
      const p = shortestPath(idx, { kind: 'film', id: pz.s }, pz.e, ruleOf(pz))
      expect(p, `${pz.s}→${pz.e}`).not.toBeNull()
      expect(linkCount(p!), `${pz.s}→${pz.e} ${pz.rule ?? ''}`).toBe(pz.par)
    }
  })

  it('landing.json previews match what the full graph would show', () => {
    if (!existsSync('public/data/landing.json')) return
    const landing = JSON.parse(readFileSync('public/data/landing.json', 'utf8')) as { days: Record<string, { faces: [string, string][] }> }
    const file = JSON.parse(readFileSync('public/data/puzzles.json', 'utf8')) as PuzzleFile
    for (const [d, v] of Object.entries(landing.days)) {
      const pz = puzzleFor(file, d)!
      const ids = startFaces(idx, pz.s, 8, ruleOf(pz))
      expect(v.faces.map(([id]) => id), d).toEqual(ids.length >= 3 ? ids : [])
    }
  })

  it.each(tracks)('%s: rule days only use credits the rule allows on their shortest routes', (path) => {
    const file = JSON.parse(readFileSync(path, 'utf8')) as PuzzleFile
    const ruled = file.puzzles.filter((pz) => pz.rule).slice(0, 60)
    for (const pz of ruled) {
      for (const ids of pz.alts ?? []) {
        for (let i = 1; i < ids.length; i += 2) {
          expect(canUse(idx, ruleOf(pz), ids[i - 1], ids[i]) && canUse(idx, ruleOf(pz), ids[i + 1], ids[i]), `${pz.rule} ${ids.join('>')}`).toBe(true)
        }
      }
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
      expect(linkCount(shortestPath(idx, { kind: 'film', id: pz.s }, pz.e)!)).toBe(pz.par)
    }
  })
  it('par 4 is reachable: well-known start, end widened only as far as the top 2500', () => {
    const rank = new Map(
      Object.keys(graph.films)
        .sort((a, b) => graph.films[b].pop - graph.films[a].pop)
        .map((id, i) => [id, i]),
    )
    for (let seed = 1; seed <= 10; seed++) {
      let x = seed
      const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647)
      const pz = randomPuzzle(idx, 4, rng)!
      expect(pz.par).toBe(4)
      expect(rank.get(pz.s)!).toBeLessThan(800)
      expect(rank.get(pz.e)!).toBeLessThan(2500)
    }
  })
  it('random puzzles skip recently used films', () => {
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const recent = new Set<string>()
    for (let i = 0; i < 15; i++) {
      const pz = randomPuzzle(idx, 3, rng, recent)!
      expect(recent.has(pz.s) || recent.has(pz.e)).toBe(false)
      recent.add(pz.s).add(pz.e)
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
  it('a stale tab saving its results never erases a day another tab saved', () => {
    const r = (links: number) => ({ links, par: 2, seconds: 30, hints: 0, gaveUp: false, live: true, path: [] }) as Result
    saveResults({ '2026-10-08': r(2) })                       // tab A finishes Thursday
    saveResults({ '2026-10-07': r(3), '2026-10-09': r(2) })   // tab B, loaded before that, saves Friday
    expect(Object.keys(loadResults()).sort()).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
  })
})
