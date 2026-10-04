/**
 * Set while the player is looking at a neighbour's farm (see src/scenes/Visit.ts). Saving, cloud saves
 * and the "welcome back" catch-up check this flag and do nothing, so a visit can never write over,
 * tick or upload the player's own farm.
 */
export const visiting = { active: false };
