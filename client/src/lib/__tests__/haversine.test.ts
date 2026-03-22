import { describe, expect, it } from 'vitest'
import { haversineDistance } from '../haversine'

describe('haversineDistance', () => {
  it('returns 0 for the same point', () => {
    expect(haversineDistance(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0)
  })
  it('calculates Paris to Lyon (~392 km)', () => {
    const d = haversineDistance(48.8566, 2.3522, 45.764, 4.8357)
    expect(d).toBeGreaterThan(390)
    expect(d).toBeLessThan(395)
  })
  it('calculates a short cycling distance (~1 km)', () => {
    const d = haversineDistance(48.8566, 2.3522, 48.8656, 2.3522)
    expect(d).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(1.1)
  })
  it('handles antipodal points (~20000 km)', () => {
    const d = haversineDistance(0, 0, 0, 180)
    expect(d).toBeGreaterThan(20000)
    expect(d).toBeLessThan(20100)
  })
  it('handles very small distances (< 100m)', () => {
    const d = haversineDistance(48.8566, 2.3522, 48.85705, 2.3522)
    expect(d).toBeGreaterThan(0.04)
    expect(d).toBeLessThan(0.06)
  })
  it('is symmetric', () => {
    const d1 = haversineDistance(48.8566, 2.3522, 45.764, 4.8357)
    const d2 = haversineDistance(45.764, 4.8357, 48.8566, 2.3522)
    expect(d1).toBeCloseTo(d2, 10)
  })
})
