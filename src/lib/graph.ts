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
  /** Distinct films per person (the generator's "degree", used by the old No Superstars cut). */
  degree: Record<string, number>
  /** Each leading star's best fame rank (0 = most famous) across the home industries; see `starRanks`. */
  starRank: Record<string, number>
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

// Mirrors star_ranks() in pipeline/generate_puzzles.py: change both together.
const STAR_LANGS: ReadonlySet<string> = new Set(['hi', 'ta', 'te', 'ml', 'kn'])
const STAR_BILLING = 2
const STAR_MIN_LEADS = 5

/**
 * Who counts as a superstar: fame is the votes on films a person was billed in the top two actors of,
 * ranked within each home industry, for anyone with enough leading roles. Character actors and crew,
 * however many films they've made, are never stars.
 */
function starRanks(data: GraphData): Record<string, number> {
  const fame: Record<string, Map<string, number>> = {}
  const leads = new Map<string, number>()
  for (const [fid, rows] of Object.entries(data.credits)) {
    const film = data.films[fid]
    for (const pid of new Set(rows.filter(([, r]) => r === 'Actor').slice(0, STAR_BILLING).map(([p]) => p))) {
      leads.set(pid, (leads.get(pid) ?? 0) + 1)
      if (STAR_LANGS.has(film.l)) (fame[film.l] ??= new Map()).set(pid, (fame[film.l].get(pid) ?? 0) + film.pop)
    }
  }
  const ranks: Record<string, number> = {}
  for (const votes of Object.values(fame)) {
    const order = [...votes.keys()]
      .filter((p) => (leads.get(p) ?? 0) >= STAR_MIN_LEADS)
      .sort((a, b) => votes.get(b)! - votes.get(a)! || (a < b ? -1 : a > b ? 1 : 0))
    order.forEach((pid, i) => { ranks[pid] = Math.min(i, ranks[pid] ?? i) })
  }
  return ranks
}

/**
 * A day's rule, from the weekly ladder. `nostars`: each industry's `stars` most famous leading stars sit
 * the day out (puzzles from before that carry `ban` instead: people with that many films sat out).
 * `crew`: anyone can link films, but the chain must make at least `min` crew links (see `crewLink`).
 * A `crew` puzzle without `min` was published under the old rule, where only director and music credits link.
 */
export interface Rule { kind: 'nostars' | 'crew'; ban?: number; stars?: number; min?: number }

/** Whether one credit (a person in a role on some film) can be used under the day's rule. */
export function creditOk(idx: Index, rule: Rule | null | undefined, personId: string, role: Role): boolean {
  if (!rule) return true
  if (rule.kind === 'nostars') {
    return rule.stars ? (idx.starRank[personId] ?? Infinity) >= rule.stars : (idx.degree[personId] ?? 0) < (rule.ban ?? Infinity)
  }
  return rule.min !== undefined || role !== 'Actor'
}

/** Crew links a chain must make under the day's rule (0 on any other day). */
export const crewNeeded = (rule: Rule | null | undefined) => (rule?.kind === 'crew' ? rule.min ?? 0 : 0)

const crewCredit = (idx: Index, filmId: string, personId: string) =>
  (idx.filmCredits[filmId] ?? []).some((c) => c.id === personId && c.role !== 'Actor')

/** A crew link: the person directed or scored both films on either side of them (two different films). */
export const crewLink = (idx: Index, a: string, personId: string, b: string) =>
  a !== b && crewCredit(idx, a, personId) && crewCredit(idx, b, personId)

/** Crew links made along a chain (films and people alternating, a film first). */
export function crewLinks(idx: Index, path: Node[]): number {
  let n = 0
  for (let i = 1; i + 1 < path.length; i += 2) n += +crewLink(idx, path[i - 1].id, path[i].id, path[i + 1].id)
  return n
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
    data, filmCredits, personFilms, degree, starRank: starRanks(data),
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
  return shortestOnward(idx, [from], targetFilm, rule)
}

/**
 * Shortest way on from the end of `path` to a target film, under the day's rule (a Crew Call chain must
 * still make the crew links it's missing), or null.
 */
export function shortestOnward(idx: Index, path: Node[], targetFilm: string, rule?: Rule | null): Node[] | null {
  const need = crewNeeded(rule)
  return need ? crewShortest(idx, path, targetFilm, need) : plainShortest(idx, path[path.length - 1], targetFilm, rule)
}

function plainShortest(idx: Index, from: Node, targetFilm: string, rule?: Rule | null): Node[] | null {
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

/** The graph as numbered films and people, with whether each credit is a crew (director/music) one. */
interface Numbered { fid: string[]; pid: string[]; fi: Map<string, number>; pi: Map<string, number>; fp: number[][]; pf: number[][]; fcrew: boolean[][]; pcrew: boolean[][] }
const numbered = new WeakMap<Index, Numbered>()
function numberGraph(idx: Index): Numbered {
  let g = numbered.get(idx)
  if (g) return g
  const fid = Object.keys(idx.filmCredits), pid = Object.keys(idx.personFilms)
  const fi = new Map(fid.map((id, i) => [id, i])), pi = new Map(pid.map((id, i) => [id, i]))
  const fp: number[][] = fid.map(() => []), fcrew: boolean[][] = fid.map(() => [])
  const pf: number[][] = pid.map(() => []), pcrew: boolean[][] = pid.map(() => [])
  fid.forEach((id, f) => {
    const crew = new Map<number, boolean>()
    for (const c of idx.filmCredits[id]) {
      const p = pi.get(c.id)!
      crew.set(p, (crew.get(p) ?? false) || c.role !== 'Actor')
    }
    for (const [p, isCrew] of crew) {
      fp[f].push(p); fcrew[f].push(isCrew)
      pf[p].push(f); pcrew[p].push(isCrew)
    }
  })
  g = { fid, pid, fi, pi, fp, pf, fcrew, pcrew }
  numbered.set(idx, g)
  return g
}

/**
 * Crew Call search: BFS over (film, crew links made) and (person, crew links made, film they were reached
 * from through a crew credit). Leaving such a person through a crew credit on another film is a crew link.
 * Two different "reached from" films per person and count are enough: every next film differs from one.
 * The same film can be visited twice, once short of the crew links and once with them.
 */
function crewShortest(idx: Index, path: Node[], targetFilm: string, need: number): Node[] | null {
  const g = numberGraph(idx)
  const F = g.fid.length, P = g.pid.length, L = need + 1
  const goal = g.fi.get(targetFilm)
  if (goal === undefined) return null
  // Film state c*F + f; person state ((c*P + p) * 3 + slot), slot 0 = not reached through a crew credit.
  const filmFrom = new Int32Array(F * L).fill(-2) // -2 unvisited, -1 start, else the person state before
  const personFrom = new Int32Array(P * L * 3).fill(-2)
  const via = new Int32Array(P * L * 3).fill(-1)
  const queue: number[] = [] // films as state, people as -(state + 1)

  const from = path[path.length - 1], prev = path[path.length - 2]
  const made = Math.min(need, crewLinks(idx, path))
  if (from.kind === 'film') {
    const f = g.fi.get(from.id)
    if (f === undefined) return null
    filmFrom[made * F + f] = -1
    queue.push(made * F + f)
  } else {
    const p = g.pi.get(from.id)
    if (p === undefined) return null
    const crew = !!prev && crewCredit(idx, prev.id, from.id)
    const st = (made * P + p) * 3 + +crew
    personFrom[st] = -1
    if (crew) via[st] = g.fi.get(prev.id) ?? -1
    queue.push(-(st + 1))
  }

  for (let head = 0; head < queue.length; head++) {
    const q = queue[head]
    if (q >= 0) {
      const c = Math.floor(q / F), f = q % F
      if (f === goal && c === need) {
        const out: Node[] = []
        for (let st = q, film = true; st !== -1; film = !film) {
          if (film) { out.unshift({ kind: 'film', id: g.fid[st % F] }); st = filmFrom[st] }
          else { out.unshift({ kind: 'person', id: g.pid[Math.floor(st / 3) % P] }); st = personFrom[st] }
        }
        return out
      }
      const ps = g.fp[f], crew = g.fcrew[f]
      for (let i = 0; i < ps.length; i++) {
        const base = (c * P + ps[i]) * 3
        let st = base
        if (crew[i]) {
          if (via[base + 1] === -1 || via[base + 1] === f) st = base + 1
          else if (via[base + 2] === -1 || via[base + 2] === f) st = base + 2
          else continue
        }
        if (personFrom[st] !== -2) continue
        personFrom[st] = q
        if (crew[i]) via[st] = f
        queue.push(-(st + 1))
      }
    } else {
      const st = -q - 1, slot = st % 3, cp = Math.floor(st / 3), c = Math.floor(cp / P), p = cp % P
      const fs = g.pf[p], crew = g.pcrew[p], v = via[st]
      for (let i = 0; i < fs.length; i++) {
        const next = Math.min(need, c + +(slot > 0 && crew[i] && fs[i] !== v)) * F + fs[i]
        if (filmFrom[next] !== -2) continue
        filmFrom[next] = st
        queue.push(next)
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
