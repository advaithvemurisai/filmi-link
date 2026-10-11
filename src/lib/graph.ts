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
  /** Distinct films per person (the generator's "degree", used by the No Superstars cut). */
  degree: Record<string, number>
  /** Films whose title another film shares (e.g. Baby in Hindi and in Tamil): show their language. */
  sharedTitle: Set<string>
  /** People whose name another person shares (two Rekhas): show what they're known for. */
  sharedName: Set<string>
}

/** Industries no longer in the game (RETIRED_LANGUAGES in pipeline/graph_io.py). Their films stay in the
 * graph only for already-published puzzles, so they're never picked as a random chain's endpoints. */
export const RETIRED_LANGS: ReadonlySet<string> = new Set(['bn'])

/** A person's best-known film (most votes), to tell namesakes apart. */
export function knownFor(idx: Index, personId: string): string | null {
  let best: string | null = null
  for (const c of idx.personFilms[personId] ?? []) if (!best || idx.data.films[c.id].pop > idx.data.films[best].pop) best = c.id
  return best
}

/**
 * A day's rule, from the weekly ladder. `nostars`: people with `ban` or more films sit the day out.
 * `crew`: only director and music credits link films.
 */
export interface Rule { kind: 'nostars' | 'crew'; ban?: number }

/** Whether one credit (a person in a role on some film) can be used under the day's rule. */
export function creditOk(idx: Index, rule: Rule | null | undefined, personId: string, role: Role): boolean {
  if (!rule) return true
  if (rule.kind === 'nostars') return (idx.degree[personId] ?? 0) < (rule.ban ?? Infinity)
  return role !== 'Actor'
}

/** Whether `personId` can link through `filmId` under the day's rule (any of their credits on it counts). */
export function canUse(idx: Index, rule: Rule | null | undefined, filmId: string, personId: string): boolean {
  return !rule || (idx.filmCredits[filmId] ?? []).some((c) => c.id === personId && creditOk(idx, rule, personId, c.role))
}

export function buildIndex(data: GraphData): Index {
  const filmCredits: Record<string, Credit[]> = {}
  const personFilms: Record<string, Credit[]> = {}
  for (const [fid, rows] of Object.entries(data.credits)) {
    filmCredits[fid] = rows.map(([id, role]) => ({ id, role }))
    for (const [pid, role] of rows) (personFilms[pid] ??= []).push({ id: fid, role })
  }
  const degree: Record<string, number> = {}
  for (const [pid, credits] of Object.entries(personFilms)) degree[pid] = new Set(credits.map((c) => c.id)).size
  const shared = <T,>(items: [string, T][], label: (v: T) => string) => {
    const seen = new Map<string, string[]>()
    for (const [id, v] of items) {
      const k = label(v).trim().toLowerCase()
      seen.set(k, [...(seen.get(k) ?? []), id])
    }
    return new Set([...seen.values()].filter((ids) => ids.length > 1).flat())
  }
  return {
    data, filmCredits, personFilms, degree,
    sharedTitle: shared(Object.entries(data.films), (f) => f.t),
    sharedName: shared(Object.entries(data.people), (p) => p.n),
  }
}

const key = (n: Node) => `${n.kind[0]}:${n.id}`

function neighbours(idx: Index, n: Node, rule?: Rule | null): Node[] {
  return n.kind === 'film'
    ? (idx.filmCredits[n.id] ?? []).filter((c) => canUse(idx, rule, n.id, c.id)).map((c) => ({ kind: 'person', id: c.id }))
    : (idx.personFilms[n.id] ?? []).filter((c) => canUse(idx, rule, c.id, n.id)).map((c) => ({ kind: 'film', id: c.id }))
}

/** Shortest chain from any node to a target film (inclusive of both ends) under the day's rule, or null. */
export function shortestPath(idx: Index, from: Node, targetFilm: string, rule?: Rule | null): Node[] | null {
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
    for (const nb of neighbours(idx, cur, rule)) {
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

/**
 * Random solvable puzzle for free play, with par as close to `want` as the graph allows.
 * Films in `avoid` (recent random chains) are skipped while fresh ones are left, so back-to-back
 * chains don't keep landing on the same few films.
 */
export function randomPuzzle(idx: Index, want: number, rng = Math.random, avoid: ReadonlySet<string> = new Set()) {
  const films = Object.keys(idx.data.films).filter((f) => !RETIRED_LANGS.has(idx.data.films[f].l)).sort((a, b) => idx.data.films[b].pop - idx.data.films[a].pop)
  // Endpoints come from well-known films only (matches POOL_SIZE in generate_puzzles.py).
  const pool = films.slice(0, Math.min(800, Math.max(60, Math.floor(films.length * 0.4))))
  // Well-known films sit so close together that par 4 rarely exists inside the pool, so the end film
  // may come from this wider (still recognisable) set when the pool has no exact match.
  const wide = films.slice(0, Math.max(pool.length, 2500)).filter((f) => !avoid.has(f))
  const fresh = pool.filter((f) => !avoid.has(f))
  const starts = fresh.length >= 20 ? fresh : pool
  let best: { s: string; e: string; par: number } | null = null
  for (let attempt = 0; attempt < 40; attempt++) {
    const s = starts[Math.floor(rng() * starts.length)]
    const dist = filmDistances(idx, s)
    const reachable = (f: string) => f !== s && (dist.get(f) ?? 0) >= 2
    const freshCands = fresh.filter(reachable)
    const cands = freshCands.length ? freshCands : pool.filter(reachable)
    if (!cands.length) continue
    let gap = Math.min(...cands.map((f) => Math.abs(dist.get(f)! - want)))
    let pick = cands.filter((f) => Math.abs(dist.get(f)! - want) === gap)
    if (gap > 0) {
      const exact = wide.filter((f) => f !== s && dist.get(f) === want)
      if (exact.length) [gap, pick] = [0, exact]
    }
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

/**
 * The people shown on the landing page as the first move: the film's director, composer and top-billed
 * cast. Anyone with no other film is left out, since picking them would dead-end the chain at once.
 */
/** Fewest faces worth showing as a first move; below this the landing page just offers Play. */
export const MIN_START_FACES = 3

export function startFaces(idx: Index, filmId: string, n = 8, rule?: Rule | null): string[] {
  const order: Record<Role, number> = { Director: 0, Music: 1, Actor: 2 }
  const seen = new Set<string>()
  return [...(idx.filmCredits[filmId] ?? [])]
    .sort((a, b) => order[a.role] - order[b.role])
    .filter((c) => canUse(idx, rule, filmId, c.id) && (idx.personFilms[c.id]?.length ?? 0) > 1 && !seen.has(c.id) && seen.add(c.id))
    .slice(0, n)
    .map((c) => c.id)
}
