import { assign, setup } from "xstate";

import type { BattlePhase, BattleViewState } from "../../domain/battle";
import { motionDurationMs, type MotionPreset } from "./motionPresets";

export type StablePresentationState =
  | "matchIntro"
  | "awaitingSelection"
  | "awaitingAuthoritativeReveal"
  | "roundResult"
  | "matchFinal"
  | "settling"
  | "settlementError"
  | "complete";

export interface PresentationReconstruction {
  readonly target: StablePresentationState;
  readonly domainPhase: BattlePhase;
  readonly matchComplete: boolean;
  readonly matchPoint: boolean;
  readonly finalShift: boolean;
  readonly settlementComplete: boolean;
  readonly settlementFailed: boolean;
}

export interface PresentationMachineInput extends PresentationReconstruction {
  readonly preset: MotionPreset;
  readonly reducedMotion: boolean;
}

interface PresentationContext extends PresentationMachineInput {
  readonly requestPending: boolean;
}

export type PresentationEvent =
  | { readonly type: "CARD_SELECTED" }
  | { readonly type: "REVEAL_REQUESTED" }
  | { readonly type: "AUTHORITATIVE_REVEAL_RECEIVED"; readonly matchComplete: boolean; readonly matchPoint: boolean; readonly finalShift: boolean }
  | { readonly type: "REVEAL_FAILED" }
  | { readonly type: "CONTINUE" }
  | { readonly type: "SETTLEMENT_STARTED" }
  | { readonly type: "SETTLEMENT_COMPLETED" }
  | { readonly type: "SETTLEMENT_FAILED" }
  | { readonly type: "RETRY_SETTLEMENT" }
  | { readonly type: "REDUCED_MOTION_CHANGED"; readonly reduced: boolean };

export function isMatchPoint(battle: BattleViewState): boolean {
  return battle.phase !== "complete"
    && battle.roundIndex < 5
    && (battle.roundWins.player === 2 || battle.roundWins.opponent === 2);
}

export function isFinalShift(battle: BattleViewState): boolean {
  return battle.phase !== "complete"
    && battle.roundIndex === 4
    && battle.roundWins.player === 2
    && battle.roundWins.opponent === 2;
}

export function reconstructPresentation(input: {
  readonly battle: BattleViewState;
  readonly reviewingRound: boolean;
  readonly restored: boolean;
  readonly settling: boolean;
  readonly settlementComplete: boolean;
  readonly settlementError?: string;
}): PresentationReconstruction {
  const { battle } = input;
  const matchComplete = battle.phase === "complete";
  let target: StablePresentationState;

  if (matchComplete && input.settlementComplete) target = "complete";
  else if (matchComplete && input.settlementError) target = "settlementError";
  else if (matchComplete && input.settling) target = "settling";
  else if (matchComplete) target = "matchFinal";
  else if (input.reviewingRound && battle.results.length > 0) target = "roundResult";
  else if (battle.phase === "awaiting-reveal") target = "awaitingAuthoritativeReveal";
  else target = input.restored ? "awaitingSelection" : "matchIntro";

  return {
    target,
    domainPhase: battle.phase,
    matchComplete,
    matchPoint: isMatchPoint(battle),
    finalShift: isFinalShift(battle),
    settlementComplete: input.settlementComplete,
    settlementFailed: Boolean(input.settlementError),
  };
}

export const presentationMachine = setup({
  types: {
    context: {} as PresentationContext,
    events: {} as PresentationEvent,
    input: {} as PresentationMachineInput,
  },
  actions: {
    setRequestPending: assign({ requestPending: true }),
    clearRequestPending: assign({ requestPending: false }),
    applyReveal: assign(({ event }) => event.type === "AUTHORITATIVE_REVEAL_RECEIVED"
      ? {
          requestPending: false,
          matchComplete: event.matchComplete,
          matchPoint: event.matchPoint,
          finalShift: event.finalShift,
        }
      : {}),
    markSettlementStarted: assign({ settlementFailed: false }),
    markSettlementComplete: assign({ settlementComplete: true, settlementFailed: false }),
    markSettlementFailed: assign({ settlementFailed: true, settlementComplete: false }),
    setReducedMotion: assign(({ event }) => event.type === "REDUCED_MOTION_CHANGED"
      ? { reducedMotion: event.reduced }
      : {}),
  },
  guards: {
    startsComplete: ({ context }) => context.target === "complete",
    startsSettlementError: ({ context }) => context.target === "settlementError",
    startsSettling: ({ context }) => context.target === "settling",
    startsMatchFinal: ({ context }) => context.target === "matchFinal",
    startsRoundResult: ({ context }) => context.target === "roundResult",
    startsAwaitingReveal: ({ context }) => context.target === "awaitingAuthoritativeReveal",
    startsAwaitingSelection: ({ context }) => context.target === "awaitingSelection",
    matchComplete: ({ context }) => context.matchComplete,
    settlementComplete: ({ context }) => context.settlementComplete,
    settlementFailed: ({ context }) => context.settlementFailed,
    finalShift: ({ context }) => context.finalShift,
    matchPoint: ({ context }) => context.matchPoint,
  },
  delays: {
    intro: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "intro"),
    category: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "category"),
    commit: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "commit"),
    rivalEntrance: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "rivalEntrance"),
    reveal: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "reveal"),
    comparison: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "comparison"),
    score: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "score"),
    transition: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "transition"),
    matchPoint: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "matchPoint"),
    finalShift: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "finalShift"),
    final: ({ context }) => motionDurationMs(context.preset, context.reducedMotion, "final"),
  },
}).createMachine({
  id: "matchExperiencePresentation",
  context: ({ input }) => ({ ...input, requestPending: false }),
  initial: "bootstrapping",
  on: {
    REDUCED_MOTION_CHANGED: { actions: "setReducedMotion" },
  },
  states: {
    bootstrapping: {
      always: [
        { guard: "startsComplete", target: "complete" },
        { guard: "startsSettlementError", target: "settlementError" },
        { guard: "startsSettling", target: "settling" },
        { guard: "startsMatchFinal", target: "matchFinal" },
        { guard: "startsRoundResult", target: "roundResult" },
        { guard: "startsAwaitingReveal", target: "awaitingAuthoritativeReveal" },
        { guard: "startsAwaitingSelection", target: "awaitingSelection" },
        { target: "matchIntro" },
      ],
    },
    matchIntro: { after: { intro: "categoryIntro" } },
    categoryIntro: { after: { category: "awaitingSelection" } },
    awaitingSelection: { on: { CARD_SELECTED: "cardCommit" } },
    cardCommit: { after: { commit: "rivalEntrance" } },
    rivalEntrance: { after: { rivalEntrance: "awaitingAuthoritativeReveal" } },
    awaitingAuthoritativeReveal: {
      on: {
        REVEAL_REQUESTED: { actions: "setRequestPending" },
        AUTHORITATIVE_REVEAL_RECEIVED: { target: "reveal", actions: "applyReveal" },
        REVEAL_FAILED: { actions: "clearRequestPending" },
      },
    },
    reveal: { after: { reveal: "comparison" } },
    comparison: { after: { comparison: "roundResult" } },
    roundResult: { on: { CONTINUE: "scoreUpdate" } },
    scoreUpdate: {
      after: {
        score: [
          { guard: "matchComplete", target: "matchFinal" },
          { target: "roundTransition" },
        ],
      },
    },
    roundTransition: {
      after: {
        transition: [
          { guard: "finalShift", target: "finalShift" },
          { guard: "matchPoint", target: "matchPoint" },
          { target: "categoryIntro" },
        ],
      },
    },
    matchPoint: { after: { matchPoint: "categoryIntro" } },
    finalShift: { after: { finalShift: "categoryIntro" } },
    matchFinal: {
      on: {
        SETTLEMENT_STARTED: { target: "settling", actions: "markSettlementStarted" },
        SETTLEMENT_COMPLETED: { target: "complete", actions: "markSettlementComplete" },
        SETTLEMENT_FAILED: { target: "settlementError", actions: "markSettlementFailed" },
      },
      after: {
        final: [
          { guard: "settlementComplete", target: "complete" },
          { guard: "settlementFailed", target: "settlementError" },
          { target: "settling" },
        ],
      },
    },
    settling: {
      on: {
        SETTLEMENT_COMPLETED: { target: "complete", actions: "markSettlementComplete" },
        SETTLEMENT_FAILED: { target: "settlementError", actions: "markSettlementFailed" },
      },
    },
    settlementError: {
      on: {
        RETRY_SETTLEMENT: { target: "settling", actions: "markSettlementStarted" },
        SETTLEMENT_STARTED: { target: "settling", actions: "markSettlementStarted" },
        SETTLEMENT_COMPLETED: { target: "complete", actions: "markSettlementComplete" },
      },
    },
    complete: { type: "final" },
  },
});

