import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearFuelPriceCache, fetchFuelPrice } from '../fuel-price'

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
  clearFuelPriceCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

describe('fetchFuelPrice', () => {
  it('returns geolocated price from nearest station', async () => {
    mockFetch.mockReturnValueOnce(
      jsonResponse({ results: [{ adresse: '12 rue du Test', ville: 'Paris', sp95_prix: 1.879 }] }),
    )
    const result = await fetchFuelPrice('sp95', { lat: 48.85, lng: 2.35 })
    expect(result.source).toBe('geolocated')
    expect(result.priceEur).toBe(1.879)
    expect(result.stationName).toContain('Paris')
  })

  it('falls back to national average when no nearby stations', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [] }))
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.85 }] }))
    const result = await fetchFuelPrice('sp95', { lat: 48.85, lng: 2.35 })
    expect(result.source).toBe('national_average')
    expect(result.priceEur).toBe(1.85)
  })

  it('falls back to national average on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.92 }] }))
    const result = await fetchFuelPrice('sp95', { lat: 48.85, lng: 2.35 })
    expect(result.source).toBe('national_average')
    expect(result.priceEur).toBe(1.92)
  })

  it('returns national average when no coords', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.88 }] }))
    const result = await fetchFuelPrice('diesel')
    expect(result.source).toBe('national_average')
    expect(result.priceEur).toBe(1.88)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('returns hardcoded fallback when everything fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    mockFetch.mockRejectedValueOnce(new Error('fail'))
    const result = await fetchFuelPrice('sp95', { lat: 48.85, lng: 2.35 })
    expect(result.priceEur).toBe(1.85)
  })

  it('filters stations with 0 price', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ adresse: 'x', ville: 'x', sp95_prix: 0 }] }))
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.90 }] }))
    const result = await fetchFuelPrice('sp95', { lat: 48.85, lng: 2.35 })
    expect(result.source).toBe('national_average')
  })

  it('uses cache on repeated calls', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.88 }] }))
    const r1 = await fetchFuelPrice('sp95')
    const r2 = await fetchFuelPrice('sp95')
    expect(r1).toEqual(r2)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('uses correct API field for diesel', async () => {
    mockFetch.mockReturnValueOnce(jsonResponse({ results: [{ avg_price: 1.55 }] }))
    await fetchFuelPrice('diesel')
    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('gazole_prix')
  })
})
