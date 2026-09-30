import { useMemo } from 'react'
import { Filmstrip, LangTag, Modal, ParMeter, Poster } from './Bits'
import { randomPuzzle, shortestPath, type Index } from '../lib/graph'
import { addDays, dayDiff, puzzleFor, puzzleNumber, type PuzzleFile } from '../lib/daily'
import { computeStats, type Result } from '../lib/storage'

export function HowTo({ idx, onClose }: { idx: Index; onClose: () => void }) {
  // Build a live example from the data so it always matches what's playable.
  const example = useMemo(() => {
    let seed = 42
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const p = randomPuzzle(idx, 2, rng)
    return p && p.par === 2 ? shortestPath(idx, { kind: 'film', id: p.s }, p.e) : null
  }, [idx])

  return (
    <Modal title="How to play" onClose={onClose}>
      <ol className="howto-steps">
        <li><span aria-hidden>🎞️ → 🎯</span><b>Link two films</b><small>A start and a target</small></li>
        <li><span aria-hidden>🎞️ 👤 🎞️</span><b>Hop through people</b><small>Actors, directors, composers</small></li>
        <li><span aria-hidden>⛳</span><b>Beat par</b><small>Each person is one link</small></li>
      </ol>
      {example && (
        <>
          <p className="kicker">Example: a 2-link chain</p>
          <Filmstrip idx={idx} path={example} replay />
        </>
      )}
      <ul className="howto-legend">
        <li><span className="legend-card is-win" aria-hidden>🎯</span> Leads straight to the target</li>
        <li><span className="reach" aria-hidden><i className="on" /><i className="on" /><i className="on" /><i /><i /></span> How many other films they have</li>
        <li><span aria-hidden>🎬 🎵</span> Director / music composer</li>
        <li><span aria-hidden>↶</span> Back and rewinds are free. Tap any frame to rewind</li>
        <li><span aria-hidden>💡</span> Hints show the next step; they appear in your share</li>
        <li><span aria-hidden>🔥</span> <b>Hard mode</b>: no hints, no signal bars</li>
      </ul>
    </Modal>
  )
}

export function Stats({
  results, today, synced, onClose,
}: { results: Record<string, Result>; today: string; synced: boolean; onClose: () => void }) {
  const s = computeStats(results, today)
  const buckets = ['Par', '+1', '+2', '+3+']
  const max = Math.max(1, ...buckets.map((b) => s.overPar[b] ?? 0))
  // Five weeks ending this week, Monday-first, like a contributions calendar.
  const lead = (new Date(today + 'T00:00').getDay() + 6) % 7
  const days = Array.from({ length: 35 }, (_, i) => addDays(today, i - 28 - lead))
  return (
    <Modal title="Your stats" onClose={onClose}>
      <div className="streak-hero">
        <span className={`streak-flame ${s.streak ? '' : 'is-cold'}`} aria-hidden>🔥</span>
        <div>
          <b>{s.streak}</b>
          <span>day streak · best {s.best}</span>
        </div>
      </div>
      <div className="stats-grid">
        <div><b>{s.played}</b><span>Played</span></div>
        <div><b>{s.played ? Math.round((s.solved / s.played) * 100) : 0}%</b><span>Solved</span></div>
        <div><b>{s.atPar}</b><span>At par</span></div>
      </div>
      <div className="heat" aria-label="Last five weeks">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="heat-dow">{d}</span>)}
        {days.map((d) => {
          const r = results[d]
          const future = d > today
          const cls = future ? 'is-future' : !r ? '' : r.gaveUp ? 'is-lost' : r.links <= r.par ? 'is-par' : 'is-won'
          return <i key={d} className={`${cls} ${d === today ? 'is-today' : ''}`} title={d} />
        })}
      </div>
      <p className="heat-key"><i className="is-par" /> par <i className="is-won" /> solved <i className="is-lost" /> gave up</p>
      <div className="dist">
        {buckets.map((b) => (
          <div className="dist-row" key={b}>
            <span className="dist-label">{b}</span>
            <span className="dist-bar" style={{ width: `${((s.overPar[b] ?? 0) / max) * 100}%` }}>
              {s.overPar[b] ?? 0}
            </span>
          </div>
        ))}
      </div>
      <p className="fine">
        Streaks count daily puzzles solved on their own day. {synced ? 'Synced to your player.' : 'Stored in this browser only.'}
      </p>
    </Modal>
  )
}

export function Archive({
  idx, file, today, results, onPick, onClose,
}: {
  idx: Index
  file: PuzzleFile
  today: string
  results: Record<string, Result>
  onPick: (date: string) => void
  onClose: () => void
}) {
  const days = Math.max(0, dayDiff(file.epoch, today))
  const dates = Array.from({ length: days + 1 }, (_, i) => addDays(today, -i))
  return (
    <Modal title="Archive" onClose={onClose}>
      <ul className="archive">
        {dates.map((d) => {
          const p = puzzleFor(file, d)!
          const r = results[d]
          return (
            <li key={d}>
              <button onClick={() => onPick(d)}>
                <span className="archive-pair" aria-hidden>
                  <Poster idx={idx} id={p.s} size="sm" />
                  <Poster idx={idx} id={p.e} size="sm" />
                </span>
                <span className="archive-main">
                  <span>{idx.data.films[p.s].t} → {idx.data.films[p.e].t}</span>
                  <span className="archive-sub">
                    #{puzzleNumber(file, d)} · {new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' '}<LangTag l={idx.data.films[p.s].l} /> <LangTag l={idx.data.films[p.e].l} />
                  </span>
                </span>
                <span className="archive-status">
                  {!r ? <ParMeter links={0} par={p.par} /> : r.gaveUp ? '🏳️' : <ParMeter links={r.links} par={r.par} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
