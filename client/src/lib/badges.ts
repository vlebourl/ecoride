type BadgeId =
  | 'first_trip' | 'trips_10' | 'trips_50' | 'trips_100'
  | 'km_100' | 'km_500' | 'km_1000'
  | 'co2_10kg' | 'co2_100kg' | 'co2_1t'
  | 'streak_7' | 'streak_30'

interface BadgeMeta { label: string; icon: string }

const BADGES: Record<BadgeId, BadgeMeta> = {
  first_trip:  { label: 'Premier trajet',             icon: '🚴' },
  trips_10:    { label: '10 trajets',                 icon: '🔟' },
  trips_50:    { label: '50 trajets',                 icon: '🏅' },
  trips_100:   { label: '100 trajets',                icon: '💯' },
  km_100:      { label: '100 km',                     icon: '🛤️' },
  km_500:      { label: '500 km',                     icon: '🗺️' },
  km_1000:     { label: '1 000 km',                   icon: '🌍' },
  co2_10kg:    { label: '10 kg CO₂ économisés',       icon: '🌱' },
  co2_100kg:   { label: '100 kg CO₂ économisés',      icon: '🌳' },
  co2_1t:      { label: '1 tonne CO₂ économisée',     icon: '🌲' },
  streak_7:    { label: '7 jours de streak',          icon: '🔥' },
  streak_30:   { label: '30 jours de streak',         icon: '⚡' },
}

export interface BadgeStatus {
  id: BadgeId
  label: string
  icon: string
  threshold: number
  unlocked: boolean
  currentValue: number
  progressRatio: number
}

interface BadgeThreshold {
  id: BadgeId
  category: 'trips' | 'distance' | 'co2' | 'streak'
  threshold: number
}

const BADGE_THRESHOLDS: BadgeThreshold[] = [
  { id: 'first_trip', category: 'trips', threshold: 1 },
  { id: 'trips_10', category: 'trips', threshold: 10 },
  { id: 'trips_50', category: 'trips', threshold: 50 },
  { id: 'trips_100', category: 'trips', threshold: 100 },
  { id: 'km_100', category: 'distance', threshold: 100 },
  { id: 'km_500', category: 'distance', threshold: 500 },
  { id: 'km_1000', category: 'distance', threshold: 1000 },
  { id: 'co2_10kg', category: 'co2', threshold: 10 },
  { id: 'co2_100kg', category: 'co2', threshold: 100 },
  { id: 'co2_1t', category: 'co2', threshold: 1000 },
  { id: 'streak_7', category: 'streak', threshold: 7 },
  { id: 'streak_30', category: 'streak', threshold: 30 },
]

export interface UserStats {
  totalTrips: number
  totalKm: number
  totalCo2Kg: number
  currentStreak: number
}

const CATEGORY_TO_STAT: Record<string, keyof UserStats> = {
  trips: 'totalTrips',
  distance: 'totalKm',
  co2: 'totalCo2Kg',
  streak: 'currentStreak',
}

export function evaluateBadges(stats: UserStats): BadgeStatus[] {
  return BADGE_THRESHOLDS.map((bt) => {
    const badge = BADGES[bt.id]
    const statKey = CATEGORY_TO_STAT[bt.category]
    if (!statKey) return null as never
    const value = stats[statKey]
    return {
      id: bt.id,
      label: badge.label,
      icon: badge.icon,
      threshold: bt.threshold,
      unlocked: value >= bt.threshold,
      currentValue: value,
      progressRatio: Math.min(1, value / bt.threshold),
    }
  })
}
