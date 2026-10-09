import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Icon, Modal, PlayerBadge, Stamp } from './Bits'
import { fetchFriends, login, SyncError, type Account, type Friend } from '../lib/account'
import { addDays } from '../lib/daily'
import { clock } from '../lib/format'
import { computeStats, rate, scoreFor, tierClass, type Result } from '../lib/storage'

/** Name + 4-digit PIN. A new name creates a player; an existing name needs its PIN. */
export function AccountSheet({
  account, results, streak, onSignedIn, onSignOut, onClose,
}: {
  account: Account | null
  results: Record<string, Result>
  streak: number
  onSignedIn: (a: Account, merged: Record<string, Result>, created: boolean) => void
  onSignOut: () => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pinRef = useRef<HTMLInputElement>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await login(name.trim(), pin, results)
      onSignedIn({ name: r.name, token: r.token }, r.results, r.created)
    } catch (err) {
      setError(err instanceof SyncError ? err.message : 'Something went wrong.')
      setPin('')
      pinRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  if (account) {
    return (
      <Modal title="Your player" onClose={onClose}>
        <div className="me-card">
          <PlayerBadge name={account.name} />
          <div>
            <b>{account.name}</b>
            <span><Icon name="flame" size={13} /> {streak} day streak · synced</span>
          </div>
        </div>
        <p className="fine">Sign in with the same name and PIN on another device to carry your streak with you.</p>
        <button className="btn ghost danger" onClick={onSignOut}>Sign out on this device</button>
      </Modal>
    )
  }

  return (
    <Modal title="Save your streak" onClose={onClose}>
      <div className="signin-hero" aria-hidden>
        <Icon name="phone" size={28} /><i /><Icon name="flame" size={34} className="flame" /><i /><Icon name="laptop" size={30} />
      </div>
      <form className="signin" onSubmit={submit}>
        <label>
          <span>Name</span>
          <input
            autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={20}
            placeholder="e.g. Advaith" autoComplete="nickname" required
          />
        </label>
        <label>
          <span>4-digit PIN</span>
          <input
            ref={pinRef} className="pin" value={pin} inputMode="numeric" autoComplete="off" required
            pattern="\d{4}" maxLength={4} placeholder="••••"
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary lg" disabled={busy || name.trim().length < 2 || pin.length !== 4}>
          {busy ? 'Saving…' : 'Play as ' + (name.trim() || '…')}
        </button>
      </form>
      <p className="fine">
        New name? We’ll create it. Used it before? Enter your PIN. Your results on this device come with you.
      </p>
    </Modal>
  )
}

/** Friends ranked by today's score, with streaks alongside. Chains stay hidden so nothing is spoiled. */
export function FriendsSheet({
  account, today, onClose, onSignIn,
}: {
  account: Account | null
  today: string
  onClose: () => void
  onSignIn: () => void
}) {
  const [players, setPlayers] = useState<Friend[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!account) return
    fetchFriends(account)
      .then((r) => setPlayers(r.players))
      .catch((e) => setError(e instanceof SyncError ? e.message : 'Could not load friends.'))
  }, [account])

  if (!account) {
    return (
      <Modal title="Friends" onClose={onClose}>
        <div className="empty-state">
          <Icon name="trophy" size={40} />
          <p>Pick a name to see everyone’s streaks and today’s scores.</p>
          <button className="btn primary" onClick={onSignIn}>Pick a name</button>
        </div>
      </Modal>
    )
  }

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  // Today's score decides the order (played today first); streak, then speed, break ties.
  const rows = (players ?? [])
    .map((p) => {
      const todays = p.results[today]
      return { ...p, stats: computeStats(p.results, today), todays, pts: todays && !todays.gaveUp ? scoreFor(todays).total : null }
    })
    .sort((a, b) =>
      Number(b.todays !== undefined) - Number(a.todays !== undefined) ||
      (b.pts ?? -1) - (a.pts ?? -1) ||
      b.stats.streak - a.stats.streak ||
      (a.todays?.seconds ?? 1e9) - (b.todays?.seconds ?? 1e9))
  const medals = ['🥇', '🥈', '🥉']

  return (
    <Modal title="Friends" onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      {!players && !error && <div className="board-skeleton">{[0, 1, 2].map((i) => <div key={i} />)}</div>}
      {players && (
        <ol className="friends">
          {rows.map((p, rank) => {
            const t = p.todays
            const me = p.name.toLowerCase() === account.name.toLowerCase()
            return (
              <li key={p.name} className={me ? 'is-me' : ''} style={{ animationDelay: `${rank * 60}ms` }}>
                <span className={`friend-rank ${rank < 3 && p.pts !== null ? 'is-top' : ''}`}>
                  {rank < 3 && p.pts !== null ? <span aria-label={`Rank ${rank + 1}`}>{medals[rank]}</span> : rank + 1}
                </span>
                <PlayerBadge name={p.name} />
                <span className="friend-main">
                  <b>{p.name}{me && <em> · you</em>}</b>
                  <span className="friend-week" aria-label="Last 7 days">
                    {week.map((d) => <i key={d} className={tierClass(p.results[d])} title={d} />)}
                  </span>
                </span>
                <span className="friend-today" title="Today">
                  {!t ? <span className="muted">not yet</span>
                    : <>
                      <span className="friend-pts"><b>{p.pts ?? 0}</b> pts</span>
                      <Stamp rating={rate(t) ?? 'Shelved'} small />
                      <small>{t.links} link{t.links === 1 ? '' : 's'} · {clock(t.seconds)}{t.hints ? ` · 💡${t.hints}` : ''}</small>
                    </>}
                </span>
                <span className={`friend-streak ${p.stats.streak ? '' : 'is-cold'}`} title="Current streak"><Icon name="flame" size={15} />{p.stats.streak}</span>
              </li>
            )
          })}
        </ol>
      )}
      <p className="fine">Share the site with friends. Anyone who picks a name shows up here. Routes stay hidden.</p>
    </Modal>
  )
}
