import { describe, expect, it } from 'vitest'
import { handle, memoryStore } from '../../api/sync'

const entry = (links: number, extra: Record<string, unknown> = {}) => ({
  links, par: 2, seconds: 60, hints: 0, gaveUp: false, live: true,
  path: [{ kind: 'film', id: '1' }, { kind: 'person', id: '2' }, { kind: 'film', id: '3' }], ...extra,
})

describe('sync api', () => {
  it('creates a player on first login, then requires the same PIN', async () => {
    const store = memoryStore()
    const a = await handle(store, 'POST', { action: 'login', name: 'Advaith', pin: '1234' })
    expect(a.status).toBe(200)
    expect(a.body.created).toBe(true)

    const wrong = await handle(store, 'POST', { action: 'login', name: 'advaith', pin: '9999' })
    expect(wrong.status).toBe(401)

    const again = await handle(store, 'POST', { action: 'login', name: 'ADVAITH', pin: '1234' })
    expect(again.status).toBe(200)
    expect(again.body.created).toBe(false)
    expect(again.body.token).toBe(a.body.token)
    expect(again.body.name).toBe('Advaith')
  })

  it('locks a name after repeated wrong PINs', async () => {
    const store = memoryStore()
    await handle(store, 'POST', { action: 'login', name: 'Priya', pin: '1111' })
    for (let i = 0; i < 8; i++) await handle(store, 'POST', { action: 'login', name: 'Priya', pin: '0000' })
    const r = await handle(store, 'POST', { action: 'login', name: 'Priya', pin: '1111' })
    expect(r.status).toBe(429)
  })

  it('rejects bad names and PINs', async () => {
    const store = memoryStore()
    expect((await handle(store, 'POST', { action: 'login', name: 'x', pin: '1234' })).status).toBe(400)
    expect((await handle(store, 'POST', { action: 'login', name: 'Ravi', pin: '12a4' })).status).toBe(400)
  })

  it('merges results with the first result per day winning, and drops junk', async () => {
    const store = memoryStore()
    const login = await handle(store, 'POST', {
      action: 'login', name: 'Meera', pin: '4321', results: { '2026-09-29': entry(3) },
    })
    const auth = { name: 'Meera', token: login.body.token }
    const r = await handle(store, 'POST', {
      action: 'sync', ...auth,
      results: { '2026-09-29': entry(2), '2026-09-30': entry(2), 'nope': entry(1), '2026-09-28': { links: 'x' } },
    })
    const results = r.body.results as Record<string, { links: number }>
    expect(Object.keys(results).sort()).toEqual(['2026-09-29', '2026-09-30'])
    expect(results['2026-09-29'].links).toBe(3)
  })

  it('requires a valid token to sync or see the board', async () => {
    const store = memoryStore()
    await handle(store, 'POST', { action: 'login', name: 'Kiran', pin: '5555' })
    expect((await handle(store, 'POST', { action: 'sync', name: 'Kiran', token: 'bad', results: {} })).status).toBe(401)
    expect((await handle(store, 'POST', { action: 'board', name: 'Kiran', token: 'bad' })).status).toBe(401)
  })

  it('shows friends their scores but not their chains', async () => {
    const store = memoryStore()
    const a = await handle(store, 'POST', { action: 'login', name: 'Anu', pin: '1212', results: { '2026-09-30': entry(2) } })
    await handle(store, 'POST', { action: 'login', name: 'Bala', pin: '3434' })
    const board = await handle(store, 'POST', { action: 'board', name: 'Anu', token: a.body.token })
    const players = board.body.players as { name: string; results: Record<string, Record<string, unknown>> }[]
    expect(players.map((p) => p.name).sort()).toEqual(['Anu', 'Bala'])
    const anu = players.find((p) => p.name === 'Anu')!
    expect(anu.results['2026-09-30'].links).toBe(2)
    expect(JSON.parse(JSON.stringify(anu.results['2026-09-30'])).path).toBeUndefined()
  })

  it('counts how many players took each route, once per player, from their stored chain', async () => {
    const store = memoryStore()
    const other = [{ kind: 'film', id: '1' }, { kind: 'person', id: '9' }, { kind: 'film', id: '3' }]
    const day = '2026-09-30'
    const players = [['Asha', entry(1)], ['Bhuvan', entry(1)], ['Chitra', entry(1, { path: other })]] as const
    const tokens: Record<string, string> = {}
    for (const [name, e] of players) {
      const r = await handle(store, 'POST', { action: 'login', name, pin: '1111', results: { [day]: e } })
      tokens[name] = r.body.token as string
    }
    const ask = (name: string) => handle(store, 'POST', { action: 'route', name, token: tokens[name], date: day })
    expect((await ask('Asha')).body).toEqual({ count: 1, total: 1, top: 1 })
    expect((await ask('Bhuvan')).body).toEqual({ count: 2, total: 2, top: 2 })
    expect((await ask('Chitra')).body).toEqual({ count: 1, total: 3, top: 2 })
    // Asking again doesn't count twice.
    expect((await ask('Asha')).body).toEqual({ count: 2, total: 3, top: 2 })
  })

  it('has no route share for give-ups, archive plays or missing days', async () => {
    const store = memoryStore()
    const r = await handle(store, 'POST', {
      action: 'login', name: 'Dev', pin: '2222',
      results: { '2026-09-29': entry(2, { gaveUp: true }), '2026-09-28': entry(2, { live: false }) },
    })
    const ask = (date: string) => handle(store, 'POST', { action: 'route', name: 'Dev', token: r.body.token, date })
    expect((await ask('2026-09-29')).status).toBe(404)
    expect((await ask('2026-09-28')).status).toBe(404)
    expect((await ask('2026-09-30')).status).toBe(404)
    expect((await handle(store, 'POST', { action: 'route', name: 'Dev', token: 'bad', date: '2026-09-29' })).status).toBe(401)
  })

  it('clamps an implausibly long time instead of dropping the whole result (QA C7)', async () => {
    const store = memoryStore()
    const r = await handle(store, 'POST', { action: 'login', name: 'Slow', pin: '6666', results: { '2026-09-29': entry(2, { seconds: 8 * 86400 }) } })
    const results = r.body.results as Record<string, { seconds: number }>
    expect(results['2026-09-29']).toBeDefined()
    expect(results['2026-09-29'].seconds).toBe(7 * 86400)
    const neg = await handle(store, 'POST', { action: 'sync', name: 'Slow', token: r.body.token, results: { '2026-09-28': entry(2, { seconds: -5 }) } })
    expect(Object.keys(neg.body.results as object)).toEqual(['2026-09-29'])
  })

  it('expires in-memory bump counters when their TTL elapses', async () => {
    const store = memoryStore()
    await store.bump('ttl-test', 1)
    expect(await store.get('ttl-test')).toBe('1')
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect(await store.get('ttl-test')).toBeNull()
  })

  it('syncs home-cinema results per language across devices, first result per day winning', async () => {
    const store = memoryStore()
    const laptop = await handle(store, 'POST', { action: 'login', name: 'Meera', pin: '4321' })
    const { name, token } = laptop.body as { name: string; token: string }
    await handle(store, 'POST', { action: 'sync', name, token, results: {}, home: { te: { '2026-10-08': entry(2) }, xx1: { '2026-10-08': entry(2) } } })

    // A second device with nothing local gets the Telugu result back; junk language codes are dropped.
    const phone = await handle(store, 'POST', { action: 'login', name: 'Meera', pin: '4321', results: {}, home: { te: { '2026-10-08': entry(5) } } })
    const home = phone.body.home as Record<string, Record<string, { links: number }>>
    expect(Object.keys(home)).toEqual(['te'])
    expect(home.te['2026-10-08'].links).toBe(2)

    // Friends' boards carry home-cinema scores too, still without chains.
    const board = await handle(store, 'POST', { action: 'board', name, token })
    const me = (board.body.players as { home: Record<string, Record<string, Record<string, unknown>>> }[])[0]
    expect(me.home.te['2026-10-08'].links).toBe(2)
    expect(JSON.parse(JSON.stringify(me.home.te['2026-10-08'])).path).toBeUndefined()
  })

  it('flags a route as rare on the board when few players took it, without revealing it', async () => {
    const store = memoryStore()
    const other = (id: string) => entry(2, { path: [{ kind: 'film', id: '1' }, { kind: 'person', id }, { kind: 'film', id: '3' }] })
    const me = await handle(store, 'POST', { action: 'login', name: 'Kavya', pin: '1111', results: { '2026-10-09': other('9') } })
    await handle(store, 'POST', { action: 'login', name: 'Dev', pin: '1111', results: { '2026-10-09': other('2') } })
    await handle(store, 'POST', { action: 'login', name: 'Isha', pin: '1111', results: { '2026-10-09': other('2') } })
    // Alone on a route isn't rare until a popular route (3+ players) exists.
    const rows0 = (await handle(store, 'POST', { action: 'board', name: 'Kavya', token: me.body.token })).body.players as { name: string; results: Record<string, { rare?: boolean }> }[]
    expect(rows0.find((p) => p.name === 'Kavya')!.results['2026-10-09'].rare).toBeUndefined()
    await handle(store, 'POST', { action: 'login', name: 'Om', pin: '1111', results: { '2026-10-09': other('2') } })
    const board = await handle(store, 'POST', { action: 'board', name: 'Kavya', token: me.body.token })
    const rows = board.body.players as { name: string; results: Record<string, { rare?: boolean; path?: unknown }> }[]
    const day = (n: string) => rows.find((p) => p.name === n)!.results['2026-10-09']
    expect(day('Kavya').rare).toBe(true)
    expect(day('Dev').rare).toBeUndefined()
    expect(day('Kavya').path).toBeUndefined()
  })
})
