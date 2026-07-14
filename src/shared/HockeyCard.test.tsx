import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { gameCatalog } from "../data/generated/gameCatalog";
import {
  playerAssetManifest,
  resolveCardImage,
} from "../domain/cards/assets";
import type { CardVersion, Player } from "../domain/cards/types";
import styles from "./HockeyCard.module.css";
import { HockeyCard } from "./HockeyCard";

function catalogEntry(cardId: string): { card: CardVersion; player: Player } {
  const card = gameCatalog.cards.find((candidate) => candidate.id === cardId);
  const player = card
    ? gameCatalog.players.find((candidate) => candidate.id === card.playerId)
    : undefined;

  if (!card || !player) {
    throw new Error(`Missing test catalog entry ${cardId}.`);
  }

  return { card, player };
}

function renderedImage(card: CardVersion): HTMLImageElement {
  const image = document.querySelector(`[data-card-image="${card.id}"]`);
  if (!(image instanceof HTMLImageElement)) {
    throw new Error(`Missing rendered image for ${card.id}.`);
  }
  return image;
}

describe("HockeyCard artwork", () => {
  it("renders resolved headshots lazily in a reserved decorative image layer", () => {
    const { card, player } = catalogEntry("nhl-connor-mcdavid-base");
    const resolved = resolveCardImage(card, player);
    render(<HockeyCard card={card} player={player} />);

    const article = screen.getByRole("article", { name: /Connor McDavid/i });
    const image = renderedImage(card);

    expect(article).toHaveAccessibleName(expect.stringContaining(player.name));
    expect(image).toHaveAttribute("src", resolved.src);
    expect(image).toHaveAttribute("width", String(resolved.width));
    expect(image).toHaveAttribute("height", String(resolved.height));
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("decoding", "async");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
    expect(image).toHaveAttribute("data-player-id", player.id);
    expect(image).toHaveAttribute("data-asset-presentation", "headshot");
    expect(image).toHaveAttribute("data-asset-resolution", "direct");
    expect(image).toHaveClass(styles.headshot);
    expect(image.parentElement).toHaveClass(styles.artwork, styles.headshot);
  });

  it("supports eager loading without changing the resolved asset", () => {
    const { card, player } = catalogEntry("nhl-connor-mcdavid-base");
    const resolved = resolveCardImage(card, player);
    render(<HockeyCard card={card} player={player} eager />);

    const image = renderedImage(card);
    expect(image).toHaveAttribute("src", resolved.src);
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).toHaveAttribute("fetchpriority", "high");
  });

  it("marks provided Signature Series art as full-card while keeping live metadata", () => {
    const { card, player } = catalogEntry("nhl-connor-mcdavid-signature-series");
    render(<HockeyCard card={card} player={player} />);

    const image = renderedImage(card);
    expect(image).toHaveAttribute("data-asset-presentation", "full-card");
    expect(image).toHaveAttribute("data-asset-resolved-variant", "signature");
    expect(image).toHaveClass(styles.fullCard);
    expect(screen.getByText(String(card.overall))).toBeInTheDocument();
    expect(screen.getByText(player.name)).toBeInTheDocument();
  });

  it("exposes the resolver's starter-to-base fallback for browser QA", () => {
    const starter = gameCatalog.cards.find((candidate) => candidate.cardType === "starter");
    const player = starter
      ? gameCatalog.players.find((candidate) => candidate.id === starter.playerId)
      : undefined;
    if (!starter || !player) {
      throw new Error("Catalog needs a starter card for this test.");
    }

    render(<HockeyCard card={starter} player={player} />);

    const image = renderedImage(starter);
    expect(image).toHaveAttribute("data-asset-requested-variant", "starter");
    expect(image).toHaveAttribute("data-asset-resolved-variant", "base");
    expect(image).toHaveAttribute("data-asset-resolution", "base-fallback");
    expect(image).toHaveAttribute("data-asset-presentation", "headshot");
  });

  it("imperatively switches a broken URL to the neutral fallback exactly once", () => {
    const { card, player } = catalogEntry("nhl-connor-mcdavid-base");
    const fallback = playerAssetManifest().fallback;
    render(<HockeyCard card={card} player={player} />);

    const image = renderedImage(card);
    const setAttribute = vi.spyOn(image, "setAttribute");
    fireEvent.error(image);

    expect(image).toHaveAttribute("src", fallback.path);
    expect(image).toHaveAttribute("width", String(fallback.width));
    expect(image).toHaveAttribute("height", String(fallback.height));
    expect(image).toHaveAttribute("data-asset-fallback-applied", "true");
    expect(image).toHaveAttribute("data-asset-presentation", "placeholder");
    expect(image).toHaveAttribute("data-asset-resolution", "placeholder");
    expect(image).toHaveClass(styles.placeholder);
    expect(image).not.toHaveClass(styles.headshot, styles.fullCard);
    expect(image.parentElement).toHaveClass(styles.placeholder);

    const mutationsAfterFallback = setAttribute.mock.calls.length;
    fireEvent.error(image);
    expect(setAttribute).toHaveBeenCalledTimes(mutationsAfterFallback);
    expect(image).toHaveAttribute("src", fallback.path);
    expect(image).not.toBeVisible();
  });

  it("does not retry when the resolver already returned the neutral placeholder", () => {
    const { card, player } = catalogEntry("nhl-connor-mcdavid-base");
    const invalidCard = { ...card, imageReference: "invalid-reference" };
    render(<HockeyCard card={invalidCard} player={player} />);

    const image = renderedImage(invalidCard);
    const setAttribute = vi.spyOn(image, "setAttribute");
    expect(image).toHaveAttribute("data-asset-fallback-applied", "true");
    expect(image).toHaveAttribute("data-asset-presentation", "placeholder");

    fireEvent.error(image);
    expect(setAttribute).not.toHaveBeenCalled();
    expect(image).not.toBeVisible();
  });

  it("resets imperative fallback mutations when a card slot renders another image", () => {
    const first = catalogEntry("nhl-connor-mcdavid-base");
    const next = catalogEntry("nhl-cale-makar-base");
    const { rerender } = render(<HockeyCard card={first.card} player={first.player} />);

    const failedImage = renderedImage(first.card);
    fireEvent.error(failedImage);
    fireEvent.error(failedImage);
    expect(failedImage).not.toBeVisible();
    expect(failedImage.parentElement).toHaveClass(styles.placeholder);

    rerender(<HockeyCard card={next.card} player={next.player} />);

    const nextImage = renderedImage(next.card);
    expect(nextImage).not.toBe(failedImage);
    expect(nextImage).toBeVisible();
    expect(nextImage).toHaveAttribute("data-asset-fallback-applied", "false");
    expect(nextImage).toHaveAttribute("data-asset-presentation", "headshot");
    expect(nextImage.parentElement).toHaveClass(styles.headshot);
    expect(nextImage.parentElement).not.toHaveClass(styles.placeholder);
  });
});
