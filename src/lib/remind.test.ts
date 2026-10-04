import { describe, expect, it } from 'vitest'
import { handle, memoryStore, PUSH_SUBS, type PushSub } from '../../api/sync'
import { reminderFor, sendReminders, type Message } from '../../api/remind'

const sub = (n = 1) => ({ endpoint: `https://push.example.com/send/abc${n}`, keys: { p256dh: 'BKx-y_z123', auth: 'q1w2e3' } })
const rec = (extra: Partial<PushSub> = {}): PushSub => ({ sub: sub(), tz: 'America/Chicago', last: '', streak: 0, ...extra })
// 01:00 UTC on 4 Oct, the daily send: 8 pm on the 3rd in Chicago (CDT) and 6 pm in California, but already the 4th in India.
const NOW = new Date('2026-10-04T01:00:00Z')

describe('push subscriptions', () => {
  it('stores a subscription without an account, then removes it', async () => {
    const store = memoryStore()
    const on = await handle(store, 'POST', { action: 'push', sub: sub(), tz: 'America/Chicago', last: '2026-10-02', streak: 4 })
    expect(on.status).toBe(200)
    expect(await store.smembers(PUSH_SUBS)).toHaveLength(1)

    // Re-sending the same endpoint updates the one record rather than adding another.
    await handle(store, 'POST', { action: 'push', sub: sub(), tz: 'America/Chicago', last: '2026-10-03', streak: 5 })
    const ids = await store.smembers(PUSH_SUBS)
    expect(ids).toHaveLength(1)
    const [raw] = await store.mget([`cl:push:${ids[0]}`])
    expect(JSON.parse(raw!)).toMatchObject({ last: '2026-10-03', streak: 5 })

    await handle(store, 'POST', { action: 'unpush', endpoint: sub().endpoint })
    expect(await store.smembers(PUSH_SUBS)).toHaveLength(0)
  })

  it('rejects malformed subscriptions and falls back to Central time for an unknown zone', async () => {
    const store = memoryStore()
    expect((await handle(store, 'POST', { action: 'push', sub: { endpoint: 'http://insecure', keys: sub().keys } })).status).toBe(400)
    expect((await handle(store, 'POST', { action: 'push', sub: { endpoint: sub().endpoint, keys: {} } })).status).toBe(400)
    await handle(store, 'POST', { action: 'push', sub: sub(), tz: 'Mars/Olympus', last: 'yesterday' })
    const [raw] = await store.mget((await store.smembers(PUSH_SUBS)).map((id) => `cl:push:${id}`))
    expect(JSON.parse(raw!)).toMatchObject({ tz: 'America/Chicago', last: '', streak: 0 })
  })
})

describe('daily reminder', () => {
  it('sends one round a day even when cron delivers the run twice', async () => {
    const store = memoryStore()
    await handle(store, 'POST', { action: 'push', sub: sub(), tz: 'America/Chicago' })
    let n = 0
    const send = async () => (n++, 201)
    await sendReminders(store, send, NOW)
    expect(await sendReminders(store, send, NOW)).toBeNull()
    expect(n).toBe(1)
    await sendReminders(store, send, NOW, true) // a manual test run still goes through
    expect(n).toBe(2)
  })

  it('skips players who already played today, in their own time zone', () => {
    expect(reminderFor(rec({ last: '2026-10-03' }), NOW)).toBeNull()
    expect(reminderFor(rec({ tz: 'America/Los_Angeles', last: '2026-10-03' }), NOW)).toBeNull()
    expect(reminderFor(rec({ tz: 'Asia/Kolkata', last: '2026-10-03' }), NOW)).not.toBeNull() // already the 4th there
  })

  it('nudges a live streak, and sends the plain reminder otherwise', () => {
    expect(reminderFor(rec({ last: '2026-10-02', streak: 6 }), NOW)!.title).toBe('Keep your 6-day streak alive')
    expect(reminderFor(rec({ last: '2026-09-29', streak: 6 }), NOW)!.title).toBe('Today’s puzzle is live')
    expect(reminderFor(rec(), NOW)!.title).toBe('Today’s puzzle is live')
  })

  it('sends to those who need it and drops subscriptions the push service says are gone', async () => {
    const store = memoryStore()
    await handle(store, 'POST', { action: 'push', sub: sub(1), tz: 'America/Chicago', last: '2026-10-03' })
    await handle(store, 'POST', { action: 'push', sub: sub(2), tz: 'America/Chicago', last: '2026-10-01' })
    await handle(store, 'POST', { action: 'push', sub: sub(3), tz: 'America/Chicago' })
    const sent: [string, Message][] = []
    const tally = await sendReminders(store, async (r, m) => {
      sent.push([r.sub.endpoint, m])
      return r.sub.endpoint.endsWith('3') ? 410 : 201
    }, NOW)
    expect(tally).toEqual({ sent: 1, played: 1, gone: 1, failed: 0 })
    expect(sent.map(([e]) => e).sort()).toEqual([sub(2).endpoint, sub(3).endpoint])
    expect(await store.smembers(PUSH_SUBS)).toHaveLength(2)
  })
})
