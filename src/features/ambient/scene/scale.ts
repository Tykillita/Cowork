/**
 * One scale for every scene. The walking character is the reference: about
 * as tall as a person, 15 rows (≈ 1.7 m, so ≈ 9 rows per metre). Animals are
 * drawn as mascots, a bit bigger than life, but everything built for people
 * keeps real proportions against that walker: doors are taller than it,
 * stalls have a roof above its head, trains and buildings dwarf it.
 *
 * Each scene figure declares one of these sizes; a unit test checks that its
 * height (in rows, outline included) falls inside the range.
 */
export const PROP_SIZES = {
  /** Birds, bats, fish, chicks, floating fruit. */
  tiny: { min: 3, max: 7 },
  /** Cats, hens, a fox or a dog sitting, pumpkins, crates, suitcases. */
  small: { min: 5, max: 13 },
  /** Mascot-sized animals and little groups: capybaras, rabbits, penguins, sheep. */
  medium: { min: 9, max: 20 },
  /** Cows, camels, a dragon lying down. */
  large: { min: 11, max: 24 },
  /** People and things of their height: a knight, a snowman, a vending machine. */
  person: { min: 13, max: 22 },
  /** Street furniture taller than a person: stone lanterns, lamp posts, signals, banners, wells. */
  fixture: { min: 18, max: 36 },
  /** Stalls, carts and tents, with room to stand under the roof. */
  stall: { min: 22, max: 32 },
  /** Cars and boats. */
  vehicle: { min: 10, max: 34 },
  /** A train: more than twice as tall as a person. */
  train: { min: 30, max: 40 },
  /** Houses, shops, barns, gates: the door alone is taller than the walker. */
  building: { min: 34, max: 50 },
  /** Towers, windmills, lighthouses, castles, rockets, waterfalls. */
  landmark: { min: 40, max: 58 },
  /** Things in the sky or far away (balloons, islands, flyers): no ground scale applies. */
  sky: { min: 1, max: 72 },
} as const;

export type PropSize = keyof typeof PROP_SIZES;

/** Walking characters stay around a person's height. */
export const CHARACTER_HEIGHT = { min: 10, max: 16 } as const;
