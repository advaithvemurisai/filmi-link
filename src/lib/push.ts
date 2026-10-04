/**
 * Daily reminders through Web Push. A subscription belongs to this browser, so it works without an
 * account. The server only learns the browser's time zone and the last day it finished the India daily,
 * which is enough to skip players who already played and to nudge the ones with a streak at stake.
 */

const BASE = import.meta.env.BASE_URL
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type ReminderState = 'unsupported' | 'install' | 'denied' | 'off' | 'on'
export interface PlayState { last: string; streak: number }

/** Kept current by the app, so turning reminders on from anywhere sends the latest state. */
let played: PlayState = { last: '', streak: 0 }

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration(BASE)
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function reminderState(): Promise<ReminderState> {
  if (!VAPID || !('serviceWorker' in navigator)) return 'unsupported'
  // iPhone Safari only exposes push to sites added to the Home Screen.
  if (!('PushManager' in window) || !('Notification' in window)) return isIOS() && !isStandalone() ? 'install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return (await currentSub()) ? 'on' : 'off'
}

async function post(body: Record<string, unknown>) {
  const r = await fetch(`${BASE}api/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`push ${r.status}`)
}

const save = (sub: PushSubscription) =>
  post({ action: 'push', sub: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, ...played })

function keyBytes(b64: string) {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Ask permission and subscribe. Must run straight from a tap: Safari refuses the prompt otherwise. */
export async function enableReminders(): Promise<ReminderState> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off'
  await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE })
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID!) }))
  try {
    await save(sub)
  } catch (e) {
    // A subscription the server never stored would look "on" here but never fire.
    await sub.unsubscribe()
    throw e
  }
  return 'on'
}

export async function disableReminders(): Promise<ReminderState> {
  const sub = await currentSub()
  if (sub) {
    await post({ action: 'unpush', endpoint: sub.endpoint }).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

/** Record the latest play, and tell the server if this browser gets reminders (so it skips today's). */
export function reportPlayed(state: PlayState) {
  played = state
  if (!VAPID || !('serviceWorker' in navigator) || !('PushManager' in window)) return
  currentSub()
    .then((sub) => sub && save(sub))
    .catch(() => { /* offline: the worst case is one unneeded reminder */ })
}

/** 01:00 UTC (when api/remind.ts sends) on this device's clock: "7:00 PM" in Chicago in winter, "8:00 PM" in summer. */
export const remindTime = () => {
  const d = new Date()
  d.setUTCHours(1, 0, 0, 0)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
