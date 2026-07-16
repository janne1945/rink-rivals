import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { AiDifficulty } from "../../src/domain/battle";
import type { LineupSlot } from "../../src/domain/lineups";
import { gameCatalog } from "./gameCatalogFixture";
import { installSupabaseMock, type SupabaseMockState } from "./supabaseMock";

const situations = [
  { attribute: "speed", slots: ["LW", "C", "RW"] },
  { attribute: "shooting", slots: ["LW", "C", "RW"] },
  { attribute: "defense", slots: ["LD", "RD"] },
  { attribute: "clutch", slots: ["LW", "C", "RW", "LD", "RD"] },
  { attribute: "reflexes", slots: ["G"] },
] as const;

function deterministicIndex(key: string, length: number): number {
  let hash = 0;
  for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return Math.abs(hash) % length;
}

function score(cardId: string, attribute: string) {
  const card = gameCatalog.cards.find((candidate) => candidate.id === cardId)!;
  return { value: (card.attributes as unknown as Record<string, number>)[attribute] ?? 0, overall: card.overall };
}

function opponentSequence(ticket: {
  seed: string;
  difficulty: AiDifficulty;
  opponentSlots: Record<LineupSlot, string>;
}) {
  const used = new Set<string>();
  return situations.map((situation, roundIndex) => {
    const candidates = Object.entries(ticket.opponentSlots)
      .filter(([slot, cardId]) => situation.slots.includes(slot as never) && !used.has(cardId))
      .map(([slot, cardId]) => ({ slot: slot as LineupSlot, cardId, score: score(cardId, situation.attribute) }))
      .sort((left, right) => left.score.value - right.score.value || left.score.overall - right.score.overall || left.cardId.localeCompare(right.cardId));
    const pool = ticket.difficulty === "elite"
      ? candidates.slice(-1)
      : ticket.difficulty === "rookie" ? candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2))) : candidates.slice(Math.floor(candidates.length / 2));
    const selected = ticket.difficulty === "elite" ? pool[0] : pool[deterministicIndex(`${ticket.seed}:${roundIndex}:${ticket.difficulty}`, pool.length)];
    used.add(selected.cardId);
    return selected.cardId;
  });
}

function playerWins(playerCardId: string, opponentCardId: string, attribute: string, seed: string, roundIndex: number): boolean {
  const player = score(playerCardId, attribute);
  const opponent = score(opponentCardId, attribute);
  if (player.value !== opponent.value) return player.value > opponent.value;
  if (player.overall !== opponent.overall) return player.overall > opponent.overall;
  return deterministicIndex(`${seed}:round:${roundIndex}:tie`, 2) === 0;
}

function finalShiftWinningSequence(ticket: {
  seed: string;
  difficulty: AiDifficulty;
  playerSlots: Record<LineupSlot, string>;
  opponentSlots: Record<LineupSlot, string>;
}): string[] {
  const opponents = opponentSequence(ticket);
  const search = (roundIndex: number, used: Set<string>, chosen: string[], wins: number): string[] | null => {
    if (roundIndex === 5) return wins === 3 && chosen.length === 5 ? chosen : null;
    const situation = situations[roundIndex];
    for (const [slot, cardId] of Object.entries(ticket.playerSlots)) {
      if (!situation.slots.includes(slot as never) || used.has(cardId)) continue;
      const nextWins = wins + (playerWins(cardId, opponents[roundIndex], situation.attribute, ticket.seed, roundIndex) ? 1 : 0);
      if (roundIndex === 3 && nextWins !== 2) continue;
      const found = search(roundIndex + 1, new Set([...used, cardId]), [...chosen, cardId], nextWins);
      if (found) return found;
    }
    return null;
  };
  const sequence = search(0, new Set(), [], 0);
  if (!sequence) throw new Error("The deterministic V2 fixture cannot produce a 2-2 Final Shift followed by a win.");
  return sequence;
}

async function startV2(page: Page, state: SupabaseMockState) {
  await page.goto("/play");
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page).toHaveURL(/\/match$/);
  const ticket = [...state.matchTickets.values()][0];
  expect(ticket).toBeDefined();
  await page.goto(`/match?motion=${process.env.CAPTURE_MATCH_V2 === "1" ? "broadcast" : "fastBroadcast"}`);
  await expect(page.locator("[data-player-hand] button:not([disabled])").first()).toBeVisible();
  return ticket;
}

test.describe("Match Experience V2", () => {
  test("plays a server-authoritative five-round win through Final Shift on every responsive project", async ({ page }) => {
    test.slow();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    const state = await installSupabaseMock(page, { authenticated: true, matchSeed: "match-v2-final-shift" });
    const ticket = await startV2(page, state);
    const sequence = finalShiftWinningSequence(ticket);
    const opponents = opponentSequence(ticket);
    const capture = process.env.CAPTURE_MATCH_V2 === "1";
    const reviewDirectory = resolve("test-results/match-v2-review");
    const documentationDirectory = resolve("docs/ui-redesign/screenshots");
    const projectSlug = test.info().project.name;
    let capturedWin = false;
    let capturedLoss = false;
    if (capture) {
      mkdirSync(reviewDirectory, { recursive: true });
      mkdirSync(documentationDirectory, { recursive: true });
    }

    await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveCount(0);
    for (let round = 0; round < 5; round += 1) {
      if (round === 4) {
        await expect(page.getByRole("heading", { name: "Final Shift" })).toBeVisible();
        if (capture && test.info().project.name === "desktop") await page.screenshot({ path: resolve(reviewDirectory, "desktop-final-shift.png") });
      }
      await expect(page.getByText(`Round ${round + 1} of 5`)).toBeVisible();
      if (capture && round === 0) {
        await expect(page.locator("[data-presentation-state='awaitingSelection']")).toBeVisible();
        await page.waitForTimeout(700);
        await page.screenshot({ path: resolve(reviewDirectory, `${projectSlug}-selection.png`) });
        if (projectSlug === "desktop") {
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.screenshot({ path: resolve(documentationDirectory, "match-selection-1920x1080.png") });
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.screenshot({ path: resolve(documentationDirectory, "match-selection-1440x900.png") });
        }
        if (projectSlug === "tablet") await page.screenshot({ path: resolve(documentationDirectory, "match-selection-tablet.png") });
      }
      const card = page.locator(`button:has([data-card-image='${sequence[round]}'])`);
      await expect(card).toBeEnabled();
      await card.click();
      await expect(page.getByLabel("Rival card concealed")).toBeVisible();
      await expect(page.locator(`[data-card-image='${opponents[round]}']`)).toHaveCount(0);

      if (round === 0) {
        await page.reload();
        await expect(page.getByRole("button", { name: "Reveal cards" })).toBeEnabled();
        await expect(page.locator(`[data-card-image='${opponents[round]}']`)).toHaveCount(0);
        if (capture && projectSlug === "desktop") {
          await expect(page.locator("[data-presentation-state='awaitingAuthoritativeReveal']")).toBeVisible();
          await page.waitForTimeout(700);
          await page.screenshot({ path: resolve(documentationDirectory, "match-card-locked.png") });
        }
      }

      await page.getByRole("button", { name: "Reveal cards" }).click();
      const result = page.getByRole("region", { name: `Round ${round + 1} result` });
      await expect(result).toBeVisible();
      await expect(result.locator(`[data-card-image='${opponents[round]}']`)).toBeVisible();
      if (capture) {
        await expect(page.locator("[data-presentation-state='roundResult']")).toBeVisible();
        await page.waitForTimeout(700);
        if (round === 0) await page.screenshot({ path: resolve(reviewDirectory, `${projectSlug}-result.png`) });
        const won = playerWins(sequence[round], opponents[round], situations[round].attribute, ticket.seed, round);
        if (projectSlug === "desktop" && won && !capturedWin) {
          capturedWin = true;
          await page.screenshot({ path: resolve(documentationDirectory, "match-round-win.png") });
        }
        if (projectSlug === "desktop" && !won && !capturedLoss) {
          capturedLoss = true;
          await page.screenshot({ path: resolve(documentationDirectory, "match-round-loss.png") });
        }
      }
      await page.getByRole("button", { name: round === 4 ? "Final horn" : "Continue" }).click();
    }

    await expect(page.getByRole("heading", { name: "Rivalry secured" })).toBeVisible();
    await expect(page.getByRole("list", { name: "All round results" }).getByRole("listitem")).toHaveCount(5);
    await expect(page.getByText(/Match settled on the server/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Rematch setup" })).toBeEnabled();
    if (capture && projectSlug === "desktop") {
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(documentationDirectory, "match-complete.png") });
    }
    expect(state.completedMatches).toBe(1);
    expect(state.settleMatchCallCount).toBe(1);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Rivalry secured" })).toBeVisible();
    await expect(page.getByText(/already settled|Match settled on the server/)).toBeVisible();
    expect(state.completedMatches).toBe(1);
    expect(state.settleMatchCallCount).toBe(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.locator(".vite-error-overlay, #webpack-dev-server-client-overlay").count()).toBe(0);
    expect(browserErrors).toEqual([]);
  });

  test("retries a lost reveal response with one server receipt", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The responsive full-game test already covers the other viewports.");
    const state = await installSupabaseMock(page, { authenticated: true, roundResponseLossOnce: true, matchSeed: "match-v2-final-shift" });
    await startV2(page, state);
    await page.locator("[data-player-hand] button:not([disabled])").first().click();
    await page.getByRole("button", { name: "Reveal cards" }).click();
    await expect(page.getByRole("button", { name: "Retry reveal" })).toBeEnabled();
    await page.getByRole("button", { name: "Retry reveal" }).click();
    await expect(page.getByRole("region", { name: "Round 1 result" })).toBeVisible();
    const ticket = [...state.matchTickets.values()][0];
    expect(state.playRoundCallCount).toBe(2);
    expect(ticket.rounds.size).toBe(1);
    expect(ticket.roundRequests.size).toBe(1);
  });

  test("blocks final actions until a failed settlement retry succeeds", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Settlement retry is transport behavior and needs one browser project.");
    const state = await installSupabaseMock(page, { authenticated: true, settlementErrorOnce: true, matchSeed: "match-v2-final-shift" });
    const ticket = await startV2(page, state);
    const sequence = finalShiftWinningSequence(ticket);
    for (let round = 0; round < 5; round += 1) {
      await page.locator(`button:has([data-card-image='${sequence[round]}'])`).click();
      await page.getByRole("button", { name: "Reveal cards" }).click();
      await expect(page.getByRole("region", { name: `Round ${round + 1} result` })).toBeVisible();
      await page.getByRole("button", { name: round === 4 ? "Final horn" : "Continue" }).click();
    }
    await expect(page.getByText("Match settlement temporarily unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Rematch setup" })).toBeDisabled();
    await page.getByRole("button", { name: "Retry settlement" }).click();
    await expect(page.getByText(/Match settled on the server/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Rematch setup" })).toBeEnabled();
    expect(state.completedMatches).toBe(1);
    expect(state.settleMatchCallCount).toBe(2);
  });

  test("keeps the authoritative reveal usable with reduced motion", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Reduced-motion semantics need one browser project.");
    await page.emulateMedia({ reducedMotion: "reduce" });
    const state = await installSupabaseMock(page, { authenticated: true, matchSeed: "match-v2-final-shift" });
    await startV2(page, state);
    await expect(page.locator("[data-reduced-motion='true']")).toBeVisible();
    await page.locator("[data-player-hand] button:not([disabled])").first().click();
    await page.getByRole("button", { name: "Reveal cards" }).click();
    await expect(page.getByRole("region", { name: "Round 1 result" })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().every((animation) => {
      const duration = animation.effect?.getComputedTiming().duration;
      return typeof duration === "number" && duration <= 1;
    }))).toBe(true);
    expect(state.playRoundCallCount).toBe(1);
  });
});
