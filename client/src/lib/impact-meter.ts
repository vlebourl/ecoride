export interface ImpactReference {
  label: string
  co2Kg: number
}

export const IMPACT_REFERENCES: readonly ImpactReference[] = [
  { label: 'arbre planté (absorption annuelle)', co2Kg: 21 },
  { label: 'trajet Paris–Lyon en voiture', co2Kg: 45 },
  { label: "plein d'essence (50L SP95)", co2Kg: 115 },
  { label: 'vol Paris–New York (aller)', co2Kg: 400 },
]

export interface ImpactLevel {
  currentRef: ImpactReference
  nextRef: ImpactReference | null
  progressRatio: number
  totalCo2Kg: number
  completedRefs: ImpactReference[]
}

export function computeImpactLevel(totalCo2Kg: number): ImpactLevel {
  const co2 = Math.max(0, totalCo2Kg)
  const completed: ImpactReference[] = []

  let remaining = co2

  for (let i = 0; i < IMPACT_REFERENCES.length; i++) {
    const ref = IMPACT_REFERENCES[i]!

    if (remaining < ref.co2Kg) {
      return {
        currentRef: ref,
        nextRef: IMPACT_REFERENCES[i + 1] ?? null,
        progressRatio: remaining / ref.co2Kg,
        totalCo2Kg: co2,
        completedRefs: completed,
      }
    }

    remaining -= ref.co2Kg
    completed.push(ref)
  }

  const lastRef = IMPACT_REFERENCES[IMPACT_REFERENCES.length - 1]!
  return {
    currentRef: lastRef,
    nextRef: null,
    progressRatio: 1,
    totalCo2Kg: co2,
    completedRefs: completed,
  }
}
