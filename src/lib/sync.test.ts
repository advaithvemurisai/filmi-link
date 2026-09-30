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
})
