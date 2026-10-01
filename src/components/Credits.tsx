import type { ReactNode } from 'react'
import { Stamp } from './Bits'
import { HOME_LANGS, SCRIPT, langName } from '../lib/format'
import { RATINGS } from '../lib/storage'

/** What's in the game, set like a film's end credits: role on the left, the feature on the right. */
const CREDITS: { role: string; name: string; note: string; extra?: ReactNode }[] = [
  {
    role: 'Starring',
    name: 'A new double bill every midnight',
    note: 'The same two films for everyone. Gentle on Monday, tougher by the weekend.',
  },
  {
    role: 'Box office',
    name: 'Blockbuster, Hit, Flop or Disaster',
    note: 'Fewest links is a Blockbuster. A hint is allowed, but it caps the day at a Hit.',
    extra: <span className="credit-stamps">{RATINGS.map((r) => <Stamp key={r} rating={r} small />)}</span>,
  },
  {
    role: 'Special appearance',
    name: 'A “did you know?” after every puzzle',
    note: 'Like the actor who directed, or the composer who once acted, found on the shortest route.',
  },
  {
    role: 'Introducing',
    name: 'Your home cinema',
    note: 'A second daily made only from Hindi, Tamil, Telugu, Malayalam or Kannada films.',
    extra: <span className="credit-scripts">{HOME_LANGS.map((l) => <i key={l} title={langName(l)}>{SCRIPT[l]}</i>)}</span>,
  },
  {
    role: 'With',
    name: 'Streaks and a friends board',
    note: 'A name and a 4-digit PIN. Friends see your score, never your route.',
  },
]

export default function Credits() {
  return (
    <dl className="credits">
      {CREDITS.map((c) => (
        <div key={c.role} className="credit">
          <dt>{c.role}</dt>
          <dd>
            <b>{c.name}</b>
            <span>{c.note}</span>
            {c.extra}
          </dd>
        </div>
      ))}
    </dl>
  )
}
