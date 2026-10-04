import { useEffect, useState } from 'react'
import { Icon } from './Bits'
import { disableReminders, enableReminders, reminderState, remindTime, type ReminderState } from '../lib/push'

/**
 * Turn the daily reminder on or off. `compact` is the one-line version under a finished puzzle: it only
 * offers to turn reminders on, and stays out of the way once they are.
 */
export function Reminders({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<ReminderState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    reminderState().then(setState).catch(() => setState('unsupported'))
  }, [])

  if (!state || state === 'unsupported') return null
  if (compact && (state === 'on' || state === 'denied')) return null

  const toggle = async () => {
    setBusy(true)
    setError(false)
    try {
      setState(await (state === 'on' ? disableReminders() : enableReminders()))
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const install = 'On iPhone, tap Share, then Add to Home Screen, and open CinematicLink from there to get reminders.'
  if (compact) {
    return state === 'install' ? (
      <p className="remind-row fine">{install}</p>
    ) : (
      <div className="remind-row">
        <button className="btn sm" onClick={toggle} disabled={busy}>
          <Icon name="bell" size={15} /> {busy ? 'Turning on…' : 'Remind me tomorrow'}
        </button>
        {error && <span className="fine">Couldn’t turn reminders on. Try again?</span>}
      </div>
    )
  }

  const copy: Record<Exclude<ReminderState, 'unsupported'>, string> = {
    off: `One notification around ${remindTime()} on days you haven’t played. No account needed.`,
    on: `You’ll get a nudge around ${remindTime()} on days you haven’t played yet.`,
    denied: 'Notifications are blocked for this site. Allow them in your browser’s site settings to get reminders.',
    install,
  }
  return (
    <div className="save-cta remind-card">
      <Icon name="bell" size={26} className="remind-bell" />
      <div>
        <b>{state === 'on' ? 'Daily reminder is on' : 'Daily reminder'}</b>
        <span>{error ? 'That didn’t work. Check your connection and try again.' : copy[state]}</span>
      </div>
      {(state === 'on' || state === 'off') && (
        <button className={`btn ${state === 'on' ? 'ghost' : 'primary'}`} onClick={toggle} disabled={busy}>
          {busy ? '…' : state === 'on' ? 'Turn off' : 'Remind me'}
        </button>
      )}
    </div>
  )
}
