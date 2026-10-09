import { describe, expect, it } from 'vitest'
import { computeStats, scoreFor } from './storage'

const base = { par: 3, gaveUp: false }
describe('scoreFor', () => {
  it('maxes at 1000 for a fast shortest chain', () => {
    expect(scoreFor({ ...base, links: 3, seconds: 20, hints: 0 }).total).toBe(1000)
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
    expect(scoreFor({ ...base, links: 3, seconds: 165 }).speed).toBe(100)
  })
  it('feeds stats averages', () => {
    const s = computeStats({ '2026-10-01': { ...base, links: 3, live: true, seconds: 20, hints: 0 } }, '2026-10-01')
    expect(s.avgScore).toBe(1000)
    expect(s.bestScore).toBe(1000)
  })
})
