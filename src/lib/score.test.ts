import { describe, expect, it } from 'vitest'
import { bestByDay, computeStats, dayPoints, scoreFor } from './storage'

const base = { par: 3, gaveUp: false }
describe('scoreFor', () => {
  it('maxes at 1000 for a fast, rare shortest chain', () => {
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0 }).total).toBe(900)
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0, rare: true }).total).toBe(1000)
  })
  it('only rewards a rare route on the shortest chain', () => {
    expect(scoreFor({ ...base, links: 4, seconds: 400, hints: 0, rare: true }).rare).toBe(0)
  })
  it('gives nothing for a give-up', () => {
    expect(scoreFor({ ...base, links: 3, gaveUp: true, seconds: 5 }).total).toBe(0)
  })
  it('drops steeply per extra link and each hint costs points', () => {
    const a = scoreFor({ ...base, links: 3, seconds: 400, hints: 0 }).total
    const b = scoreFor({ ...base, links: 4, seconds: 400, hints: 0 }).total
    const c = scoreFor({ ...base, links: 3, seconds: 400, hints: 1 }).total
    expect(a).toBe(800)
    expect(b).toBe(550)
    expect(c).toBe(700)
  })
  it('never goes negative and speed fades out', () => {
    expect(scoreFor({ ...base, links: 9, seconds: 9999, hints: 5 }).total).toBe(0)
    expect(scoreFor({ ...base, links: 3, seconds: 165 }).speed).toBe(50)
  })
  it('feeds stats averages', () => {
    const s = computeStats({ '2026-10-01': { ...base, links: 3, live: true, seconds: 20, hints: 0 } }, '2026-10-01')
    expect(s.avgScore).toBe(900)
    expect(s.bestScore).toBe(900)
  })
})

describe('dayPoints and bestByDay', () => {
  const win = { par: 2, links: 2, seconds: 20, hints: 0, gaveUp: false, live: true, rare: true } // 1000 pts
  const ok = { ...win, links: 3, seconds: 400 } // 550 pts

  it('counts the India daily in full and only a quarter of the best home daily', () => {
    expect(dayPoints(ok, [win, win, win])).toEqual({ main: 550, bonus: 250, total: 800 })
    expect(dayPoints(undefined, [win])).toEqual({ main: 0, bonus: 250, total: 250 })
    expect(dayPoints(undefined, [])).toBeNull()
  })

  it('keeps a streak day if any daily was won on it', () => {
    const lost = { ...win, gaveUp: true }
    const merged = bestByDay([{ '2026-10-08': lost }, { '2026-10-08': win, '2026-10-09': win }])
    expect(merged['2026-10-08']).toBe(win)
    expect(computeStats(merged, '2026-10-09').streak).toBe(2)
  })
})
