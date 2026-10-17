import { describe, expect, it } from 'vitest'
import { bestByDay, computeStats, dayPoints, scoreFor } from './storage'

const base = { par: 3, gaveUp: false }
describe('scoreFor', () => {
  it('maxes at 1000 for a fast, rare shortest chain in hard mode', () => {
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0 }).total).toBe(800)
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0, rare: true }).total).toBe(900)
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0, rare: true, hard: true }).total).toBe(1000)
  })
  it('scales the speed and hard mode bonuses with the links points', () => {
    const fast = { ...base, links: 6, seconds: 20, hints: 0, hard: true }
    expect(scoreFor(fast)).toMatchObject({ links: 100, speed: 14, hard: 14 })
  })
  it('keeps taking points for every extra link', () => {
    const at = (links: number) => scoreFor({ ...base, links, seconds: 400, hints: 0 }).links
    expect([6, 7, 8, 9, 10, 20].map(at)).toEqual([100, 75, 50, 25, 0, 0])
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
    expect(a).toBe(700)
    expect(b).toBe(480)
    expect(c).toBe(600)
  })
  it('never goes negative and speed fades out', () => {
    expect(scoreFor({ ...base, links: 9, seconds: 9999, hints: 5 }).total).toBe(0)
    expect(scoreFor({ ...base, links: 3, seconds: 165 }).speed).toBe(50)
  })
  it('feeds stats averages', () => {
    const s = computeStats({ '2026-10-01': { ...base, links: 3, live: true, seconds: 20, hints: 0 } }, '2026-10-01')
    expect(s.avgScore).toBe(800)
    expect(s.bestScore).toBe(800)
  })
})

describe('dayPoints and bestByDay', () => {
  const win = { par: 2, links: 2, seconds: 20, hints: 0, gaveUp: false, live: true, rare: true } // 900 pts
  const ok = { ...win, links: 3, seconds: 400 } // 480 pts

  it('counts the India daily in full and only a quarter of the best home daily', () => {
    expect(dayPoints(ok, [win, win, win])).toEqual({ main: 480, bonus: 225, total: 705 })
    expect(dayPoints(undefined, [win])).toEqual({ main: 0, bonus: 225, total: 225 })
    expect(dayPoints(undefined, [])).toBeNull()
  })

  it('keeps a streak day if any daily was won on it', () => {
    const lost = { ...win, gaveUp: true }
    const merged = bestByDay([{ '2026-10-08': lost }, { '2026-10-08': win, '2026-10-09': win }])
    expect(merged['2026-10-08']).toBe(win)
    expect(computeStats(merged, '2026-10-09').streak).toBe(2)
  })
})
