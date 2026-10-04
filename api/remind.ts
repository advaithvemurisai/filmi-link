/**
 * The daily reminder, sent once a day at 01:00 UTC by Vercel Cron (see vercel.json): 7 pm CST, or 8 pm
 * while Central is on daylight time. Cron is UTC-only and one job keeps it simple.
 *
 * Every browser that opted in gets one push, unless it has already finished today's India daily (judged in
 * its own time zone). A player whose streak is still alive gets the streak nudge instead of the plain one.
 * Subscriptions the push service reports as gone (404/410) are deleted, so the set cleans itself up.
 */
import webpush from 'web-push'
import { PUSH_SUBS, pushKey, upstash, type PushSub, type Store } from './sync.js'

const SENT_TTL = 2 * 86400

export interface Message { title: string; body: string; url: string }

/** Calendar date (YYYY-MM-DD) in a time zone. */
export const dateIn = (tz: string, at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)

const dayBefore = (key: string) => new Date(Date.parse(key) - 86_400_000).toISOString().slice(0, 10)

/** What to send this subscriber, or null if they've already played on their today. */
export function reminderFor(rec: PushSub, at: Date): Message | null {
  const today = dateIn(rec.tz, at)
  if (rec.last === today) return null
  if (rec.streak > 0 && rec.last === dayBefore(today)) {
    return {
      title: `Keep your ${rec.streak}-day streak alive`,
      body: 'Today’s chain closes at midnight. One puzzle, a few minutes.',
      url: '/play',
    }
  }
  return {
    title: 'Today’s puzzle is live',
    body: 'Two films, one chain of cast and crew. Can you link them?',
    url: '/play',
  }
}

/** Push status code for one send; 0 if it never reached the push service. */
export type Send = (rec: PushSub, msg: Message) => Promise<number>

/**
 * Send today's round. Cron can deliver a run twice, so only the first round of a UTC day goes out;
 * `test` (a manual run) skips that guard so a reminder can be tried any time.
 */
export async function sendReminders(store: Store, send: Send, at: Date, test = false) {
  if (!test && (await store.bump(`cl:remind:${at.toISOString().slice(0, 10)}`, SENT_TTL)) > 1) return null
  const ids = await store.smembers(PUSH_SUBS)
  const rows = await store.mget(ids.map(pushKey))
  const tally = { sent: 0, played: 0, gone: 0, failed: 0 }
  await Promise.all(ids.map(async (id, i) => {
    const raw = rows[i]
    if (!raw) {
      await store.srem(PUSH_SUBS, id)
      tally.gone++
      return
    }
    const rec = JSON.parse(raw) as PushSub
    const msg = reminderFor(rec, at)
    if (!msg) {
      tally.played++
      return
    }
    const status = await send(rec, msg)
    if (status === 404 || status === 410) {
      await store.del(pushKey(id))
      await store.srem(PUSH_SUBS, id)
      tally.gone++
    } else if (status >= 200 && status < 300) tally.sent++
    else tally.failed++
  }))
  return tally
}

interface Req { headers: Record<string, string | string[] | undefined> }
interface Res { status(code: number): { json(body: unknown): void } }

export default async function handler(req: Req, res: Res) {
  // Vercel Cron sends CRON_SECRET as a bearer token; nobody else can trigger a round of pushes.
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized.' })

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  const pub = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!url || !token || !pub || !priv) return res.status(503).json({ error: 'Reminders aren’t set up on this server yet.' })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'https://cinematic-link.vercel.app', pub, priv)
  const send: Send = async (rec, msg) => {
    try {
      // A reminder that can't be delivered within a few hours is stale; `topic` collapses any still queued.
      const r = await webpush.sendNotification(rec.sub, JSON.stringify(msg), { TTL: 4 * 3600, topic: 'daily' })
      return r.statusCode
    } catch (e) {
      return (e as { statusCode?: number }).statusCode ?? 0
    }
  }

  // Scheduled runs carry their cron expression. A manual "Run" from the dashboard may not: treat that as
  // a test and send even if today's round already went out.
  const test = typeof req.headers['x-vercel-cron-schedule'] !== 'string'
  const tally = await sendReminders(upstash(url, token), send, new Date(), test)
  res.status(200).json(tally ?? { skipped: 'today’s reminders already went out' })
}
