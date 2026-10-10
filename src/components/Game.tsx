import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { isValidChain, linkCount, nodeLabel, shortestPath, type Index, type Node, type Role } from '../lib/graph'
import { difficultyOf, localDateKey, msToMidnight, type PuzzleDef } from '../lib/daily'
import { IMG, clock } from '../lib/format'
import { MAX_SECONDS, collectCast, isRareRoute, ratingFor, scoreFor, type Progress, type Result, type ScoreParts } from '../lib/storage'
import { Avatar, Filmstrip, Icon, LangTag, ParMeter, Poster, Stamp } from './Bits'
import { ROLE_ICON, launchFrom } from './bit-helpers'
import RouteMap from './RouteMap'
import { Reminders } from './Reminders'

const ROLE_ORDER: Record<Role, number> = { Director: 0, Music: 1, Actor: 2 }
const GROUPS: [Role, string][] = [['Director', 'Direction'], ['Music', 'Music'], ['Actor', 'Cast']]

interface Props {
  idx: Index
  puzzle: PuzzleDef
  label: string
  hard: boolean
  /** Before the first pick the player chooses Normal or Hard; the choice then holds for the puzzle. */
  onHardChange: (hard: boolean) => void
  initialProgress: Progress | null
  initialResult: Result | null
  onProgress: (p: Progress) => void
  onFinish: (r: Omit<Result, 'live'>) => void
  onNewRandom: (par: number) => void
  onOpenArchive: () => void
  shareTitle: string
  /** Today's daily: the result screen counts down to the next one. */
  isToday: boolean
  /** India daily number, so share links can challenge friends to beat the score. */
  dailyNo: number | null
  /** Home-cinema language of this daily, so its share link points back at the right schedule. */
  shareLang: string | null
  /** Free play: share links carry the random pair so friends can play it too. */
  free: boolean
  /** Links a friend's share link said they used today, if the player arrived from one. */
  challenge: number | null
  /** The friend's full chain from their share link, shown next to yours once the puzzle is over. */
  friendPath: Node[] | null
  /** First game after starting from the landing page: show a one-line guide instead of the tutorial. */
  coach: boolean
  /** How many players took the same route today (pan-India daily, signed-in players only). */
  routeShare: { count: number; total: number } | null
  /** Signed-in player's name, or null when playing anonymously. */
  player: string | null
  onSaveStreak: () => void
  onOpenFriends: () => void
}

type Option = { node: Node; role: Role }

/** A button that needs a second tap within a few seconds, for actions that end or cost something. */
function useArmed(ms = 3500) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), ms)
    return () => clearTimeout(t)
  }, [armed, ms])
  return [armed, setArmed] as const
}

export default function Game(props: Props) {
  const { idx, puzzle, hard } = props
  const { films } = idx.data
  const start: Node = { kind: 'film', id: puzzle.s }

  const [path, setPath] = useState<Node[]>(props.initialResult?.path ?? props.initialProgress?.path ?? [start])
  const [startedAt] = useState(() => props.initialProgress?.startedAt ?? Date.now())
  const [hints, setHints] = useState(props.initialResult?.hints ?? props.initialProgress?.hints ?? 0)
  const [hint, setHint] = useState<Node | null>(null)
  const [result, setResult] = useState<Omit<Result, 'live'> | null>(props.initialResult)
  const [newFaces, setNewFaces] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [query, setQuery] = useState('')
  const [quitArmed, setQuitArmed] = useArmed()
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Time spent with the tab hidden doesn't count against the speed score.
  const pausedMs = useRef(0)
  const hiddenAt = useRef<number | null>(document.hidden ? Date.now() : null)

  const current = path[path.length - 1]
  const links = linkCount(path)
  // The "one tap from the target" rings are a lifeline, not a guide: they appear only once the
  // player has spent the shortest chain's links and is behind. Hard mode never shows them.
  const assist = !hard && links >= puzzle.par

  useEffect(() => {
    if (result) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [result])

  useEffect(() => {
    if (!result) props.onProgress({ path, startedAt, hints })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, hints])

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null) {
        pausedMs.current += Date.now() - hiddenAt.current
        hiddenAt.current = null
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  const elapsedSeconds = (at: number) => Math.round((at - startedAt - pausedMs.current - (hiddenAt.current ? at - hiddenAt.current : 0)) / 1000)

  // Type anywhere (or press "/") to jump into the search box, so keyboard players never have to hunt for it.
  useEffect(() => {
    if (result) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || !/\S/.test(e.key)) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable], [role="dialog"]') || document.querySelector('[role="dialog"]')) return
      if (!searchRef.current) return
      if (e.key === '/') e.preventDefault()
      searchRef.current.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result])

  useEffect(() => {
    if (hint) listRef.current?.querySelector('.is-hint')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hint])

  // A result can arrive after the game mounts (signing in on a new device pulls today's from the server):
  // show it instead of letting the puzzle be played a second time.
  useEffect(() => {
    if (!props.initialResult || result) return
    setResult(props.initialResult)
    setPath(props.initialResult.path)
    setHints(props.initialResult.hints)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialResult])

  const optimal = useMemo(
    () => (result ? shortestPath(idx, start, puzzle.e) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, idx, puzzle.s, puzzle.e],
  )

  const inPath = useMemo(() => new Set(path.map((n) => `${n.kind}:${n.id}`)), [path])
  const targetCast = useMemo(() => new Set((idx.filmCredits[puzzle.e] ?? []).map((c) => c.id)), [idx, puzzle.e])

  const options = useMemo<Option[]>(() => {
    if (current.kind === 'film') {
      return [...(idx.filmCredits[current.id] ?? [])]
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
        .map((c) => ({ node: { kind: 'person' as const, id: c.id }, role: c.role }))
    }
    // One card per film, badged with their most notable role on it (director > music > actor).
    const best = new Map<string, Role>()
    for (const c of idx.personFilms[current.id] ?? []) {
      const r = best.get(c.id)
      if (!r || ROLE_ORDER[c.role] < ROLE_ORDER[r]) best.set(c.id, c.role)
    }
    return [...best]
      .sort(([a], [b]) => (films[b].y ?? 0) - (films[a].y ?? 0))
      .map(([id, role]) => ({ node: { kind: 'film' as const, id }, role }))
  }, [current, idx, films])

  const q = query.trim().toLowerCase()
  const visible = q ? options.filter((o) => nodeLabel(idx, o.node).toLowerCase().includes(q)) : options

  function finish(finalPath: Node[], gaveUp: boolean) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    const r = {
      links: linkCount(finalPath), par: puzzle.par, seconds: Math.max(0, Math.min(MAX_SECONDS, elapsedSeconds(Date.now()))),
      hints, gaveUp, path: finalPath,
    }
    if (!gaveUp) setNewFaces(collectCast(finalPath, localDateKey()).length)
    setResult(r)
    props.onFinish(r)
  }

  function go(node: Node, from?: Element | null) {
    // Every pick is permanent, even back to someone already in the chain: a loop costs its links.
    const next = [...path, node]
    launchFrom(from?.querySelector('.poster, .avatar') ?? null)
    setPath(next)
    setHint(null)
    setQuery('')
    listRef.current?.scrollTo({ top: 0 })
    if (node.kind === 'film' && node.id === puzzle.e) finish(next, false)
  }

  function takeHint() {
    // The hint for this step is already on screen; a second tap must not charge for it again.
    if (hint) return
    const sp = shortestPath(idx, current, puzzle.e)
    if (sp && sp[1]) {
      setHint(sp[1])
      setHints((h) => h + 1)
      setQuery('')
    }
  }

  function giveUp() {
    if (!quitArmed) return setQuitArmed(true)
    finish(path, true)
  }

  const seconds = result ? result.seconds : Math.max(0, Math.min(MAX_SECONDS, elapsedSeconds(now)))
  const isHint = (n: Node) => hint?.kind === n.kind && hint.id === n.id
  const deadEnd = !q && options.every((o) => inPath.has(`${o.node.kind}:${o.node.id}`))

  return (
    <main className="game">
      <Stage idx={idx} puzzle={puzzle} label={props.label} challenge={props.challenge} />

      {result ? (
        <ResultPanel {...props} result={result} optimal={optimal} newFaces={newFaces} />
      ) : (
        <>
          {path.length === 1 && (
            <div className="mode-pick" role="radiogroup" aria-label="Difficulty for this puzzle">
              <button role="radio" aria-checked={!hard} className={!hard ? 'on' : ''} onClick={() => props.onHardChange(false)}>
                <b>Normal</b><span>Hints and signal bars</span>
              </button>
              <button role="radio" aria-checked={hard} className={hard ? 'on' : ''} onClick={() => props.onHardChange(true)}>
                <b>Hard</b><span>No hints, no aids</span>
              </button>
            </div>
          )}

          <div className="toolbar">
            <ParMeter links={links} par={puzzle.par} />
            {hard && path.length > 1 && <span className="hard-badge" title="Hard mode for this puzzle">Hard</span>}
            <span className="timer" aria-label="Time"><Icon name="timer" size={14} /> {clock(seconds)}</span>
            <div className="tools">
              {!hard && (
                <button className="tool tool-hint" onClick={takeHint} disabled={!!hint}
                  title="Reveal the next step; using a hint caps your rating at Hit">
                  <Icon name="hint" size={16} />
                  <span className="tool-label">Hint</span>
                  {hints > 0 && <b className="tool-count">{hints}</b>}
                </button>
              )}
              <button className={`tool tool-quiet ${quitArmed ? 'is-armed' : ''}`} onClick={giveUp} title="Give up and see a solution">
                <Icon name="flag" size={16} /><span className="tool-label">{quitArmed ? 'Tap again to give up' : 'Give up'}</span>
              </button>
            </div>
          </div>

          {props.coach && (
            <p className="coach-strip" role="status">
              {current.kind === 'person'
                ? <>Now pick one of <b>{nodeLabel(idx, current)}</b>’s films.</>
                : <>Now pick someone from <b>{nodeLabel(idx, current)}</b>.</>}
              {' '}Keep hopping until you reach <b>{films[puzzle.e].t}</b>.
            </p>
          )}

          {/* Screen readers hear where the chain stands after every pick, and any hint. */}
          <p className="sr-only" role="status" aria-live="polite">
            {`Link ${links} of ${puzzle.par}. Now ${current.kind === 'film' ? 'at' : 'with'} ${nodeLabel(idx, current)}. ${options.length} options.`}
            {hint ? ` Hint: ${nodeLabel(idx, hint)}.` : ''}
          </p>

          <Filmstrip
            idx={idx} path={path} activeIndex={path.length - 1}
            goal={{ par: puzzle.par, target: puzzle.e }}
          />

          <div className="board">
            <section className="panel now-panel">
              <header className="now-head" key={`h${current.kind}${current.id}`}>
                {current.kind === 'film' ? <Poster idx={idx} id={current.id} size="md" /> : <Avatar idx={idx} id={current.id} size="xl" />}
                <div className="now-copy">
                  <p className="kicker">{current.kind === 'film' ? 'Now at' : 'Now with'}</p>
                  <h2>{nodeLabel(idx, current)}</h2>
                  <p className="meta">
                    {current.kind === 'film'
                      ? <>{films[current.id].y} <LangTag l={films[current.id].l} /></>
                      : <>{options.length} film{options.length === 1 ? '' : 's'}</>}
                  </p>
                </div>
                <span className="now-next">
                  {current.kind === 'film' ? 'Pick a person' : 'Pick a film'} <Icon name="arrow" size={14} />
                </span>
              </header>

              {options.length > 12 && (
                <label className="search">
                  <Icon name="search" size={16} />
                  <input
                    ref={searchRef}
                    placeholder={`${current.kind === 'film' ? 'Find cast & crew' : 'Find a film'}${KEYBOARD ? ' (press /)' : ''}`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && q && visible.length === 1) go(visible[0].node)
                      else if (e.key === 'Escape') setQuery('')
                    }}
                    enterKeyHint="go"
                  />
                </label>
              )}

              <div className="options" ref={listRef} key={`o${current.kind}${current.id}`}>
                {current.kind === 'film'
                  ? GROUPS.map(([role, title]) => {
                      const items = visible.filter((o) => o.role === role)
                      if (!items.length) return null
                      return (
                        <div className="group" key={role}>
                          <p className="group-head"><Icon name={ROLE_ICON[role]} size={13} /> {title} <em>{items.length}</em></p>
                          <div className="grid grid-people">
                            {items.map((o, i) => {
                              const used = inPath.has(`person:${o.node.id}`)
                              const others = (idx.personFilms[o.node.id]?.length ?? 1) - 1
                              return (
                                <PersonCard
                                  key={o.node.id + o.role} idx={idx} id={o.node.id} role={o.role} i={i}
                                  others={others} hard={hard} used={used}
                                  win={assist && !used && targetCast.has(o.node.id)} hint={isHint(o.node)}
                                  onPick={(el) => go(o.node, el)}
                                />
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  : (
                    <div className="grid grid-films">
                      {visible.map((o, i) => (
                        <FilmCard
                          key={o.node.id + o.role} idx={idx} id={o.node.id} role={o.role} i={i}
                          used={inPath.has(`film:${o.node.id}`)} target={o.node.id === puzzle.e} hint={isHint(o.node)}
                          onPick={(el) => go(o.node, el)}
                        />
                      ))}
                    </div>
                  )}
                {!visible.length && (
                  <p className="empty"><Icon name="search" size={22} /> Nothing matches “{query}”. Try part of a name.</p>
                )}
                {deadEnd && (
                  <p className="empty"><Icon name="ban" size={22} /> Only people and films already in your chain are left here. Picking one again costs a link.</p>
                )}
              </div>
            </section>

            <TargetPanel
              idx={idx}
              filmId={puzzle.e}
              hard={!assist}
              reachable={assist && current.kind === 'film' ? new Set(options.map((o) => o.node.id)) : new Set()}
              onPick={(id, el) => go({ kind: 'person', id }, el)}
            />
          </div>
        </>
      )}
    </main>
  )
}

/** Only mention the "/" shortcut where there's a keyboard to press it on. */
const KEYBOARD = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches

const stagger = (i: number) => ({ '--i': Math.min(i, 24) }) as CSSProperties

/** Rough "how connected is this person" level, shown as signal bars instead of a count. */
const reachLevel = (n: number) => (n === 0 ? 0 : n < 3 ? 1 : n < 6 ? 2 : n < 12 ? 3 : n < 25 ? 4 : 5)

function Reach({ n }: { n: number }) {
  const lvl = reachLevel(n)
  return (
    <span className={`reach ${n === 0 ? 'is-dead' : ''}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= lvl ? 'on' : ''} />)}
    </span>
  )
}

/** Small corner badge on a card: a non-colour cue for its state. */
function CardFlag({ win, used, hint }: { win: boolean; used: boolean; hint: boolean }) {
  if (hint) return <span className="card-flag is-hint" aria-hidden><Icon name="hint" size={12} /></span>
  if (win) return <span className="card-flag is-win" aria-hidden><Icon name="target" size={12} /></span>
  if (used) return <span className="card-flag is-used" aria-hidden><Icon name="check" size={12} /></span>
  return null
}

function PersonCard({
  idx, id, role, i, others, hard, used, win, hint, onPick,
}: {
  idx: Index; id: string; role: Role; i: number; others: number; hard: boolean
  used: boolean; win: boolean; hint: boolean; onPick: (el: HTMLElement) => void
}) {
  const name = idx.data.people[id].n
  const dead = !hard && others === 0
  const detail = hard ? role : `${role} · ${others === 0 ? 'no other films' : `${others} other film${others > 1 ? 's' : ''}`}`
  return (
    <button
      className={`card person-card ${used ? 'is-used' : ''} ${win ? 'is-win' : ''} ${hint ? 'is-hint' : ''} ${dead ? 'is-dead' : ''}`}
      style={stagger(i)}
      onClick={(e) => onPick(e.currentTarget)}
      title={`${name} · ${detail}${win ? ' · also worked on the target!' : ''}`}
    >
      <span className="card-art">
        <Avatar idx={idx} id={id} size="lg" />
        <span className="card-role" aria-hidden><Icon name={ROLE_ICON[role]} size={12} /></span>
        <CardFlag win={win} used={used} hint={hint} />
      </span>
      <span className="card-name">{name}</span>
      {!hard && <Reach n={others} />}
      <span className="sr-only">{detail}{win ? ', also worked on the target' : ''}{hint ? ', hint' : ''}</span>
    </button>
  )
}

function FilmCard({
  idx, id, role, i, used, target, hint, onPick,
}: {
  idx: Index; id: string; role: Role; i: number; used: boolean; target: boolean; hint: boolean
  onPick: (el: HTMLElement) => void
}) {
  const f = idx.data.films[id]
  return (
    <button
      className={`card film-card ${used ? 'is-used' : ''} ${target ? 'is-win' : ''} ${hint ? 'is-hint' : ''}`}
      style={stagger(i)}
      onClick={(e) => onPick(e.currentTarget)}
      title={`${f.t} (${f.y ?? '?'}) · as ${role.toLowerCase()}`}
    >
      <span className="card-art">
        <Poster idx={idx} id={id} size="md" />
        {f.y && <span className="card-year">{f.y}</span>}
        <span className="card-role" aria-hidden><Icon name={ROLE_ICON[role]} size={12} /></span>
        <CardFlag win={target} used={used && !target} hint={hint} />
      </span>
      <span className="card-name">{f.t}</span>
      <span className="sr-only">{target ? 'the target' : ''}{hint ? ', hint' : ''}</span>
    </button>
  )
}

/**
 * The target film's cast & crew as a wall of faces, so players can plan from both ends.
 * Faces who also worked on the current film are one tap from victory (except in hard mode).
 * On phones the header stays pinned while you scroll, so the target never leaves the screen.
 */
function TargetPanel({
  idx, filmId, hard, reachable, onPick,
}: {
  idx: Index
  filmId: string
  hard: boolean
  reachable: Set<string>
  onPick: (personId: string, el: HTMLElement) => void
}) {
  const [query, setQuery] = useState('')
  const [open] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 960px)').matches)
  const f = idx.data.films[filmId]
  const rank = (id: string) => (!hard && reachable.has(id) ? 0 : 1)
  const credits = [...(idx.filmCredits[filmId] ?? [])].sort(
    (a, b) => rank(a.id) - rank(b.id) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  )
  const liveCount = hard ? 0 : new Set(credits.filter((c) => reachable.has(c.id)).map((c) => c.id)).size
  const q = query.trim().toLowerCase()
  const visible = q ? credits.filter((c) => idx.data.people[c.id].n.toLowerCase().includes(q)) : credits

  return (
    <details className="panel target-panel" open={open}>
      <summary className="target-head">
        <Poster idx={idx} id={filmId} size="md" />
        <div className="now-copy">
          <p className="kicker target-kicker"><Icon name="target" size={12} /> Target</p>
          <h2>{f.t}</h2>
          <p className="meta">{f.y} <LangTag l={f.l} /> · {credits.length} people</p>
        </div>
        {liveCount > 0 && <span className="live-count" title="People one tap from the target"><Icon name="zap" size={13} /> {liveCount}</span>}
        <Icon name="chevron" size={18} className="chev" />
      </summary>
      <p className="face-note">
        {liveCount > 0 ? 'Ringed faces are one tap from the target.' : 'Work backwards: reach any of these faces.'}
      </p>
      {credits.length > 18 && (
        <label className="search">
          <Icon name="search" size={16} />
          <input placeholder="Find in the target’s cast & crew" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <div className="face-wall">
        {visible.map((c, i) => {
          const live = !hard && reachable.has(c.id)
          const body = (
            <>
              <span className="face-art">
                <Avatar idx={idx} id={c.id} size="md" />
                <span className="card-role" aria-hidden><Icon name={ROLE_ICON[c.role]} size={10} /></span>
                {live && <span className="card-flag is-win" aria-hidden><Icon name="target" size={10} /></span>}
              </span>
              <span className="face-name">{idx.data.people[c.id].n}</span>
            </>
          )
          return live ? (
            <button key={c.id + c.role} className="face is-live" style={stagger(i)} title={`${idx.data.people[c.id].n} · tap to link`}
              onClick={(e) => onPick(c.id, e.currentTarget)}>{body}</button>
          ) : (
            <div key={c.id + c.role} className="face" style={stagger(i)} title={`${idx.data.people[c.id].n} · ${c.role}`}>{body}</div>
          )
        })}
        {!visible.length && <p className="empty">Nothing matches “{query}”.</p>}
      </div>
    </details>
  )
}

/** Start and target as a double bill, over a dimmed wash of both posters. */
function Stage({ idx, puzzle, label, challenge }: { idx: Index; puzzle: PuzzleDef; label: string; challenge: number | null }) {
  const { films } = idx.data
  const bgA = IMG(films[puzzle.s].p, 'w342')
  const bgB = IMG(films[puzzle.e].p, 'w342')
  return (
    <section className="stage" aria-label="Puzzle">
      <div className="stage-wash" aria-hidden>
        {bgA && <img src={bgA} alt="" />}
        {bgB && <img src={bgB} alt="" />}
      </div>
      <div className="stage-top">
        <span className="puzzle-label">{label}</span>
        <span className={`grade is-${difficultyOf(puzzle).toLowerCase()}`}>{difficultyOf(puzzle)}</span>
        {puzzle.theme && <span className="theme-ribbon">{puzzle.theme}</span>}
      </div>
      <FilmEnd idx={idx} id={puzzle.s} kicker="Start" />
      <div className="stage-mid">
        <span className="stage-line" aria-hidden />
        <span className="par-pill">Shortest: {puzzle.par} link{puzzle.par === 1 ? '' : 's'}</span>
        {challenge !== null && <span className="par-pill is-friend">Friend: {challenge} link{challenge === 1 ? '' : 's'}</span>}
      </div>
      <FilmEnd idx={idx} id={puzzle.e} kicker="Target" target />
    </section>
  )
}

function FilmEnd({ idx, id, kicker, target }: { idx: Index; id: string; kicker: string; target?: boolean }) {
  const f = idx.data.films[id]
  return (
    <div className={`film-end ${target ? 'is-target' : ''}`}>
      <Poster idx={idx} id={id} size="lg" />
      <div>
        <p className="kicker">{target && <Icon name="target" size={11} />} {kicker}</p>
        <h3>{f.t}</h3>
        <p className="meta">{f.y} <LangTag l={f.l} /></p>
      </div>
    </div>
  )
}

/** Alternate shortest routes from the generator, as chains (skipping any the player already sees). */
function missedRoutes(idx: Index, puzzle: PuzzleDef, seen: (Node[] | null)[]): Node[][] {
  const sig = (p: Node[]) => p.map((n) => n.id).join('>')
  const skip = new Set(seen.filter(Boolean).map((p) => sig(p!)))
  return (puzzle.alts ?? [])
    .map((ids) => ids.map((id, i): Node => ({ kind: i % 2 === 0 ? 'film' : 'person', id })))
    .filter((p) => isValidChain(idx, p, puzzle.s, puzzle.e) && linkCount(p) === puzzle.par && !skip.has(sig(p)))
    .slice(0, 2)
}

/** Live countdown to the next daily. */
function NextPuzzle() {
  const [left, setLeft] = useState(msToMidnight)
  useEffect(() => {
    const t = setInterval(() => setLeft(msToMidnight()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor(left / 1000)
  const hms = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
  return (
    <div className="next-puzzle">
      <Icon name="clock" size={16} />
      <span>Next puzzle in</span>
      <b>{hms}</b>
    </div>
  )
}

/** Your chain above a friend's, with the frames you both used marked. */
function FriendChain({ idx, friend, mine }: { idx: Index; friend: Node[]; mine: Node[] | null }) {
  const key = (n: Node) => `${n.kind}:${n.id}`
  const mineKeys = new Set((mine ?? []).map(key))
  const common = new Set(friend.slice(1, -1).map(key).filter((k) => mineKeys.has(k)))
  const same = !!mine && mine.length === friend.length && mine.every((n, i) => key(n) === key(friend[i]))
  return (
    <section className="vs">
      <p className="kicker">
        {!mine ? 'Your friend’s chain'
          : same ? 'You and your friend took the same route'
          : common.size ? `You shared ${common.size} step${common.size > 1 ? 's' : ''} with your friend`
          : 'Different routes, same destination'}
      </p>
      {mine && <p className="vs-label">You</p>}
      {mine && <Filmstrip idx={idx} path={mine} shared={common} label="Your chain" />}
      <p className="vs-label">Friend</p>
      <Filmstrip idx={idx} path={friend} shared={common} label="Your friend’s chain" />
    </section>
  )
}

/**
 * A solved India daily links back as a challenge: friends land on "A friend linked these in N links".
 * A random chain links to the same pair of films, with the score and chain when it was solved.
 */
function shareQuery(puzzle: PuzzleDef, result: Omit<Result, 'live'>, dailyNo: number | null, free: boolean, lang: string | null) {
  const score = result.gaveUp ? '' : `-${result.links}${result.path.slice(1, -1).map((n) => `.${n.id}`).join('')}`
  if (free) return `?r=${puzzle.s}.${puzzle.e}${score}`
  return dailyNo && score ? `?c=${lang ? `${lang}.` : ''}${dailyNo}${score}` : ''
}

/** The 0-1000 score with where each point came from, so the number is never a mystery. */
function ScoreCard({ parts }: { parts: ScoreParts }) {
  const rows: [string, number][] = [['Links', parts.links], ['Hints', parts.hints], ['Speed', parts.speed], ...(parts.rare ? [['Rare route', parts.rare] as [string, number]] : [])]
  return (
    <div className="score-card" aria-label={`Score ${parts.total} out of 1000`}>
      <div className="score-total"><b>{parts.total}</b><span>/ 1000</span></div>
      <dl className="score-parts">
        {rows.map(([k, v]) => (
          <div key={k} className={v < 0 ? 'is-neg' : v === 0 ? 'is-zero' : ''}><dt>{k}</dt><dd>{v > 0 && k !== 'Links' ? '+' : ''}{v}</dd></div>
        ))}
      </dl>
    </div>
  )
}

function ResultPanel({
  idx, puzzle, result, optimal, newFaces, label, shareTitle, isToday, routeShare, dailyNo, shareLang, free, friendPath,
  onNewRandom, onOpenArchive, player, onSaveStreak, onOpenFriends,
}: Props & { result: Omit<Result, 'live'>; optimal: Node[] | null; newFaces: number }) {
  const [copied, setCopied] = useState(false)
  const { films, people } = idx.data
  const rating = result.gaveUp ? 'Shelved' : ratingFor(result.links, puzzle.par, result.hints)
  const diff = result.links - puzzle.par
  // A rare route (few other players took it) earns a bonus once the server has counted today's routes.
  const pts = scoreFor({ ...result, par: puzzle.par, rare: !!routeShare && isRareRoute(routeShare.count, routeShare.total) })
  const blockbuster = rating === 'Blockbuster'

  const verdict = result.gaveUp
    ? 'The reel ran out. Here’s how it connects.'
    : blockbuster
      ? 'You found the shortest chain.'
      : diff <= 0
        ? 'Shortest chain! A hint kept it from Blockbuster.'
        : `${diff} link${diff > 1 ? 's' : ''} over the shortest chain.`

  const share = routeShare && routeShare.total > 0 ? routeShare.count / routeShare.total : null
  const cult = !!routeShare && routeShare.total >= 20 && share! < 0.05
  const routeLine = !routeShare || result.gaveUp ? null
    : routeShare.total <= 1 ? 'You’re the first player to finish today.'
    : routeShare.total < 5 ? `${routeShare.count} of ${routeShare.total} players today took your route.`
    : `${Math.max(1, Math.round(share! * 100))}% of players today took your route.`

  const missed = useMemo(
    () => missedRoutes(idx, puzzle, [optimal, result.gaveUp ? null : result.path]),
    [idx, puzzle, optimal, result],
  )
  const spot = puzzle.spot && puzzle.spot.p in people ? puzzle.spot : null

  const blocks = result.gaveUp
    ? '⬛⬛⬛'
    : Array.from({ length: result.links }, (_, i) => (i < puzzle.par ? '🟩' : '🟧')).join('')
  const shareText = [
    shareTitle,
    `${films[puzzle.s].t} → ${films[puzzle.e].t}`,
    result.gaveUp
      ? `${blocks} Shelved (shortest ${puzzle.par})`
      : `${blocks} ${rating}${cult ? ' · Cult Classic route' : ''} · ${result.links} link${result.links > 1 ? 's' : ''} · ⏱ ${clock(result.seconds)}${result.hints ? ` · 💡${result.hints}` : ''} · ${pts.total} pts`,
    window.location.origin + import.meta.env.BASE_URL + shareQuery(puzzle, result, dailyNo, free, shareLang),
  ].join('\n')

  async function doShare() {
    try {
      if (navigator.share && /Mobi/.test(navigator.userAgent)) await navigator.share({ text: shareText })
      else await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* user dismissed share sheet */
    }
  }

  return (
    <section className={`result ${blockbuster ? 'is-gold' : ''}`}>
      <div className="verdict">
        <Stamp rating={rating} />
        <h2>{verdict}</h2>
        {!result.gaveUp && <ParMeter links={result.links} par={puzzle.par} big />}
        {!result.gaveUp && <ScoreCard parts={pts} />}
        <div className="result-chips">
          <span title="Time"><Icon name="timer" size={14} /> {clock(result.seconds)}</span>
          <span title="Hints used"><Icon name="hint" size={14} /> {result.hints}</span>
          {newFaces > 0 && <span className="chip-new" title="New people in your cast"><Icon name="users" size={14} /> +{newFaces} new in your cast</span>}
          {cult && <span className="chip-cult"><Icon name="star" size={14} /> Cult Classic route</span>}
        </div>
        {routeLine && <p className="route-line">{routeLine}</p>}
        <div className="result-actions">
          <button className="btn primary" onClick={doShare}>
            <Icon name={copied ? 'check' : 'share'} size={16} /> {copied ? 'Copied' : 'Share result'}
          </button>
          {player && <button className="btn" onClick={onOpenFriends}><Icon name="trophy" size={16} /> Friends</button>}
          <button className="btn" onClick={() => onNewRandom(3)}><Icon name="dice" size={16} /> Random chain</button>
          <button className="btn ghost" onClick={onOpenArchive}><Icon name="archive" size={16} /> Archive</button>
        </div>
      </div>

      {friendPath && <FriendChain idx={idx} friend={friendPath} mine={result.gaveUp ? null : result.path} />}

      <RouteMap idx={idx} mine={result.gaveUp ? null : result.path} best={optimal} />

      {spot && (
        <aside className="dyk">
          <Avatar idx={idx} id={spot.p} size="lg" />
          <div>
            <p className="kicker">Did you know?</p>
            <p>{spot.t}</p>
          </div>
        </aside>
      )}

      {missed.length > 0 && (
        <details className="missed">
          <summary><Icon name="route" size={16} /> Other shortest routes <em>{missed.length}</em><Icon name="chevron" size={14} className="chev" /></summary>
          {missed.map((p, i) => <Filmstrip key={i} idx={idx} path={p} replay label={`Another shortest route ${i + 1}`} />)}
        </details>
      )}

      {!player && !result.gaveUp && (
        <div className="save-cta">
          <Icon name="flame" size={28} className="save-flame" />
          <div>
            <b>Keep your streak safe</b>
            <span>Pick a name and PIN to sync devices and compete with friends.</span>
          </div>
          <button className="btn primary" onClick={onSaveStreak}>Save streak</button>
        </div>
      )}

      <div className="ticket" aria-label="Your result ticket">
        <div className="ticket-main">
          <p className="ticket-kicker">CinematicLink · {label}</p>
          <p className="ticket-films">{films[puzzle.s].t} <Icon name="arrow" size={14} /> {films[puzzle.e].t}</p>
          <p className="ticket-blocks" aria-hidden>
            {result.gaveUp
              ? Array.from({ length: puzzle.par }, (_, i) => <i key={i} className="is-lost" />)
              : Array.from({ length: result.links }, (_, i) => <i key={i} className={i < puzzle.par ? '' : 'is-over'} />)}
          </p>
          <p className="ticket-meta">
            {result.gaveUp ? `Shortest was ${puzzle.par}` : `${result.links} link${result.links > 1 ? 's' : ''} · shortest ${puzzle.par} · ${pts.total} pts`} · {clock(result.seconds)}
          </p>
        </div>
        <div className="ticket-stub">
          <Stamp rating={rating} small />
        </div>
      </div>
      {isToday && <NextPuzzle />}
      {isToday && <Reminders compact />}
    </section>
  )
}
