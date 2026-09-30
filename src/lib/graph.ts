export type Role = 'Director' | 'Music' | 'Actor'

export interface Film { t: string; y: number | null; l: string; p: string | null; pop: number }
export interface Person { n: string; i: string | null }

export interface GraphData {
  meta: { source: 'seed' | 'tmdb'; generated: string; films: number; people: number }
  films: Record<string, Film>
  people: Record<string, Person>
  credits: Record<string, [string, Role][]>
}

export interface Credit { id: string; role: Role }

/** A step in a chain: films and people alternate, always starting and ending on a film. */
export type Node = { kind: 'film' | 'person'; id: string }

export interface Index {
  data: GraphData
  filmCredits: Record<string, Credit[]>
  personFilms: Record<string, Credit[]>
}

export function buildIndex(data: GraphData): Index {
  const filmCredits: Record<string, Credit[]> = {}
  const personFilms: Record<string, Credit[]> = {}
  for (const [fid, rows] of Object.entries(data.credits)) {
    filmCredits[fid] = rows.map(([id, role]) => ({ id, role }))
    for (const [pid, role] of rows) (personFilms[pid] ??= []).push({ id: fid, role })
  }
  return { data, filmCredits, personFilms }
}

const key = (n: Node) => `${n.kind[0]}:${n.id}`

function neighbours(idx: Index, n: Node): Node[] {
  return n.kind === 'film'
    ? (idx.filmCredits[n.id] ?? []).map((c) => ({ kind: 'person', id: c.id }))
    : (idx.personFilms[n.id] ?? []).map((c) => ({ kind: 'film', id: c.id }))
}

/** Shortest chain from any node to a target film (inclusive of both ends), or null. */
export function shortestPath(idx: Index, from: Node, targetFilm: string): Node[] | null {
  const goal = `f:${targetFilm}`
  const parent = new Map<string, Node | null>([[key(from), null]])
  const queue: Node[] = [from]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (key(cur) === goal) {
      const path: Node[] = []
      for (let n: Node | null = cur; n; n = parent.get(key(n)) ?? null) path.unshift(n)
      return path
    }
    for (const nb of neighbours(idx, cur)) {
      if (!parent.has(key(nb))) {
        parent.set(key(nb), cur)
        queue.push(nb)
      }
    }
  }
  return null
}

export const nodeLabel = (idx: Index, n: Node) =>
  n.kind === 'film' ? idx.data.films[n.id].t : idx.data.people[n.id].n

/**
 * True if `path` is a well-formed chain in the *current* data starting at film `s`
 * (and ending at film `e`, if given). Guards against progress saved under older data.
 */
export function isValidChain(idx: Index, path: Node[] | undefined, s: string, e?: string): boolean {
  if (!Array.isArray(path) || !path.length) return false
  const ok = path.every((n, i) =>
    n && n.kind === (i % 2 === 0 ? 'film' : 'person') &&
    (n.kind === 'film' ? n.id in idx.data.films : n.id in idx.data.people))
  const last = path[path.length - 1]
  return ok && path[0].id === s && (e === undefined || (last.kind === 'film' && last.id === e))
}

/** Links = number of people in a chain. */
export const linkCount = (path: Node[]) => path.filter((n) => n.kind === 'person').length

/** Random solvable puzzle for free play, with par as close to `want` as the graph allows. */
export function randomPuzzle(idx: Index, want: number, rng = Math.random) {
  const films = Object.keys(idx.data.films).sort((a, b) => idx.data.films[b].pop - idx.data.films[a].pop)
  // Endpoints come from well-known films only (matches POOL_SIZE in generate_puzzles.py).
  const pool = films.slice(0, Math.min(800, Math.max(60, Math.floor(films.length * 0.4))))
  let best: { s: string; e: string; par: number } | null = null
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = pool[Math.floor(rng() * pool.length)]
    const dist = filmDistances(idx, s)
    const cands = pool.filter((f) => f !== s && (dist.get(f) ?? 0) >= 2)
    if (!cands.length) continue
    const gap = Math.min(...cands.map((f) => Math.abs(dist.get(f)! - want)))
    const pick = cands.filter((f) => Math.abs(dist.get(f)! - want) === gap)
    const e = pick[Math.floor(rng() * pick.length)]
    if (!best || gap < Math.abs(best.par - want)) best = { s, e, par: dist.get(e)! }
    if (gap === 0) break
  }
  return best
}

function filmDistances(idx: Index, start: string): Map<string, number> {
  const dist = new Map([[start, 0]])
  const seenPeople = new Set<string>()
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const f = queue[head]
    for (const c of idx.filmCredits[f] ?? []) {
      if (seenPeople.has(c.id)) continue
      seenPeople.add(c.id)
      for (const g of idx.personFilms[c.id] ?? []) {
        if (!dist.has(g.id)) {
          dist.set(g.id, dist.get(f)! + 1)
          queue.push(g.id)
        }
      }
    }
  }
  return dist
}
