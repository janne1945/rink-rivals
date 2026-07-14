import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { gameCatalog } from "../../data/generated/gameCatalog";
import { resolveCardImage } from "../../domain/cards/assets";
import type { OwnedCard } from "../../domain/economy";
import type { AccountMarketState } from "../../infrastructure/supabase";
import styles from "../Screens.module.css";
import { MarketScreen } from "./MarketScreen";
import { persistMarketTab } from "./marketTabStorage";

function signatureEntry() {
  for (const card of gameCatalog.cards) {
    if (card.setId !== "signature-series") continue;
    const player = gameCatalog.players.find((candidate) => candidate.id === card.playerId);
    if (player && resolveCardImage(card, player).presentation === "full-card") {
      return { card, player };
    }
  }

  throw new Error("Catalog needs a Signature Series card with direct full-card artwork.");
}

describe("MarketScreen full-card offers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps spotlight, ownership, price, and action below unobstructed artwork", () => {
    const { card, player } = signatureEntry();
    const price = Math.max(1, card.price - 100);
    const collection: Record<string, OwnedCard> = {
      [card.id]: {
        cardId: card.id,
        quantity: 2,
        acquiredAt: "2026-07-01T00:00:00.000Z",
      },
    };
    const market = {
      serverTime: "2026-07-14T10:00:00.000Z",
      currentEvent: {
        id: "signature-series",
        name: "Signature Series",
        description: "Signature Series launch event.",
        startsAt: "2026-07-13T00:00:00.000Z",
        endsAt: "2026-07-21T00:00:00.000Z",
        visualMetadata: {},
      },
      offers: [{
        id: `event-shop:signature-series:${card.id}`,
        cardId: card.id,
        source: "event_shop",
        regularPrice: card.price,
        price,
        eventId: "signature-series",
        placement: "spotlight",
        startsAt: "2026-07-13T00:00:00.000Z",
        endsAt: "2026-07-21T00:00:00.000Z",
        ownedQuantity: 2,
      }],
    } satisfies AccountMarketState;

    persistMarketTab("event");
    render(
      <MarketScreen
        catalog={gameCatalog}
        collection={collection}
        credits={100_000}
        market={market}
        onBuy={vi.fn()}
      />,
    );

    const badge = screen.getByText("Spotlight");
    const offer = badge.closest("article");
    if (!offer) throw new Error("Missing rendered market offer.");

    const artwork = within(offer).getByRole("article", { name: new RegExp(player.name, "i") });
    expect(offer).toHaveClass(styles.shopCard, styles.shopCardSpotlight);
    expect(artwork).toHaveAttribute("data-card-presentation", "full-card");
    expect(artwork.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(offer).getAllByText("Owned ×2")).toHaveLength(1);
    expect(within(offer).getByText(`${card.price.toLocaleString("en-US")} CR`, { selector: "s" })).toBeInTheDocument();
    expect(within(offer).getByText(`${price.toLocaleString("en-US")} CR`, { selector: "strong" })).toBeInTheDocument();
    expect(within(offer).getByRole("button", { name: `Buy ${player.name} for ${price.toLocaleString("en-US")} Credits` })).toBeEnabled();
  });
});
