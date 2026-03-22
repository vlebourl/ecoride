export interface StreakInfo {
  currentStreak: number
  longestStreak: number
  lastTripDate: string | null
  isActiveToday: boolean
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return toDateStr(d)
}

function longestRun(sortedDesc: string[]): number {
  if (sortedDesc.length === 0) return 0
  let max = 1
  let run = 1
  for (let i = 1; i < sortedDesc.length; i++) {
    if (sortedDesc[i] === addDays(sortedDesc[i - 1]!, -1)) {
      run++
      if (run > max) max = run
    } else {
      run = 1
    }
  }
  return max
}

export function computeStreak(tripDates: string[], today?: string): StreakInfo {
  if (tripDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastTripDate: null, isActiveToday: false }
  }

  const unique = [...new Set(tripDates)].sort().reverse()
  const todayStr = today ?? toDateStr(new Date())
  const last = unique[0]!

  const isActiveToday = last === todayStr
  const isYesterday = last === addDays(todayStr, -1)

  if (!isActiveToday && !isYesterday) {
    return {
      currentStreak: 0,
      longestStreak: longestRun(unique),
      lastTripDate: last,
      isActiveToday: false,
    }
  }

  let current = 1
  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === addDays(unique[i - 1]!, -1)) {
      current++
    } else {
      break
    }
  }

  const longest = longestRun(unique)

  return {
    currentStreak: current,
    longestStreak: Math.max(current, longest),
    lastTripDate: last,
    isActiveToday,
  }
}
