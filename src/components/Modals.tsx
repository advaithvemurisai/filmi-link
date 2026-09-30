import { useMemo } from 'react'
import { Chain, LangTag, Modal } from './Bits'
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
      <ol className="howto">
        <li>You get a <b>start</b> film and a <b>target</b> film, often from different industries.</li>
        <li>Open the start film and pick an actor, director or music composer who worked on it.</li>
        <li>From that person, jump to another film they worked on. Keep going until you reach the target.</li>
        <li>Each person you pass through is one <b>link</b>. <b>Par</b> is the fewest links possible.</li>
      </ol>
      {example && (
        <>
          <p className="kicker">Example: a 2-link chain</p>
          <Chain idx={idx} path={example} />
        </>
      )}
      <ul className="howto-notes">
        <li>Click any chip in your chain to rewind to that point. Back and rewinds are free.</li>
        <li>💡 Hints reveal the next step on a shortest route. They show up in your share.</li>
        <li><b>Hard mode</b> turns off hints and hides how many other films each person has.</li>
        <li>A new daily puzzle drops at midnight. Weekdays start easy; weekends are harder.</li>
      </ul>
    </Modal>
  )
}

export function Stats({ results, today, onClose }: { results: Record<string, Result>; today: string; onClose: () => void }) {
  const s = computeStats(results, today)
  const buckets = ['Par', '+1', '+2', '+3+']
  const max = Math.max(1, ...buckets.map((b) => s.overPar[b] ?? 0))
  return (
    <Modal title="Your stats" onClose={onClose}>
      <div className="stats-grid">
        <div><b>{s.played}</b><span>Played</span></div>
        <div><b>{s.played ? Math.round((s.solved / s.played) * 100) : 0}%</b><span>Solved</span></div>
        <div><b>{s.streak}</b><span>Streak</span></div>
        <div><b>{s.best}</b><span>Best streak</span></div>
      </div>
      <p className="kicker">Links vs par</p>
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
      <p className="fine">Streaks count daily puzzles solved on their own day. Stats are stored in this browser only.</p>
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
          const status = !r ? '' : r.gaveUp ? '✕' : r.links <= r.par ? '★' : '✓'
          return (
            <li key={d}>
              <button onClick={() => onPick(d)}>
                <span className="archive-no">#{puzzleNumber(file, d)}</span>
                <span className="archive-main">
                  <span>{idx.data.films[p.s].t} → {idx.data.films[p.e].t}</span>
                  <span className="archive-sub">
                    {new Date(d + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    {' · '}par {p.par} · <LangTag l={idx.data.films[p.s].l} /> <LangTag l={idx.data.films[p.e].l} />
                  </span>
                </span>
                <span className={`archive-status ${status === '★' ? 'gold' : ''}`}>{status}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
