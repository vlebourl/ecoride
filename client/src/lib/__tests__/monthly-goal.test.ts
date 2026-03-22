import { describe, expect, it } from 'vitest'
import { computeMonthlyGoal } from '../monthly-goal'

const trips = [
  { distanceKm: 10, co2SavedKg: 1.5, startedAt: '2026-03-05T08:00:00Z' },
  { distanceKm: 15, co2SavedKg: 2.25, startedAt: '2026-03-10T17:30:00Z' },
  { distanceKm: 8, co2SavedKg: 1.2, startedAt: '2026-03-15T09:00:00Z' },
  { distanceKm: 20, co2SavedKg: 3.0, startedAt: '2026-02-20T08:00:00Z' },
]

describe('computeMonthlyGoal', () => {
  it('calculates km goal progress', () => {
    const goal = computeMonthlyGoal('km', 50, trips, '2026-03')
    expect(goal.currentValue).toBeCloseTo(33)
    expect(goal.progressRatio).toBeCloseTo(33 / 50)
  })
  it('calculates co2 goal progress', () => {
    expect(computeMonthlyGoal('co2', 10, trips, '2026-03').currentValue).toBeCloseTo(4.95)
  })
  it('excludes trips from other months', () => {
    expect(computeMonthlyGoal('km', 50, trips, '2026-02').currentValue).toBe(20)
  })
  it('returns 0 progress with no trips', () => {
    const goal = computeMonthlyGoal('km', 100, [], '2026-03')
    expect(goal.currentValue).toBe(0)
    expect(goal.progressRatio).toBe(0)
  })
  it('caps progress_ratio at 1.0', () => {
    expect(computeMonthlyGoal('km', 20, trips, '2026-03').progressRatio).toBe(1)
  })
  it('handles 0 target value', () => {
    expect(computeMonthlyGoal('km', 0, trips, '2026-03').progressRatio).toBe(0)
  })
})
