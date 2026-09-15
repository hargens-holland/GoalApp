import { describe, it, expect } from "vitest";
import { pickHue } from "@/lib/colors";

/**
 * Goal hues are the only color in the interface, so two goals that look alike
 * make the calendar unreadable. The demo once shipped with two of four goals
 * on near-identical greens because hue was hashed from the id; these pin the
 * property that assignment now guarantees.
 */
describe("pickHue", () => {
  function minSeparation(hues: number[]): number {
    let min = 360;
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        const d = Math.abs(hues[i] - hues[j]) % 360;
        min = Math.min(min, d, 360 - d);
      }
    }
    return min;
  }

  it("is deterministic", () => {
    expect(pickHue([25, 200])).toBe(pickHue([25, 200]));
  });

  it("places the second goal opposite the first", () => {
    const first = pickHue([]);
    const second = pickHue([first]);
    expect(Math.abs(second - first)).toBe(180);
  });

  it("keeps six sequentially created goals at least 45° apart", () => {
    const hues: number[] = [];
    for (let i = 0; i < 6; i++) hues.push(pickHue(hues));
    expect(new Set(hues).size).toBe(6);
    expect(minSeparation(hues)).toBeGreaterThanOrEqual(45);
  });

  it("never returns a hue already in use while free ones remain", () => {
    const hues: number[] = [];
    for (let i = 0; i < 12; i++) hues.push(pickHue(hues));
    expect(new Set(hues).size).toBe(12);
  });
});
