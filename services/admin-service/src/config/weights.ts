export const defaultWeights = {
  expiry_priority: 0.35,
  nutrition_fit: 0.35,
  preference_match: 0.3,
} as const;

export const knownWeightKeys = Object.keys(defaultWeights);
