import type { ReactNode } from 'react'
import { Icon, Stamp } from './Bits'
import { HOME_LANGS, SCRIPT, langName } from '../lib/format'
import { RATINGS } from '../lib/storage'

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
// Shortest-chain target by weekday, as the generator sets it (Mon..Sun).
const PAR = [2, 2, 3, 3, 3, 4, 4]
// A sample week for the streak strip: tiers are what the real calendar uses.
const WEEK = ['blockbuster', 'hit', 'blockbuster', 'flop', 'blockbuster', 'hit', 'blockbuster']

interface Row { tag: string; title: string; body: string; sample: ReactNode }

const ROWS: Row[] = [
  {
    tag: 'Daily',
    title: 'A new double bill every midnight',
    body: 'The same two films for everyone. Easy at the start of the week, harder by the weekend.',
    sample: (
      <div className="sample-week" role="img" aria-label="Shortest chain by weekday: 2, 2, 3, 3, 3, 4, 4 links">
        {PAR.map((p, i) => (
          <span key={i}><i style={{ height: `${p * 11}px` }} /><b>{DAYS[i]}</b></span>
        ))}
      </div>
    ),
  },
  {
    tag: 'Ratings',
    title: 'Fewest links wins a Blockbuster',
    body: 'Every extra link drops a tier. Asking for a hint is fine, but it caps the day at a Hit.',
    sample: <div className="sample-stamps">{RATINGS.map((r) => <Stamp key={r} rating={r} small />)}</div>,
  },
  {
    tag: 'Reveal',
    title: 'Every puzzle ends with a surprise',
    body: 'A credit you didn’t expect on the shortest route, plus the other routes you missed.',
    sample: (
      <p className="sample-quote">
        <Icon name="zap" size={14} /> Ajay Devgn, best known as an actor, directed <i>Bholaa</i>.
      </p>
    ),
  },
  {
    tag: 'Home cinema',
    title: 'A second daily from your own industry',
    body: 'Hindi, Tamil, Telugu, Malayalam or Kannada: built only from films you’re likely to know.',
    sample: (
      <div className="sample-langs">
        {HOME_LANGS.map((l) => <span key={l} title={langName(l)}>{SCRIPT[l]}</span>)}
      </div>
    ),
  },
  {
    tag: 'Friends',
    title: 'Streaks, and a board for your friends',
    body: 'Pick a name and a 4-digit PIN. Streaks follow you across devices; friends see scores, never routes.',
    sample: (
      <div className="sample-streak">
        <span><Icon name="flame" size={16} /> 5</span>
        <div className="sample-heat" aria-hidden>{WEEK.map((t, i) => <i key={i} className={`t-${t}`} />)}</div>
      </div>
    ),
  },
]

/** Features as a cinema programme: one row per feature, each with a small piece of the real interface. */
export default function Programme() {
  return (
    <ol className="programme">
      {ROWS.map((r, i) => (
        <li key={r.tag}>
          <span className="prog-tag"><b>{String(i + 1).padStart(2, '0')}</b> {r.tag}</span>
          <div className="prog-copy">
            <h3>{r.title}</h3>
            <p>{r.body}</p>
          </div>
          <div className="prog-sample">{r.sample}</div>
        </li>
      ))}
    </ol>
  )
}
