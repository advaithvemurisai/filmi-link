import { track } from '@vercel/analytics'

/**
 * Product events (Vercel Web Analytics custom events). Only coarse, non-identifying numbers are sent:
 * no names, no routes. Each call is fire-and-forget; analytics must never break a game.
 */
export function event(name: string, props: Record<string, string | number | boolean | null> = {}) {
  try {
    track(name, props)
  } catch {
    /* analytics unavailable */
  }
}

const LAST_VISIT = 'fl:lastVisit'

/** One `visit` event per day, bucketed by the gap since the last one: the day-1 and day-7 return signal. */
export function recordVisit(today: string) {
  try {
    const last = localStorage.getItem(LAST_VISIT)
    if (last === today) return
    localStorage.setItem(LAST_VISIT, today)
    const gap = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86_400_000) : null
    event('visit', { returning: gap === null ? 'new' : gap <= 1 ? 'next-day' : gap <= 7 ? 'within-week' : 'lapsed' })
  } catch { /* storage unavailable */ }
}
