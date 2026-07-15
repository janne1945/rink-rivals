import { describe, expect, it } from "vitest";

import { motionDurationMs, motionPresets, reducedMotionPreset, type MotionPresetName } from "./motionPresets";

describe("Match Experience V2 motion presets", () => {
  it("provides all typed presets with presentation-only positive tokens", () => {
    const names: MotionPresetName[] = ["broadcast", "arena", "fastBroadcast"];
    expect(Object.keys(motionPresets).sort()).toEqual([...names].sort());
    for (const name of names) {
      const preset = motionPresets[name];
      expect(Object.values(preset.duration).every((duration) => duration > 0)).toBe(true);
      expect(preset.distance).toBeGreaterThan(0);
      expect(preset.scale).toBeGreaterThanOrEqual(1);
    }
  });

  it("collapses decorative timing without changing preset data for reduced motion", () => {
    expect(motionDurationMs(motionPresets.broadcast, true, "finalShift")).toBe(1);
    expect(motionDurationMs(motionPresets.broadcast, false, "finalShift")).toBe(motionPresets.broadcast.duration.finalShift);
    expect(Object.values(reducedMotionPreset(motionPresets.arena).duration).every((duration) => duration === 1)).toBe(true);
    expect(reducedMotionPreset(motionPresets.arena)).toMatchObject({ distance: 0, rotation: 0, scale: 1, parallax: 0 });
  });
});
