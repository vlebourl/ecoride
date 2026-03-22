export interface MonthlyGoal {
  targetType: 'km' | 'co2'
  targetValue: number
  currentValue: number
  progressRatio: number
  month: string
}

interface TripSummary {
  distanceKm: number
  co2SavedKg: number
  startedAt: string
}

export function computeMonthlyGoal(
  targetType: 'km' | 'co2',
  targetValue: number,
  trips: TripSummary[],
  month?: string,
): MonthlyGoal {
  const m = month ?? new Date().toISOString().slice(0, 7)
  const target = Math.max(0, targetValue)

  const monthTrips = trips.filter((t) => t.startedAt.slice(0, 7) === m)

  const currentValue = monthTrips.reduce((sum, t) => {
    return sum + (targetType === 'km' ? t.distanceKm : t.co2SavedKg)
  }, 0)

  return {
    targetType,
    targetValue: target,
    currentValue,
    progressRatio: target > 0 ? Math.min(1, currentValue / target) : 0,
    month: m,
  }
}
