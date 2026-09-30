import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { linkCount, nodeLabel, shortestPath, type Index, type Node, type Role } from '../lib/graph'
import type { PuzzleDef } from '../lib/daily'
import { IMG, clock } from '../lib/format'
import type { Progress, Result } from '../lib/storage'
import { Avatar, Filmstrip, LangTag, ParMeter, Poster, ROLE_ICON, launchFrom } from './Bits'
import RouteMap, { Confetti } from './RouteMap'

const ROLE_ORDER: Record<Role, number> = { Director: 0, Music: 1, Actor: 2 }
const GROUPS: [Role, string][] = [['Director', 'Direction'], ['Music', 'Music'], ['Actor', 'Cast']]

interface Props {
  idx: Index
  puzzle: PuzzleDef
  label: string
  hard: boolean
  initialProgress: Progress | null
  initialResult: Result | null
  onProgress: (p: Progress) => void
  onFinish: (r: Omit<Result, 'live'>) => void
  onNewRandom: (par: number) => void
  onOpenArchive: () => void
  shareTitle: string
  /** Signed-in player's name, or null when playing anonymously. */
  player: string | null
  onSaveStreak: () => void
  onOpenFriends: () => void
}

type Option = { node: Node; role: Role }

export default function Game(props: Props) {
  const { idx, puzzle, hard } = props
  const { films } = idx.data
  const start: Node = { kind: 'film', id: puzzle.s }

  const [path, setPath] = useState<Node[]>(props.initialResult?.path ?? props.initialProgress?.path ?? [start])
  const [startedAt] = useState(() => props.initialProgress?.startedAt ?? Date.now())
  const [hints, setHints] = useState(props.initialResult?.hints ?? props.initialProgress?.hints ?? 0)
  const [hint, setHint] = useState<Node | null>(null)
  const [result, setResult] = useState<Omit<Result, 'live'> | null>(props.initialResult)
  const [now, setNow] = useState(Date.now())
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const current = path[path.length - 1]
  const links = linkCount(path)

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
    if (hint) listRef.current?.querySelector('.is-hint')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [hint])

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
      links: linkCount(finalPath), par: puzzle.par, seconds: Math.round((Date.now() - startedAt) / 1000),
      hints, gaveUp, path: finalPath,
    }
    setResult(r)
    props.onFinish(r)
  }

  function go(node: Node, from?: Element | null) {
    const existing = path.findIndex((n) => n.kind === node.kind && n.id === node.id)
    const next = existing >= 0 ? path.slice(0, existing + 1) : [...path, node]
    launchFrom(existing >= 0 ? null : from?.querySelector('.poster, .avatar') ?? null)
    setPath(next)
    setHint(null)
    setQuery('')
    listRef.current?.scrollTo({ top: 0 })
    if (node.kind === 'film' && node.id === puzzle.e) finish(next, false)
  }

  function takeHint() {
    const sp = shortestPath(idx, current, puzzle.e)
    if (sp && sp[1]) {
      setHint(sp[1])
      setHints((h) => h + 1)
    }
  }

  const seconds = result ? result.seconds : Math.round((now - startedAt) / 1000)
  const isHint = (n: Node) => hint?.kind === n.kind && hint.id === n.id
  const deadEnd = !q && options.every((o) => inPath.has(`${o.node.kind}:${o.node.id}`))

  return (
    <main className="game">
      <Stage idx={idx} puzzle={puzzle} label={props.label} />

      {result ? (
        <ResultPanel {...props} result={result} optimal={optimal} />
      ) : (
        <>
          <div className="toolbar">
            <ParMeter links={links} par={puzzle.par} />
            <span className="timer" aria-label="Time">⏱ {clock(seconds)}</span>
            <div className="tools">
              <button className="tool" onClick={() => setPath(path.slice(0, -1))} disabled={path.length < 2} title="Back one step">
                <span aria-hidden>↶</span><span className="tool-label">Back</span>
              </button>
              {!hard && (
                <button className="tool tool-hint" onClick={takeHint} title="Reveal the next step on a shortest route">
                  <span aria-hidden>💡</span><span className="tool-label">Hint</span>
                  {hints > 0 && <b className="tool-count">{hints}</b>}
                </button>
              )}
              <button className="tool tool-danger" onClick={() => finish(path, true)} title="Give up and see a solution">
                <span aria-hidden>🏳️</span><span className="tool-label">Give up</span>
              </button>
            </div>
          </div>

          <Filmstrip
            idx={idx} path={path} activeIndex={path.length - 1}
            onJump={(i) => setPath(path.slice(0, i + 1))}
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
                      : <>🎞 {options.length} film{options.length === 1 ? '' : 's'}</>}
                  </p>
                </div>
                <span className="now-next" aria-hidden>{current.kind === 'film' ? '👤' : '🎞'}<i>→</i></span>
              </header>

              {options.length > 12 && (
                <input
                  className="search"
                  placeholder={current.kind === 'film' ? '🔎  Find cast & crew' : '🔎  Find a film'}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}

              <div className="options" ref={listRef} key={`o${current.kind}${current.id}`}>
                {current.kind === 'film'
                  ? GROUPS.map(([role, title]) => {
                      const items = visible.filter((o) => o.role === role)
                      if (!items.length) return null
                      return (
                        <div className="group" key={role}>
                          <p className="group-head"><span aria-hidden>{ROLE_ICON[role]}</span> {title} <em>{items.length}</em></p>
                          <div className="grid grid-people">
                            {items.map((o, i) => {
                              const used = inPath.has(`person:${o.node.id}`)
                              const others = (idx.personFilms[o.node.id]?.length ?? 1) - 1
                              return (
                                <PersonCard
                                  key={o.node.id + o.role} idx={idx} id={o.node.id} role={o.role} i={i}
                                  others={others} hard={hard} used={used}
                                  win={!hard && !used && targetCast.has(o.node.id)} hint={isHint(o.node)}
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
                {!visible.length && <p className="empty"><span aria-hidden>🔍</span> Nothing matches “{query}”.</p>}
                {deadEnd && (
                  <p className="empty"><span aria-hidden>🚧</span> Dead end. Step <b>back</b> or tap an earlier frame.</p>
                )}
              </div>
            </section>

            <TargetPanel
              idx={idx}
              filmId={puzzle.e}
              hard={hard}
              reachable={current.kind === 'film' ? new Set(options.map((o) => o.node.id)) : new Set()}
              onPick={(id, el) => go({ kind: 'person', id }, el)}
            />
          </div>
        </>
      )}
    </main>
  )
}

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
      className={`card person-card role-${role.toLowerCase()} ${used ? 'is-used' : ''} ${win ? 'is-win' : ''} ${hint ? 'is-hint' : ''} ${dead ? 'is-dead' : ''}`}
      style={stagger(i)}
      onClick={(e) => onPick(e.currentTarget)}
      title={`${name} · ${detail}${win ? ' · also worked on the target!' : ''}`}
    >
      <span className="card-art">
        <Avatar idx={idx} id={id} size="lg" />
        {role !== 'Actor' && <span className="card-role" aria-hidden>{ROLE_ICON[role]}</span>}
        {win && <span className="card-flag" aria-hidden>🎯</span>}
        {used && <span className="card-flag used" aria-hidden>✓</span>}
      </span>
      <span className="card-name">{name}</span>
      {!hard && <Reach n={others} />}
      <span className="sr-only">{detail}</span>
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
      className={`card film-card lang-${f.l} ${used ? 'is-used' : ''} ${target ? 'is-win' : ''} ${hint ? 'is-hint' : ''}`}
      style={stagger(i)}
      onClick={(e) => onPick(e.currentTarget)}
      title={`${f.t} (${f.y ?? '?'}) · as ${role.toLowerCase()}`}
    >
      <span className="card-art">
        <Poster idx={idx} id={id} size="md" />
        {f.y && <span className="card-year">{f.y}</span>}
        {role !== 'Actor' && <span className="card-role" aria-hidden>{ROLE_ICON[role]}</span>}
        {target && <span className="card-flag" aria-hidden>🎯</span>}
        {used && !target && <span className="card-flag used" aria-hidden>✓</span>}
      </span>
      <span className="card-name">{f.t}</span>
    </button>
  )
}

/**
 * The target film's cast & crew as a wall of faces, so players can plan from both ends.
 * Faces who also worked on the current film are one tap from victory: they glow and are clickable
 * (except in hard mode).
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
          <p className="kicker target-kicker">🎯 Target</p>
          <h2>{f.t}</h2>
          <p className="meta">{f.y} <LangTag l={f.l} /> · 👥 {credits.length}</p>
        </div>
        {liveCount > 0 && <span className="live-count" title="People one tap from the target">⚡ {liveCount}</span>}
        <span className="chev" aria-hidden>▾</span>
      </summary>
      <p className="face-note">
        {liveCount > 0 ? '⚡ Glowing faces are one tap from the target.' : 'Work backwards: reach any of these faces.'}
      </p>
      {credits.length > 18 && (
        <input className="search" placeholder="🔎  Find in target's cast & crew" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="face-wall">
        {visible.map((c, i) => {
          const live = !hard && reachable.has(c.id)
          const body = (
            <>
              <span className="face-art">
                <Avatar idx={idx} id={c.id} size="md" />
                {c.role !== 'Actor' && <span className="card-role" aria-hidden>{ROLE_ICON[c.role]}</span>}
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

/** Start and target posters facing off, over a blurred wash of both. */
function Stage({ idx, puzzle, label }: { idx: Index; puzzle: PuzzleDef; label: string }) {
  const { films } = idx.data
  const bgA = IMG(films[puzzle.s].p, 'w342')
  const bgB = IMG(films[puzzle.e].p, 'w342')
  return (
    <section className="stage" aria-label="Puzzle">
      <div className="stage-wash" aria-hidden>
        {bgA && <img src={bgA} alt="" />}
        {bgB && <img src={bgB} alt="" />}
      </div>
      <FilmEnd idx={idx} id={puzzle.s} kicker="Start" />
      <div className="stage-mid">
        <span className="puzzle-label">{label}</span>
        <span className="stage-line" aria-hidden><i /></span>
        <span className="par-pill">Par {puzzle.par}</span>
      </div>
      <FilmEnd idx={idx} id={puzzle.e} kicker="🎯 Target" target />
    </section>
  )
}

function FilmEnd({ idx, id, kicker, target }: { idx: Index; id: string; kicker: string; target?: boolean }) {
  const f = idx.data.films[id]
  return (
    <div className={`film-end ${target ? 'is-target' : ''}`}>
      <Poster idx={idx} id={id} size="lg" />
      <div>
        <p className="kicker">{kicker}</p>
        <h3>{f.t}</h3>
        <p className="meta">{f.y} <LangTag l={f.l} /></p>
      </div>
    </div>
  )
}

function ResultPanel({
  idx, puzzle, result, optimal, shareTitle, onNewRandom, onOpenArchive, player, onSaveStreak, onOpenFriends,
}: Props & { result: Omit<Result, 'live'>; optimal: Node[] | null }) {
  const [copied, setCopied] = useState(false)
  const { films } = idx.data
  const diff = result.links - puzzle.par
  const atPar = !result.gaveUp && diff <= 0

  const [mark, verdict] = result.gaveUp
    ? ['🎞️', 'The reel ran out.']
    : atPar
      ? ['🏆', 'Perfect cut! You hit par.']
      : diff === 1
        ? ['🎯', 'So close: one over par.']
        : ['✅', `Linked! ${diff} over par.`]

  const blocks = result.gaveUp
    ? '⬛⬛⬛'
    : Array.from({ length: result.links }, (_, i) => (i < puzzle.par ? '🟩' : '🟧')).join('')
  const shareText = [
    shareTitle,
    `${films[puzzle.s].t} → ${films[puzzle.e].t}`,
    result.gaveUp
      ? `${blocks} gave up (par ${puzzle.par})`
      : `${blocks} ${result.links} link${result.links > 1 ? 's' : ''} · par ${puzzle.par} · ⏱ ${clock(result.seconds)}${result.hints ? ` · 💡${result.hints}` : ''}`,
    window.location.origin + import.meta.env.BASE_URL,
  ].join('\n')

  async function share() {
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
    <section className={`result ${atPar ? 'is-gold' : ''}`}>
      {atPar && <Confetti />}
      <div className="verdict">
        <span className="verdict-mark" aria-hidden>{mark}</span>
        <h2>{verdict}</h2>
        {!result.gaveUp && <ParMeter links={result.links} par={puzzle.par} big />}
        <div className="result-chips">
          <span title="Time">⏱ {clock(result.seconds)}</span>
          <span title="Hints used">💡 {result.hints}</span>
          <span title="Par">⛳ {puzzle.par}</span>
        </div>
      </div>

      <RouteMap idx={idx} mine={result.gaveUp ? null : result.path} best={optimal} />

      {!result.gaveUp && <Filmstrip idx={idx} path={result.path} replay />}

      {!player && !result.gaveUp && (
        <div className="save-cta">
          <span className="save-flame" aria-hidden>🔥</span>
          <div>
            <b>Keep your streak safe</b>
            <span>Pick a name + PIN to sync devices and compete with friends.</span>
          </div>
          <button className="btn primary" onClick={onSaveStreak}>Save streak</button>
        </div>
      )}

      <div className="share-card">
        <pre className="share-preview">{shareText}</pre>
        <div className="result-actions">
          <button className="btn primary" onClick={share}>{copied ? 'Copied ✓' : '📤 Share'}</button>
          {player && <button className="btn" onClick={onOpenFriends}>🏆 Friends</button>}
          <button className="btn" onClick={() => onNewRandom(3)}>🎲 Random chain</button>
          <button className="btn ghost" onClick={onOpenArchive}>🗂 Archive</button>
        </div>
      </div>
    </section>
  )
}
