import { useMemo, useState } from 'react'
import { Avatar, Icon, Modal, ParMeter, Poster, Stamp } from './Bits'
import Walkthrough from './Walkthrough'
import { Reminders } from './Reminders'
import type { Index } from '../lib/graph'
import { addDays, dayDiff, puzzleFor, puzzleNumber, type PuzzleFile } from '../lib/daily'
import { HOME_LANGS, SCRIPT, langName } from '../lib/format'
import { computeStats, loadCast, rate, RATINGS, tierClass, type Result } from '../lib/storage'

/** How to play: the guided example, then the rules and signals for reference. */
export function HowTo({ idx, onClose }: { idx: Index; onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} wide>
      <Walkthrough idx={idx} doneLabel="Play" onDone={onClose} />
      <details className="rules">
        <summary>Rules and signals <Icon name="chevron" size={14} /></summary>
        <ul className="howto-legend">
          <li><span className="legend-ring" aria-hidden><Icon name="target" size={13} /></span> Ringed cards lead straight to the target</li>
          <li><span className="reach" aria-hidden><i className="on" /><i className="on" /><i className="on" /><i /><i /></span> How many other films they have</li>
          <li><span aria-hidden><Icon name="director" size={16} /> <Icon name="music" size={16} /></span> Director / music composer</li>
          <li><span aria-hidden><Icon name="back" size={16} /></span> Going back is free. Tap any frame to rewind</li>
          <li><span aria-hidden><Icon name="hint" size={16} /></span> Hints show the next step, but cap the day at a Hit</li>
          <li>
            <span className="legend-tiers" aria-hidden><i className="t-blockbuster" /><i className="t-hit" /><i className="t-flop" /><i className="t-disaster" /></span>
            Shortest chain = Blockbuster. Each extra link drops a tier: Hit, Flop, Disaster
          </li>
          <li><span aria-hidden><Icon name="flame" size={16} /></span> <b>Hard mode</b>: no hints, no signal bars</li>
        </ul>
      </details>
    </Modal>
  )
}

/** The 100 most-connected people in the data: the "stars" the cast collection counts toward. */
function topStars(idx: Index): string[] {
  return Object.keys(idx.personFilms)
    .sort((a, b) => idx.personFilms[b].length - idx.personFilms[a].length)
    .slice(0, 100)
}

export function Stats({
  idx, sets, today, synced, onClose,
}: {
  idx: Index
  sets: { label: string; results: Record<string, Result> }[]
  today: string
  synced: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState(0)
  const { results } = sets[Math.min(tab, sets.length - 1)]
  const s = computeStats(results, today)
  const max = Math.max(1, ...RATINGS.map((b) => s.tiers[b] ?? 0))
  // Five weeks ending this week, Monday-first, like a contributions calendar.
  const lead = (new Date(today + 'T00:00').getDay() + 6) % 7
  const days = Array.from({ length: 35 }, (_, i) => addDays(today, i - 28 - lead))

  const cast = useMemo(loadCast, [])
  const stars = useMemo(() => topStars(idx), [idx])
  const collected = Object.keys(cast).filter((id) => id in idx.data.people)
  const starsHave = stars.filter((id) => cast[id]).length
  const favourites = [...collected].sort((a, b) => cast[b].n - cast[a].n).slice(0, 6)

  return (
    <Modal title="Your stats" onClose={onClose}>
      {sets.length > 1 && (
        <div className="segmented" role="tablist">
          {sets.map((t, i) => (
            <button key={t.label} role="tab" aria-selected={i === tab} className={i === tab ? 'on' : ''} onClick={() => setTab(i)}>{t.label}</button>
          ))}
        </div>
      )}
      <div className="streak-hero">
        <Icon name="flame" size={40} className={`streak-flame ${s.streak ? '' : 'is-cold'}`} />
        <div>
          <b>{s.streak}</b>
          <span>day streak · best {s.best}</span>
        </div>
      </div>
      <div className="stats-grid">
        <div><b>{s.played}</b><span>Played</span></div>
        <div><b>{s.played ? Math.round((s.solved / s.played) * 100) : 0}%</b><span>Solved</span></div>
        <div><b>{s.blockbusters}</b><span>Blockbusters</span></div>
      </div>
      <div className="heat" aria-label="Last five weeks">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="heat-dow">{d}</span>)}
        {days.map((d) => (
          <i key={d} className={`${d > today ? 'is-future' : tierClass(results[d])} ${d === today ? 'is-today' : ''}`} title={d} />
        ))}
      </div>
      <div className="dist">
        {RATINGS.map((b) => (
          <div className="dist-row" key={b}>
            <span className="dist-label">{b}</span>
            <span className="dist-track">
              <span className={`dist-bar t-${b.toLowerCase()}`} style={{ width: `${((s.tiers[b] ?? 0) / max) * 100}%` }} />
            </span>
            <b className="dist-n">{s.tiers[b] ?? 0}</b>
          </div>
        ))}
      </div>

      <section className="cast">
        <header>
          <h3>Your cast</h3>
          <span>{collected.length} {collected.length === 1 ? 'person' : 'people'} linked</span>
        </header>
        <div className="cast-meter" role="img" aria-label={`${starsHave} of the top 100 stars linked`}>
          <span style={{ width: `${starsHave}%` }} />
        </div>
        <p className="fine">{starsHave} of the 100 most-connected stars linked. Everyone in a solved chain joins your cast.</p>
        {favourites.length > 0 && (
          <ul className="cast-faces">
            {favourites.map((id) => (
              <li key={id} title={`${idx.data.people[id].n}: in ${cast[id].n} of your chains`}>
                <Avatar idx={idx} id={id} size="md" />
                <span>{idx.data.people[id].n}</span>
                <small>×{cast[id].n}</small>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Reminders />
      <p className="fine">
        Streaks count daily puzzles solved on their own day. {synced ? 'The India daily is synced to your player.' : 'Stored in this browser only.'}
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
                    {p.theme && <> · {p.theme.split(':')[0]}</>}
                  </span>
                </span>
                <span className="archive-status">
                  {r ? <Stamp rating={rate(r) ?? 'Shelved'} small /> : <ParMeter links={0} par={p.par} />}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

/** Pick (or clear) the industry for the optional second daily. */
export function HomePicker({ home, onPick, onClose }: { home?: string; onPick: (l: string | undefined) => void; onClose: () => void }) {
  return (
    <Modal title="Your home cinema" onClose={onClose}>
      <p className="lede-sm">
        Get a second daily built only from the films of the industry you know best. The India daily stays the one
        everyone shares.
      </p>
      <div className="home-grid">
        {HOME_LANGS.map((l) => (
          <button key={l} className={`home-chip ${home === l ? 'on' : ''}`} onClick={() => onPick(l)}>
            <i aria-hidden>{SCRIPT[l]}</i>
            <span>{langName(l)}</span>
            {home === l && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
      {home && <button className="btn ghost" onClick={() => onPick(undefined)}>Turn off the {langName(home)} daily</button>}
    </Modal>
  )
}
