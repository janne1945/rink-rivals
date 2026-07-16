import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

import { gameCatalog } from "./gameCatalogFixture";
import { createSupabaseMockState, installSupabaseMock } from "./supabaseMock";

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
const signatureAssetSources = JSON.parse(readFileSync(
  new URL("../../data/content/signature-asset-sources.json", import.meta.url),
  "utf8",
)) as {
  readonly sources: ReadonlyArray<{
    readonly playerId: string;
    readonly status: string;
    readonly cardVersionId: string;
    readonly canonicalPath: string;
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

if (
  !starterCard || !starterBaseCard || !starterPlayer || !placeholderBaseCard || !placeholderPlayer
  || !connorBaseCard || !connorRewardCard || !connorSignatureCard
) {
  throw new Error("Asset E2E fixtures no longer match the generated catalog and manifest.");
}

type ImageNetworkIssue = {
  readonly kind: "http" | "request-failed";
  readonly url: string;
  readonly detail: string;
};

type MarketStateRpcOffer = {
  readonly offer_id: string;
  readonly card_id: string;
  readonly source: "base_market" | "event_shop";
  readonly regular_price: number;
  readonly price: number;
  readonly event_id: string | null;
  readonly placement: "standard" | "spotlight";
  readonly owned_quantity: number;
};

type MarketStateRpcPayload = {
  readonly current_event: { readonly id: string } | null;
  readonly offers: readonly MarketStateRpcOffer[];
};

type OfferGeometry = {
  readonly cardId: string;
  readonly card: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly button: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
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
    {
      message: `Expected ${await image.getAttribute("data-card-image")} to load visible image pixels.`,
      timeout: 10_000,
    },
  ).toBe(true);
}

async function expectAllCardImagesLoaded(images: Locator): Promise<void> {
  await expect(images.first()).toBeAttached({ timeout: 20_000 });
  const count = await images.count();
  for (let index = 0; index < count; index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
  }
  await expect.poll(
    () => images.evaluateAll((nodes) => nodes.flatMap((node) => {
      const image = node as HTMLImageElement;
      return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
        ? []
        : [image.dataset.cardImage ?? "unknown-card"];
    })),
    { message: "Expected every rendered card image to load visible image pixels.", timeout: 20_000 },
  ).toEqual([]);
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

async function readOfferGeometry(offers: Locator): Promise<OfferGeometry[]> {
  return offers.evaluateAll((nodes) => nodes.map((node) => {
    const image = node.querySelector<HTMLImageElement>("img[data-card-image]");
    const card = image?.closest<HTMLElement>("article");
    const button = node.querySelector<HTMLElement>(":scope > button");
    if (!image?.dataset.cardImage || !card || !button) {
      throw new Error("Event offer is missing its card image, card shell, or purchase button.");
    }
    const cardRect = card.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      cardId: image.dataset.cardImage,
      card: {
        x: cardRect.left + window.scrollX,
        y: cardRect.top + window.scrollY,
        width: cardRect.width,
        height: cardRect.height,
      },
      button: {
        x: buttonRect.left + window.scrollX,
        y: buttonRect.top + window.scrollY,
        width: buttonRect.width,
        height: buttonRect.height,
      },
    };
  }));
}

async function expectNoFullCardOverlays(image: Locator): Promise<void> {
  const artwork = image.locator("..");
  const card = artwork.locator("..");
  const visibleDirectOverlays = await card.locator(":scope > :not([data-asset-presentation])").evaluateAll(
    (nodes) => nodes.filter((node) => {
      const element = node as HTMLElement;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0
        && rect.width > 2
        && rect.height > 2;
    }).length,
  );
  expect(visibleDirectOverlays, "Full-card art must not receive generic OVR, identity, or status overlays.").toBe(0);

  for (const surface of [artwork, card]) {
    const visiblePseudoElements = await surface.evaluate((node) => (["::before", "::after"] as const).filter((pseudo) => {
      const style = getComputedStyle(node, pseudo);
      return style.content !== "none"
        && style.content !== "normal"
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) > 0;
    }));
    expect(visiblePseudoElements, "Full-card art must not be covered by generated masks, frames, or shine overlays.").toEqual([]);
  }
}

function rectanglesOverlap(
  left: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  right: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): boolean {
  return Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x) > 0.5
    && Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y) > 0.5;
}

test.describe("card asset integration", () => {
  test("Collection loads every displayed image and applies Signature, Starter, Reward, and neutral fallback rules", async ({ page }) => {
    test.slow();
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

  test("a failed Signature request becomes a labeled neutral card instead of an anonymous full-card shell", async ({ page }) => {
    const signatureAsset = assetsByKey.get(`${connorSignatureCard.playerId}:signature`);
    const player = playersById.get(connorSignatureCard.playerId);
    if (!signatureAsset || !player) {
      throw new Error("Signature fallback E2E requires Connor McDavid artwork and identity fixtures.");
    }

    await page.route(`**${signatureAsset.path}`, (route) => route.abort("failed"));
    const state = await installSupabaseMock(page, { authenticated: true });
    state.cards.set(connorSignatureCard.id, { quantity: 1, acquiredAt: testAcquiredAt });

    await page.goto("/collection");
    await page.getByLabel("Search collection").fill(player.name);
    const image = cardImage(page, connorSignatureCard.id);
    const card = image.locator("../..");

    await expectAssetState(image, {
      presentation: "placeholder",
      requestedVariant: "signature",
      resolvedVariant: "placeholder",
      resolution: "placeholder",
      src: playerAssetManifest.fallback.path,
    });
    await expect(image).toHaveAttribute("data-asset-fallback-applied", "true");
    await expect(card).toHaveAttribute("data-card-presentation", "placeholder");
    await expect(card.getByText(player.name, { exact: true })).toBeVisible();
    await expect(card).toContainText(`${connorSignatureCard.overall}OVR`);
    await expect(card.getByText("Owned ×1", { exact: true })).toBeVisible();
    await expect(card.getByText("Event Shop", { exact: true })).toBeVisible();
  });

  test("Market loads Base and Signature offers through the same resolver without broken image requests", async ({ page }) => {
    test.slow();
    const imageNetworkIssues = trackImageNetworkIssues(page);
    await installSupabaseMock(page, {
      authenticated: true,
      marketNow: "2026-07-14T12:00:00.000Z",
    });

    await page.goto("/market");
    const marketImages = page.getByLabel("Market offers").locator("img[data-card-image]");
    await expect(marketImages).toHaveCount(6, { timeout: 20_000 });
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

    await page.getByRole("button", { name: "Event Rotation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signature Series" })).toBeVisible();
    await search.fill("");
    const currentSignatureCardIds = await page.getByLabel("Market offers").locator("img[data-card-image]").evaluateAll(
      (images) => images.map((image) => (image as HTMLImageElement).dataset.cardImage).filter(Boolean) as string[],
    );
    const resolverFixture = currentSignatureCardIds.flatMap((cardId) => {
      const signatureCard = cardsById.get(cardId);
      if (!signatureCard) return [];
      const baseCard = gameCatalog.cards.find((card) => card.playerId === signatureCard.playerId && card.cardType === "base");
      const player = playersById.get(signatureCard.playerId);
      const signatureAsset = assetsByKey.get(`${signatureCard.playerId}:signature`);
      const baseAsset = assetsByKey.get(`${signatureCard.playerId}:base`);
      return baseCard && player && signatureAsset && baseAsset
        ? [{ signatureCard, baseCard, player, signatureAsset, baseAsset }]
        : [];
    })[0];
    expect(resolverFixture, "Current Signature offers need one player with both direct Signature and Base art.").toBeDefined();
    await search.fill(resolverFixture!.player.name);
    const signatureImage = cardImage(page, resolverFixture!.signatureCard.id);
    await expectAssetState(signatureImage, {
      presentation: "full-card",
      requestedVariant: "signature",
      resolvedVariant: "signature",
      resolution: "direct",
      src: resolverFixture!.signatureAsset.path,
    });
    const signatureSrc = await signatureImage.getAttribute("src");

    await page.getByRole("button", { name: "Base Market", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Base Market" })).toBeVisible();
    await search.fill(resolverFixture!.player.name);
    const baseImage = cardImage(page, resolverFixture!.baseCard.id);
    await expectAssetState(baseImage, {
      presentation: "headshot",
      requestedVariant: "base",
      resolvedVariant: "base",
      resolution: "direct",
      src: resolverFixture!.baseAsset.path,
    });
    expect(signatureSrc).not.toBe(await baseImage.getAttribute("src"));

    expect(imageNetworkIssues).toEqual([]);
  });

  test("Signature Event Shop renders its six approved offers as stable, unobstructed full-card art", async ({ page }, testInfo) => {
    test.slow();
    const marketNow = "2026-07-14T12:00:00.000Z";
    const imageNetworkIssues = trackImageNetworkIssues(page);
    const state = createSupabaseMockState(true);
    state.credits = 1_000_000;
    gameCatalog.cards
      .filter((card) => card.setId === "signature-series")
      .forEach((card) => state.cards.set(card.id, { quantity: 2, acquiredAt: testAcquiredAt }));

    let releaseSignatureImages!: () => void;
    const signatureImageGate = new Promise<void>((resolve) => {
      releaseSignatureImages = resolve;
    });
    await page.route("**/signature.webp", async (route) => {
      await signatureImageGate;
      await route.continue();
    });
    await installSupabaseMock(page, { authenticated: true, marketNow, state });

    const marketStateResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
        && response.url().includes("/rest/v1/rpc/get_market_state"));
    await page.goto("/market", { waitUntil: "domcontentloaded" });
    const marketState = await (await marketStateResponse).json() as MarketStateRpcPayload;
    expect(marketState.current_event?.id).toBe("signature-series");
    const eventOffers = marketState.offers.filter((offer) => offer.source === "event_shop");
    expect(eventOffers).toHaveLength(6);
    expect(new Set(eventOffers.map((offer) => offer.offer_id)).size).toBe(6);
    expect(new Set(eventOffers.map((offer) => offer.card_id)).size).toBe(6);
    expect(eventOffers.filter((offer) => offer.placement === "spotlight")).toHaveLength(1);

    const approvedSignatureAssets = playerAssetManifest.assets.filter((asset) => asset.variant === "signature");
    const approvedSignatureAssetsByPlayer = new Map(approvedSignatureAssets.map((asset) => [asset.playerId, asset] as const));
    const approvedSignatureSources = signatureAssetSources.sources.filter((source) => source.status === "integrated");
    const approvedSignatureSourcesByPlayer = new Map(approvedSignatureSources.map((source) => [source.playerId, source] as const));
    expect(approvedSignatureAssetsByPlayer.size).toBe(approvedSignatureAssets.length);
    expect(approvedSignatureSourcesByPlayer.size).toBe(approvedSignatureSources.length);
    expect([...approvedSignatureAssetsByPlayer.keys()].sort()).toEqual([...approvedSignatureSourcesByPlayer.keys()].sort());
    const expectedPlayers = eventOffers.map((offer) => {
      const card = cardsById.get(offer.card_id);
      expect(card, `Current Event Shop references unknown card ${offer.card_id}.`).toBeDefined();
      expect(card?.setId).toBe("signature-series");
      expect(card?.cardType).toBe("event");
      const approvedSource = approvedSignatureSourcesByPlayer.get(card!.playerId);
      expect(approvedSource, `${card!.id} has no approved Signature source artwork.`).toBeDefined();
      expect(approvedSource?.cardVersionId).toBe(card!.id);
      expect(approvedSignatureAssetsByPlayer.has(card!.playerId), `${card!.id} has no approved Signature artwork.`).toBe(true);
      expect(approvedSignatureAssetsByPlayer.get(card!.playerId)?.path).toBe(approvedSource?.canonicalPath);
      return card!.playerId;
    });
    expect(new Set(expectedPlayers).size).toBe(6);

    await page.getByRole("button", { name: "Event Rotation", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Signature Series" })).toBeVisible();
    const marketOffers = page.getByLabel("Market offers").locator(":scope > article");
    const signatureImages = marketOffers.locator("img[data-card-image]");
    await expect(marketOffers).toHaveCount(6);
    await expect(signatureImages).toHaveCount(6);
    expect(await signatureImages.evaluateAll((images) => images.map((image) => (image as HTMLImageElement).dataset.cardImage)))
      .toEqual(eventOffers.map((offer) => offer.card_id));
    expect(await signatureImages.evaluateAll((images) => images.map((image) => (image as HTMLImageElement).dataset.playerId)))
      .toEqual(expectedPlayers);

    const beforeLoad = await readOfferGeometry(marketOffers);
    releaseSignatureImages();
    await expectAllCardImagesLoaded(signatureImages);
    const afterLoad = await readOfferGeometry(marketOffers);
    expect(afterLoad.map(({ cardId }) => cardId)).toEqual(beforeLoad.map(({ cardId }) => cardId));
    afterLoad.forEach((after, index) => {
      const before = beforeLoad[index]!;
      expect(after.card.x).toBeCloseTo(before.card.x, 0);
      expect(after.card.y).toBeCloseTo(before.card.y, 0);
      expect(after.card.width).toBeCloseTo(before.card.width, 0);
      expect(after.card.height).toBeCloseTo(before.card.height, 0);
      expect(after.button.x).toBeCloseTo(before.button.x, 0);
      expect(after.button.y).toBeCloseTo(before.button.y, 0);
      expect(after.button.width).toBeCloseTo(before.button.width, 0);
      expect(after.button.height).toBeCloseTo(before.button.height, 0);
    });

    const widths = afterLoad.map(({ card }) => card.width);
    const heights = afterLoad.map(({ card }) => card.height);
    const buttonHeights = afterLoad.map(({ button }) => button.height);
    const buttonOffsets = afterLoad.map(({ card, button }) => button.y - (card.y + card.height));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1.5);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1.5);
    expect(Math.max(...buttonHeights) - Math.min(...buttonHeights)).toBeLessThanOrEqual(1);
    expect(Math.max(...buttonOffsets) - Math.min(...buttonOffsets)).toBeLessThanOrEqual(1.5);
    afterLoad.forEach(({ card }) => expect(card.width / card.height).toBeCloseTo(5 / 7, 1));
    const viewportWidth = page.viewportSize()?.width ?? 0;
    const expectedColumns = viewportWidth > 1_000 ? 6 : viewportWidth > 720 ? 4 : viewportWidth > 430 ? 3 : 2;
    const firstRowY = Math.min(...afterLoad.map(({ card }) => card.y));
    expect(afterLoad.filter(({ card }) => Math.abs(card.y - firstRowY) <= 1.5)).toHaveLength(expectedColumns);

    for (const offer of eventOffers) {
      const card = cardsById.get(offer.card_id)!;
      const player = playersById.get(card.playerId)!;
      const approvedAsset = approvedSignatureAssetsByPlayer.get(player.id)!;
      const image = marketOffers.locator(`img[data-card-image="${card.id}"]`);
      await expectAssetState(image, {
        presentation: "full-card",
        requestedVariant: "signature",
        resolvedVariant: "signature",
        resolution: "direct",
        src: approvedAsset.path,
      });
      await expect(image).toHaveAttribute("data-player-id", player.id);
      await expect(image).toHaveAttribute("data-asset-fallback-applied", "false");
      await expect(image.locator("../..")).toHaveAttribute("data-card-presentation", "full-card");
      expect(await image.getAttribute("src")).not.toContain("/base.webp");
      expect(await image.evaluate((node) => getComputedStyle(node).objectFit)).toBe("contain");
      await expectNoFullCardOverlays(image);

      const outerOffer = marketOffers.filter({ has: page.locator(`img[data-card-image="${card.id}"]`) });
      await expect(outerOffer).toHaveCount(1);
      const visibleOwnershipLabels = await outerOffer.getByText("✓ Owned ×2", { exact: true }).evaluateAll(
        (nodes) => nodes.filter((node) => {
          const rect = (node as HTMLElement).getBoundingClientRect();
          const style = getComputedStyle(node);
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        }).length,
      );
      expect(visibleOwnershipLabels).toBe(1);
      const purchase = outerOffer.getByRole("button", {
        name: `Add ${player.name} to Collection for ${offer.price.toLocaleString("en-US")} RP`,
      });
      await expect(purchase).toBeEnabled();
      await expect(purchase).toHaveText("Add Another");
      if (offer.placement === "spotlight") {
        expect(offer.price).toBeLessThan(offer.regular_price);
        await expect(outerOffer.locator("s")).toHaveText(`${offer.regular_price.toLocaleString("en-US")} RP`);
      } else {
        expect(offer.price).toBe(offer.regular_price);
        await expect(outerOffer.locator("s")).toHaveCount(0);
      }

      const layout = await outerOffer.evaluate((node) => {
        const imageNode = node.querySelector<HTMLImageElement>("img[data-card-image]")!;
        const cardNode = imageNode.closest<HTMLElement>("article")!;
        const ownershipNode = [...node.querySelectorAll<HTMLElement>("span")].find((candidate) =>
          candidate.textContent?.trim() === "✓ Owned ×2" && getComputedStyle(candidate).display !== "none")!;
        const buttonNode = node.querySelector<HTMLElement>(":scope > button")!;
        const cardRect = cardNode.getBoundingClientRect();
        const ownershipRect = ownershipNode.getBoundingClientRect();
        const buttonRect = buttonNode.getBoundingClientRect();
        return {
          cardBottom: cardRect.bottom,
          ownershipTop: ownershipRect.top,
          ownershipBottom: ownershipRect.bottom,
          buttonTop: buttonRect.top,
          horizontalOverflow: node.scrollWidth - node.clientWidth,
          cardHorizontalOverflow: cardNode.scrollWidth - cardNode.clientWidth,
          cardVerticalOverflow: cardNode.scrollHeight - cardNode.clientHeight,
        };
      });
      expect(layout.ownershipTop).toBeGreaterThanOrEqual(layout.cardBottom - 0.5);
      expect(layout.buttonTop).toBeGreaterThanOrEqual(layout.ownershipBottom - 0.5);
      expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(layout.cardHorizontalOverflow).toBeLessThanOrEqual(1);
      expect(layout.cardVerticalOverflow).toBeLessThanOrEqual(1);
    }

    const spotlightBadge = page.getByText("Featured Release", { exact: true });
    await expect(spotlightBadge).toHaveCount(1);
    const spotlightOffer = marketOffers.filter({ has: spotlightBadge });
    const spotlightImage = spotlightOffer.locator("img[data-card-image]");
    const [badgeBox, spotlightCardBox] = await Promise.all([
      spotlightBadge.boundingBox(),
      spotlightImage.locator("../..").boundingBox(),
    ]);
    expect(badgeBox).not.toBeNull();
    expect(spotlightCardBox).not.toBeNull();
    expect(rectanglesOverlap(badgeBox!, spotlightCardBox!)).toBe(false);

    const viewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(viewportOverflow).toBeLessThanOrEqual(1);
    expect(imageNetworkIssues).toEqual([]);
    const screenshot = await page.screenshot({ fullPage: true });
    await testInfo.attach("signature-event-shop", {
      body: screenshot,
      contentType: "image/png",
    });
    const screenshotDirectory = process.env.SIGNATURE_QA_SCREENSHOT_DIR;
    if (screenshotDirectory) {
      mkdirSync(screenshotDirectory, { recursive: true });
      writeFileSync(join(screenshotDirectory, `${testInfo.project.name}.png`), screenshot);
    }
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
