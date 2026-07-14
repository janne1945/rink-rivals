import { readFileSync } from "node:fs";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { gameCatalog } from "./gameCatalogFixture";
import { installSupabaseMock } from "./supabaseMock";

const testAcquiredAt = "2026-07-14T12:00:00.000Z";
const playerAssetManifest = JSON.parse(readFileSync(
  new URL("../../src/assets/generated/playerAssetManifest.json", import.meta.url),
  "utf8",
)) as {
  readonly fallback: { readonly path: string };
  readonly assets: ReadonlyArray<{
    readonly playerId: string;
    readonly variant: string;
    readonly path: string;
  }>;
};
const assetsByKey = new Map(
  playerAssetManifest.assets.map((asset) => [`${asset.playerId}:${asset.variant}`, asset] as const),
);
const cardsById = new Map(gameCatalog.cards.map((card) => [card.id, card]));
const playersById = new Map(gameCatalog.players.map((player) => [player.id, player]));
const edmontonTeamId = gameCatalog.teams.find((team) => team.name === "Edmonton Oilers")?.id;
const edmontonStarter = gameCatalog.starterSquads.find((starter) => starter.teamId === edmontonTeamId);

const starterCard = edmontonStarter?.cards
  .map((cardId) => cardsById.get(cardId))
  .find((card) => card && assetsByKey.has(`${card.playerId}:base`));
const starterBaseCard = starterCard
  ? gameCatalog.cards.find((card) => card.playerId === starterCard.playerId && card.cardType === "base")
  : undefined;
const starterPlayer = starterCard ? playersById.get(starterCard.playerId) : undefined;
const placeholderBaseCard = gameCatalog.cards.find((card) =>
  card.cardType === "base"
    && card.marketAvailability === "base-market"
    && !assetsByKey.has(`${card.playerId}:base`));
const placeholderPlayer = placeholderBaseCard ? playersById.get(placeholderBaseCard.playerId) : undefined;

const connorBaseCard = cardsById.get("nhl-connor-mcdavid-base");
const connorRewardCard = cardsById.get("nhl-connor-mcdavid-rivalry-2026");
const connorSignatureCard = cardsById.get("nhl-connor-mcdavid-signature-series");
const caleBaseCard = cardsById.get("nhl-cale-makar-base");
const caleSignatureCard = cardsById.get("nhl-cale-makar-signature-series");

if (
  !starterCard || !starterBaseCard || !starterPlayer || !placeholderBaseCard || !placeholderPlayer
  || !connorBaseCard || !connorRewardCard || !connorSignatureCard || !caleBaseCard || !caleSignatureCard
) {
  throw new Error("Asset E2E fixtures no longer match the generated catalog and manifest.");
}

type ImageNetworkIssue = {
  readonly kind: "http" | "request-failed";
  readonly url: string;
  readonly detail: string;
};

function cardImage(page: Page, cardId: string): Locator {
  return page.locator(`img[data-card-image="${cardId}"]`);
}

function trackImageNetworkIssues(page: Page): ImageNetworkIssue[] {
  const issues: ImageNetworkIssue[] = [];
  page.on("requestfailed", (request) => {
    if (request.resourceType() !== "image") return;
    issues.push({
      kind: "request-failed",
      url: request.url(),
      detail: request.failure()?.errorText ?? "unknown image request failure",
    });
  });
  page.on("response", (response) => {
    if (response.request().resourceType() !== "image" || response.status() < 400) return;
    issues.push({ kind: "http", url: response.url(), detail: String(response.status()) });
  });
  return issues;
}

async function expectLoadedImage(image: Locator): Promise<void> {
  await expect(image).toBeAttached();
  await image.scrollIntoViewIfNeeded();
  await expect.poll(
    () => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0 && node.naturalHeight > 0),
    { message: `Expected ${await image.getAttribute("data-card-image")} to load visible image pixels.` },
  ).toBe(true);
}

async function expectAllCardImagesLoaded(images: Locator): Promise<void> {
  await expect(images.first()).toBeAttached();
  const count = await images.count();
  for (let index = 0; index < count; index += 1) {
    await expectLoadedImage(images.nth(index));
  }
}

async function expectAssetState(
  image: Locator,
  expected: {
    readonly presentation: "headshot" | "full-card" | "placeholder";
    readonly requestedVariant: string;
    readonly resolvedVariant: string;
    readonly resolution: "direct" | "base-fallback" | "placeholder";
    readonly src: string;
  },
): Promise<void> {
  await expect(image).toHaveAttribute("data-asset-presentation", expected.presentation);
  await expect(image).toHaveAttribute("data-asset-requested-variant", expected.requestedVariant);
  await expect(image).toHaveAttribute("data-asset-resolved-variant", expected.resolvedVariant);
  await expect(image).toHaveAttribute("data-asset-resolution", expected.resolution);
  await expect(image).toHaveAttribute("src", expected.src);
  await expectLoadedImage(image);
}

test.describe("card asset integration", () => {
  test("Collection loads every displayed image and applies Signature, Starter, Reward, and neutral fallback rules", async ({ page }) => {
    const imageNetworkIssues = trackImageNetworkIssues(page);
    const state = await installSupabaseMock(page, { authenticated: true });
    [
      starterBaseCard.id,
      connorBaseCard.id,
      connorRewardCard.id,
      connorSignatureCard.id,
      placeholderBaseCard.id,
    ].forEach((cardId) => state.cards.set(cardId, { quantity: 1, acquiredAt: testAcquiredAt }));

    await page.goto("/collection");
    const collectionImages = page.getByLabel("Collection results").locator("img[data-card-image]");
    await expectAllCardImagesLoaded(collectionImages);

    const search = page.getByLabel("Search collection");
    await search.fill("Connor McDavid");
    const connorBaseImage = cardImage(page, connorBaseCard.id);
    const connorRewardImage = cardImage(page, connorRewardCard.id);
    const connorSignatureImage = cardImage(page, connorSignatureCard.id);
    const connorBaseAsset = assetsByKey.get(`${connorBaseCard.playerId}:base`)!;
    const connorSignatureAsset = assetsByKey.get(`${connorSignatureCard.playerId}:signature`)!;

    await expectAssetState(connorBaseImage, {
      presentation: "headshot",
      requestedVariant: "base",
      resolvedVariant: "base",
      resolution: "direct",
      src: connorBaseAsset.path,
    });
    await expectAssetState(connorRewardImage, {
      presentation: "headshot",
      requestedVariant: connorRewardCard.setId,
      resolvedVariant: "base",
      resolution: "base-fallback",
      src: connorBaseAsset.path,
    });
    await expectAssetState(connorSignatureImage, {
      presentation: "full-card",
      requestedVariant: "signature",
      resolvedVariant: "signature",
      resolution: "direct",
      src: connorSignatureAsset.path,
    });
    expect(await connorSignatureImage.getAttribute("src")).not.toBe(await connorBaseImage.getAttribute("src"));

    await search.fill(starterPlayer.name);
    const baseImage = cardImage(page, starterBaseCard.id);
    const starterImage = cardImage(page, starterCard.id);
    const starterBaseAsset = assetsByKey.get(`${starterCard.playerId}:base`)!;
    await expectAssetState(baseImage, {
      presentation: "headshot",
      requestedVariant: "base",
      resolvedVariant: "base",
      resolution: "direct",
      src: starterBaseAsset.path,
    });
    await expectAssetState(starterImage, {
      presentation: "headshot",
      requestedVariant: "starter",
      resolvedVariant: "base",
      resolution: "base-fallback",
      src: starterBaseAsset.path,
    });
    expect(await starterImage.getAttribute("src")).toBe(await baseImage.getAttribute("src"));

    await search.fill(placeholderPlayer.name);
    await expectAssetState(cardImage(page, placeholderBaseCard.id), {
      presentation: "placeholder",
      requestedVariant: "base",
      resolvedVariant: "placeholder",
      resolution: "placeholder",
      src: playerAssetManifest.fallback.path,
    });

    expect(imageNetworkIssues).toEqual([]);
  });

  test("Market loads Base and Signature offers through the same resolver without broken image requests", async ({ page }) => {
    const imageNetworkIssues = trackImageNetworkIssues(page);
    await installSupabaseMock(page, {
      authenticated: true,
      marketNow: "2026-01-12T12:00:00.000Z",
    });

    await page.goto("/market");
    const marketImages = page.getByLabel("Market offers").locator("img[data-card-image]");
    await expect(marketImages).toHaveCount(48);
    await expectAllCardImagesLoaded(marketImages);

    const search = page.getByLabel("Search market");
    await search.fill(placeholderPlayer.name);
    await expectAssetState(cardImage(page, placeholderBaseCard.id), {
      presentation: "placeholder",
      requestedVariant: "base",
      resolvedVariant: "placeholder",
      resolution: "placeholder",
      src: playerAssetManifest.fallback.path,
    });

    await page.getByRole("button", { name: "Event Shop", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signature Series" })).toBeVisible();
    await search.fill("Cale Makar");
    const signatureImage = cardImage(page, caleSignatureCard.id);
    const signatureAsset = assetsByKey.get(`${caleSignatureCard.playerId}:signature`)!;
    await expectAssetState(signatureImage, {
      presentation: "full-card",
      requestedVariant: "signature",
      resolvedVariant: "signature",
      resolution: "direct",
      src: signatureAsset.path,
    });
    const signatureSrc = await signatureImage.getAttribute("src");

    await page.getByRole("button", { name: "Base Market", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Base Market" })).toBeVisible();
    await search.fill("Cale Makar");
    const baseImage = cardImage(page, caleBaseCard.id);
    const baseAsset = assetsByKey.get(`${caleBaseCard.playerId}:base`)!;
    await expectAssetState(baseImage, {
      presentation: "headshot",
      requestedVariant: "base",
      resolvedVariant: "base",
      resolution: "direct",
      src: baseAsset.path,
    });
    expect(signatureSrc).not.toBe(await baseImage.getAttribute("src"));

    expect(imageNetworkIssues).toEqual([]);
  });

  test("Collection reserves a stable artwork box before the lazy headshot finishes loading", async ({ page }) => {
    await installSupabaseMock(page, { authenticated: true });
    await page.route("**/assets/players/**/base.webp", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    });

    await page.goto("/collection", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Search collection").fill(starterPlayer.name);
    const image = cardImage(page, starterCard.id);
    await expect(image).toBeAttached();
    const before = await image.locator("..").boundingBox();
    expect(before).not.toBeNull();
    expect(before!.width).toBeGreaterThan(0);
    expect(before!.height).toBeGreaterThan(0);

    await expectLoadedImage(image);
    const after = await image.locator("..").boundingBox();
    expect(after).not.toBeNull();
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
  });
});
