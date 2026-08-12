/**
 * Stable per-goal accent color. Goals share lightness & chroma and differ only
 * in hue (OKLCH), so any number of goals stay harmonious. Hue is derived from a
 * hash of the goal id, so the same goal is the same color everywhere.
 */
export function goalHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

export function goalColor(id: string): string {
  return `oklch(0.74 0.14 ${goalHue(id)})`;
}

export function goalSoft(id: string): string {
  return `oklch(0.74 0.14 ${goalHue(id)} / 0.15)`;
}
