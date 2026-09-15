/**
 * Per-goal accent color.
 *
 * Goals share lightness and chroma (OKLCH) and differ only in hue, so any
 * number of goals stay harmonious against the paper background. Every colored
 * element in the interface — dots, bars, calendar blocks — derives from the
 * goal's stored hue, and nothing else in the UI carries color. That is
 * deliberate: the goals are the only thing worth distinguishing.
 *
 * The hue is *assigned* when a goal is created (see pickHue) and stored on the
 * row. An earlier version hashed the goal id into a hue, which is stateless
 * but has no notion of the *other* goals — two of four demo goals landed on
 * near-identical greens and the calendar legend became ambiguous. Assigning
 * the hue farthest from the goals that already exist fixes that permanently
 * for any goal count that fits on a color wheel.
 */

/** Candidate hues, every 15°. Coarse enough to keep neighbours distinct. */
const STEP = 15;

/** Hue for a user's first goal. Warm, so an account with one goal has warmth. */
const FIRST_HUE = 30;

function circularDistance(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
}

/**
 * Choose the hue that maximizes the minimum distance from the hues already in
 * use. Deterministic for a given input, so the same sequence of goal
 * creations always yields the same palette.
 */
export function pickHue(existing: number[]): number {
  if (existing.length === 0) return FIRST_HUE;

  let best = FIRST_HUE;
  let bestScore = -1;
  for (let h = 0; h < 360; h += STEP) {
    const score = Math.min(...existing.map((e) => circularDistance(h, e)));
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Solid accent — dots, bars, text on paper. */
export function goalColor(hue: number): string {
  return `oklch(0.58 0.15 ${hue})`;
}

/** Tint for a filled area behind text — calendar blocks, focus rule. */
export function goalSoft(hue: number): string {
  return `oklch(0.94 0.045 ${hue})`;
}

/** Darker ink for text set *on* the soft tint. */
export function goalInk(hue: number): string {
  return `oklch(0.38 0.11 ${hue})`;
}
