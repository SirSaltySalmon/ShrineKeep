/**
 * Picks in proportion to `weight`. `roll` is a uniform sample in [0, 1).
 * Returns `undefined` only for an empty list.
 */
export function weightedPick<T extends { weight: number }>(candidates: readonly T[], roll: number): T | undefined {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  let remaining = roll * total
  for (const candidate of candidates) {
    remaining -= candidate.weight
    if (remaining < 0) return candidate
  }
  return candidates[candidates.length - 1]
}
