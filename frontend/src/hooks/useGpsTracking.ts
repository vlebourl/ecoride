import { useCallback, useEffect, useReducer, useRef } from 'react'
import { haversineDistance } from '../lib/haversine'
import { useWakeLock } from './useWakeLock'

interface GpsPoint {
  lat: number
  lng: number
  ts: number
}

const MAX_ACCURACY_M = 50
const MIN_DISTANCE_KM = 0.005 // 5m

export interface TrackingState {
  isTracking: boolean
  distanceKm: number
  durationSec: number
  gpsPoints: GpsPoint[]
  error: string | null
}

export interface TrackingSession {
  distanceKm: number
  durationSec: number
  gpsPoints: GpsPoint[]
  startedAt: string
  endedAt: string
}

type Action =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'GPS_POINT'; point: GpsPoint }
  | { type: 'TICK' }
  | { type: 'ERROR'; message: string }

const initial: TrackingState = {
  isTracking: false,
  distanceKm: 0,
  durationSec: 0,
  gpsPoints: [],
  error: null,
}

function reducer(state: TrackingState, action: Action): TrackingState {
  switch (action.type) {
    case 'START':
      return { ...initial, isTracking: true }
    case 'STOP':
      return { ...state, isTracking: false }
    case 'GPS_POINT': {
      const points = [...state.gpsPoints, action.point]
      let added = 0
      if (state.gpsPoints.length > 0) {
        const prev = state.gpsPoints[state.gpsPoints.length - 1]
        const d = haversineDistance(prev.lat, prev.lng, action.point.lat, action.point.lng)
        if (d >= MIN_DISTANCE_KM) added = d
      }
      return { ...state, gpsPoints: points, distanceKm: state.distanceKm + added, error: null }
    }
    case 'TICK':
      return { ...state, durationSec: state.durationSec + 1 }
    case 'ERROR':
      return { ...state, error: action.message }
  }
}

export function useGpsTracking() {
  const [state, dispatch] = useReducer(reducer, initial)
  const watchRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startRef = useRef<string | null>(null)
  const wakeLock = useWakeLock()

  const cleanup = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current)
      watchRef.current = null
    }
    if (timerRef.current !== null) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      dispatch({ type: 'ERROR', message: 'Geolocation not supported' })
      return
    }

    dispatch({ type: 'START' })
    startRef.current = new Date().toISOString()
    wakeLock.request()

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > MAX_ACCURACY_M) return
        dispatch({
          type: 'GPS_POINT',
          point: { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: pos.timestamp },
        })
      },
      (err) => {
        const msgs: Record<number, string> = {
          1: 'Permission GPS refusée',
          2: 'Position non disponible',
          3: 'Timeout GPS',
        }
        dispatch({ type: 'ERROR', message: msgs[err.code] ?? 'Erreur GPS' })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    timerRef.current = setInterval(() => dispatch({ type: 'TICK' }), 1000)
  }, [wakeLock])

  const stop = useCallback((): TrackingSession => {
    cleanup()
    dispatch({ type: 'STOP' })
    wakeLock.release()

    return {
      distanceKm: state.distanceKm,
      durationSec: state.durationSec,
      gpsPoints: state.gpsPoints,
      startedAt: startRef.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
    }
  }, [cleanup, state, wakeLock])

  const reset = useCallback(() => {
    cleanup()
    wakeLock.release()
    dispatch({ type: 'START' })
    dispatch({ type: 'STOP' })
    startRef.current = null
  }, [cleanup, wakeLock])

  useEffect(() => cleanup, [cleanup])

  return { state, start, stop, reset }
}
