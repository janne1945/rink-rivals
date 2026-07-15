export type MotionPresetName = "broadcast" | "arena" | "fastBroadcast";

export interface MotionPreset {
  readonly name: MotionPresetName;
  readonly duration: {
    readonly intro: number;
    readonly category: number;
    readonly commit: number;
    readonly rivalEntrance: number;
    readonly reveal: number;
    readonly comparison: number;
    readonly score: number;
    readonly transition: number;
    readonly matchPoint: number;
    readonly finalShift: number;
    readonly final: number;
  };
  readonly distance: number;
  readonly rotation: number;
  readonly scale: number;
  readonly parallax: number;
  readonly blur: number;
  readonly glow: number;
  readonly cameraShift: number;
}

export const motionPresets = {
  broadcast: {
    name: "broadcast",
    duration: {
      intro: 900,
      category: 1050,
      commit: 520,
      rivalEntrance: 680,
      reveal: 720,
      comparison: 620,
      score: 480,
      transition: 560,
      matchPoint: 920,
      finalShift: 1500,
      final: 850,
    },
    distance: 46,
    rotation: 2.4,
    scale: 1.035,
    parallax: 18,
    blur: 12,
    glow: 0.8,
    cameraShift: 16,
  },
  arena: {
    name: "arena",
    duration: {
      intro: 700,
      category: 820,
      commit: 460,
      rivalEntrance: 540,
      reveal: 600,
      comparison: 520,
      score: 420,
      transition: 460,
      matchPoint: 760,
      finalShift: 1180,
      final: 700,
    },
    distance: 62,
    rotation: 3.5,
    scale: 1.05,
    parallax: 24,
    blur: 8,
    glow: 1,
    cameraShift: 24,
  },
  fastBroadcast: {
    name: "fastBroadcast",
    duration: {
      intro: 120,
      category: 140,
      commit: 100,
      rivalEntrance: 120,
      reveal: 140,
      comparison: 120,
      score: 100,
      transition: 100,
      matchPoint: 140,
      finalShift: 180,
      final: 140,
    },
    distance: 28,
    rotation: 1.2,
    scale: 1.02,
    parallax: 8,
    blur: 5,
    glow: 0.55,
    cameraShift: 8,
  },
} as const satisfies Record<MotionPresetName, MotionPreset>;

export function motionDurationMs(preset: MotionPreset, reducedMotion: boolean, key: keyof MotionPreset["duration"]): number {
  return reducedMotion ? 1 : preset.duration[key];
}

export function reducedMotionPreset(preset: MotionPreset): MotionPreset {
  return {
    ...preset,
    duration: {
      intro: 1,
      category: 1,
      commit: 1,
      rivalEntrance: 1,
      reveal: 1,
      comparison: 1,
      score: 1,
      transition: 1,
      matchPoint: 1,
      finalShift: 1,
      final: 1,
    },
    distance: 0,
    rotation: 0,
    scale: 1,
    parallax: 0,
    blur: 0,
    glow: 0,
    cameraShift: 0,
  };
}
