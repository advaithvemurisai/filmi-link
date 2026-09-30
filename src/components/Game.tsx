import { useEffect, useMemo, useRef, useState } from 'react'
import { linkCount, nodeLabel, shortestPath, type Index, type Node, type Role } from '../lib/graph'
import type { PuzzleDef } from '../lib/daily'
import { clock } from '../lib/format'
import type { Progress, Result } from '../lib/storage'
import { Avatar, Chain, LangTag, Poster } from './Bits'

const ROLE_ORDER: Record<Role, number> = { Director: 0, Music: 1, Actor: 2 }

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
}

export default function Game(props: Props) {
  const { idx, puzzle, hard } = props
  const { films, people } = idx.data
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

  const optimal = useMemo(
    () => (result ? shortestPath(idx, start, puzzle.e) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, idx, puzzle.s, puzzle.e],
  )

  const inPath = useMemo(() => new Set(path.map((n) => `${n.kind}:${n.id}`)), [path])

  const options = useMemo(() => {
    if (current.kind === 'film') {
      return [...(idx.filmCredits[current.id] ?? [])]
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
        .map((c) => ({ node: { kind: 'person' as const, id: c.id }, role: c.role }))
    }
    return [...(idx.personFilms[current.id] ?? [])]
      .sort((a, b) => (films[b.id].y ?? 0) - (films[a.id].y ?? 0))
      .map((c) => ({ node: { kind: 'film' as const, id: c.id }, role: c.role }))
  }, [current, idx, films])

  const q = query.trim().toLowerCase()
  const visible = q ? options.filter((o) => nodeLabel(idx, o.node).toLowerCase().includes(q)) : options

  function finish(finalPath: Node[], gaveUp: boolean) {
    const r = {
      links: linkCount(finalPath), par: puzzle.par, seconds: Math.round((Date.now() - startedAt) / 1000),
      hints, gaveUp, path: finalPath,
    }
    setResult(r)
    props.onFinish(r)
  }

  function go(node: Node) {
    const existing = path.findIndex((n) => n.kind === node.kind && n.id === node.id)
    const next = existing >= 0 ? path.slice(0, existing + 1) : [...path, node]
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

  return (
    <main className="game">
      <section className="matchup" aria-label="Puzzle">
        <FilmEnd idx={idx} id={puzzle.s} kicker="Start" />
        <div className="matchup-mid">
          <span className="puzzle-label">{props.label}</span>
          <span className="arrow" aria-hidden>⟶</span>
          <span className="par">Par {puzzle.par}</span>
        </div>
        <FilmEnd idx={idx} id={puzzle.e} kicker="Target" target />
      </section>

      {result ? (
        <ResultPanel
          {...props}
          result={result}
          optimal={optimal}
        />
      ) : (
        <>
          <section className="hud">
            <Stat label="Links" value={links} tone={links > puzzle.par ? 'over' : undefined} />
            <Stat label="Time" value={clock(seconds)} />
            <div className="hud-actions">
              <button className="btn ghost" onClick={() => setPath(path.slice(0, -1))} disabled={path.length < 2}>
                ← Back
              </button>
              {!hard && (
                <button className="btn ghost" onClick={takeHint}>💡 Hint{hints ? ` · ${hints}` : ''}</button>
              )}
              <button className="btn ghost danger" onClick={() => finish(path, true)}>Give up</button>
            </div>
          </section>

          <Chain idx={idx} path={path} onJump={(i) => setPath(path.slice(0, i + 1))} activeIndex={path.length - 1} />

          <div className="board">
          <section className="panel">
            <header className="panel-head">
              {current.kind === 'film' ? (
                <>
                  <Poster idx={idx} id={current.id} />
                  <div>
                    <p className="kicker">Now at film</p>
                    <h2>{films[current.id].t}</h2>
                    <p className="meta">
                      {films[current.id].y} <LangTag l={films[current.id].l} />
                    </p>
                    <p className="prompt">Pick someone who worked on it →</p>
                  </div>
                </>
              ) : (
                <>
                  <Avatar idx={idx} id={current.id} />
                  <div>
                    <p className="kicker">Now at person</p>
                    <h2>{people[current.id].n}</h2>
                    <p className="prompt">Pick another of their films →</p>
                  </div>
                </>
              )}
            </header>

            {options.length > 8 && (
              <input
                className="search"
                placeholder={current.kind === 'film' ? 'Filter cast & crew…' : 'Filter films…'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}

            <div className="options" ref={listRef}>
              {visible.map(({ node, role }) => {
                const used = inPath.has(`${node.kind}:${node.id}`)
                const isTarget = node.kind === 'film' && node.id === puzzle.e
                const isHint = hint?.kind === node.kind && hint.id === node.id
                const others = node.kind === 'person' ? (idx.personFilms[node.id]?.length ?? 1) - 1 : 0
                return (
                  <button
                    key={`${node.kind}${node.id}${role}`}
                    className={`option ${isTarget ? 'is-target' : ''} ${isHint ? 'is-hint' : ''} ${used ? 'is-used' : ''}`}
                    onClick={() => go(node)}
                  >
                    {node.kind === 'film' ? <Poster idx={idx} id={node.id} size="sm" /> : <Avatar idx={idx} id={node.id} />}
                    <span className="option-main">
                      <span className="option-title">{nodeLabel(idx, node)}</span>
                      <span className="option-sub">
                        {node.kind === 'film' ? (
                          <>
                            {films[node.id].y} · <LangTag l={films[node.id].l} /> · as {role.toLowerCase()}
                          </>
                        ) : (
                          role
                        )}
                      </span>
                    </span>
                    <span className="option-side">
                      {isTarget && <span className="badge target">Target</span>}
                      {used && !isTarget && <span className="badge">In chain</span>}
                      {node.kind === 'person' && !hard && !used && (
                        <span className={`count ${others === 0 ? 'dead' : ''}`}>
                          {others === 0 ? 'no other films' : `${others} other film${others > 1 ? 's' : ''}`}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
              {!visible.length && <p className="empty">Nothing matches “{query}”.</p>}
              {!q && options.every((o) => inPath.has(`${o.node.kind}:${o.node.id}`)) && (
                <p className="empty">Dead end — nowhere new to go from here. Hit <b>Back</b> or tap an earlier chip.</p>
              )}
            </div>
          </section>

          <TargetPanel
            idx={idx}
            filmId={puzzle.e}
            hard={hard}
            reachable={current.kind === 'film' ? new Set(options.map((o) => o.node.id)) : new Set()}
            currentTitle={current.kind === 'film' ? films[current.id].t : ''}
            onPick={(id) => go({ kind: 'person', id })}
          />
          </div>
        </>
      )}
    </main>
  )
}

/**
 * The target film's cast & crew, so players can plan the chain from both ends.
 * People who also worked on the current film are one click from victory: they're highlighted
 * and clickable (except in hard mode, where they're just listed).
 */
function TargetPanel({
  idx, filmId, hard, reachable, currentTitle, onPick,
}: {
  idx: Index
  filmId: string
  hard: boolean
  reachable: Set<string>
  currentTitle: string
  onPick: (personId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 960px)').matches)
  const f = idx.data.films[filmId]
  // People one click from victory float to the top; the rest keep director → music → cast order.
  const rank = (id: string) => (!hard && reachable.has(id) ? 0 : 1)
  const credits = [...(idx.filmCredits[filmId] ?? [])].sort(
    (a, b) => rank(a.id) - rank(b.id) || ROLE_ORDER[a.role] - ROLE_ORDER[b.role],
  )
  const q = query.trim().toLowerCase()
  const visible = q ? credits.filter((c) => idx.data.people[c.id].n.toLowerCase().includes(q)) : credits

  return (
    <details className="panel target-panel" open={open}>
      <summary className="panel-head">
        <Poster idx={idx} id={filmId} />
        <div>
          <p className="kicker target-kicker">Target · cast &amp; crew</p>
          <h2>{f.t}</h2>
          <p className="meta">
            {f.y} <LangTag l={f.l} /> · {credits.length} people
          </p>
          <p className="prompt muted">Work backwards: find one of these people →</p>
        </div>
        <span className="chev" aria-hidden>▾</span>
      </summary>
      {credits.length > 8 && (
        <input className="search" placeholder="Filter target's cast & crew…" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      <div className="options">
        {visible.map((c) => {
          const live = !hard && reachable.has(c.id)
          const others = (idx.personFilms[c.id]?.length ?? 1) - 1
          const body = (
            <>
              <Avatar idx={idx} id={c.id} />
              <span className="option-main">
                <span className="option-title">{idx.data.people[c.id].n}</span>
                <span className="option-sub">{c.role}</span>
              </span>
              <span className="option-side">
                {live ? (
                  <span className="badge target">Also in {currentTitle}</span>
                ) : (
                  !hard && <span className={`count ${others === 0 ? 'dead' : ''}`}>
                    {others === 0 ? 'no other films' : `${others} other film${others > 1 ? 's' : ''}`}
                  </span>
                )}
              </span>
            </>
          )
          return live ? (
            <button key={c.id + c.role} className="option is-target" onClick={() => onPick(c.id)}>{body}</button>
          ) : (
            <div key={c.id + c.role} className="option static">{body}</div>
          )
        })}
        {!visible.length && <p className="empty">Nothing matches “{query}”.</p>}
      </div>
    </details>
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
        <p className="meta">
          {f.y} <LangTag l={f.l} />
        </p>
      </div>
    </div>
  )
}

const samePath = (a: Node[], b: Node[]) =>
  a.length === b.length && a.every((n, i) => n.kind === b[i].kind && n.id === b[i].id)

const Stat = ({ label, value, tone }: { label: string; value: string | number; tone?: 'over' }) => (
  <div className={`stat ${tone ?? ''}`}>
    <span className="stat-value">{value}</span>
    <span className="stat-label">{label}</span>
  </div>
)

function ResultPanel({
  idx, puzzle, result, optimal, shareTitle, onNewRandom, onOpenArchive,
}: Props & { result: Omit<Result, 'live'>; optimal: Node[] | null }) {
  const [copied, setCopied] = useState(false)
  const { films } = idx.data
  const diff = result.links - puzzle.par

  const verdict = result.gaveUp
    ? 'The reel ran out.'
    : diff <= 0
      ? 'Perfect cut — you hit par!'
      : diff === 1
        ? 'So close — one over par.'
        : `Linked! ${diff} over par.`

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
    <section className="result">
      <h2 className={result.gaveUp ? '' : diff <= 0 ? 'gold' : ''}>{verdict}</h2>
      {!result.gaveUp && (
        <div className="result-stats">
          <Stat label="Links" value={result.links} />
          <Stat label="Par" value={puzzle.par} />
          <Stat label="Time" value={clock(result.seconds)} />
          <Stat label="Hints" value={result.hints} />
        </div>
      )}

      {!result.gaveUp && (
        <>
          <p className="kicker">Your chain</p>
          <Chain idx={idx} path={result.path} />
        </>
      )}
      {optimal && !samePath(optimal, result.path) && (
        <>
          <p className="kicker">{result.gaveUp ? 'One shortest chain' : diff <= 0 ? 'Another optimal chain' : 'Shortest possible chain'}</p>
          <Chain idx={idx} path={optimal} />
        </>
      )}

      <pre className="share-preview">{shareText}</pre>
      <div className="result-actions">
        <button className="btn primary" onClick={share}>{copied ? 'Copied ✓' : 'Share result'}</button>
        <button className="btn" onClick={() => onNewRandom(3)}>Play a random chain</button>
        <button className="btn ghost" onClick={onOpenArchive}>Archive</button>
      </div>
    </section>
  )
}
