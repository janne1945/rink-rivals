import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

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

function baseEntry() {
  const card = gameCatalog.cards.find((candidate) => candidate.cardType === "base" && candidate.marketAvailability === "base-market");
  const player = card ? gameCatalog.players.find((candidate) => candidate.id === card.playerId) : undefined;
  if (!card || !player) throw new Error("Catalog needs a permanent Base Market card.");
  return { card, player };
}

describe("MarketScreen full-card offers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      <MemoryRouter><MarketScreen
        catalog={gameCatalog}
        collection={collection}
        credits={100_000}
        market={market}
        onBuy={vi.fn()}
      /></MemoryRouter>,
    );

    const badge = screen.getByText("Featured Release");
    const offer = badge.closest("article");
    if (!offer) throw new Error("Missing rendered market offer.");

    const artwork = within(offer).getByRole("article", { name: new RegExp(player.name, "i") });
    expect(offer).toHaveClass(styles.shopCard, styles.shopCardSpotlight);
    expect(artwork).toHaveAttribute("data-card-presentation", "full-card");
    expect(artwork.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(offer).getAllByText("Collection owned ×2")).toHaveLength(1);
    expect(within(offer).getByText(`${card.price.toLocaleString("en-US")} RP`, { selector: "s" })).toBeInTheDocument();
    expect(within(offer).getByText(`${price.toLocaleString("en-US")} RP`, { selector: "strong" })).toBeInTheDocument();
    expect(within(offer).getByRole("button", { name: `Add ${player.name} to Collection for ${price.toLocaleString("en-US")} RP` })).toHaveTextContent("Add to Collection");
    expect(screen.getByRole("heading", { name: "Player Market" })).toBeVisible();
    expect(screen.getByText(/server verified/i)).toBeVisible();
  });

  it("confirms an acquisition before calling the server and reports instant delivery in RP", async () => {
    const { card, player } = signatureEntry();
    const offer = {
      id: `event-shop:signature-series:${card.id}`,
      cardId: card.id,
      source: "event_shop",
      regularPrice: card.price,
      price: card.price,
      eventId: "signature-series",
      placement: "standard",
      startsAt: "2026-07-13T00:00:00.000Z",
      endsAt: "2026-07-21T00:00:00.000Z",
      ownedQuantity: 0,
    } as const;
    const onBuy = vi.fn().mockResolvedValue({
      status: "purchased",
      requestId: "request-1",
      offerId: offer.id,
      cardId: card.id,
      price: card.price,
      credits: 9_500,
      quantity: 1,
      purchasedAt: "2026-07-14T10:00:00.000Z",
    });
    persistMarketTab("event");
    render(
      <MemoryRouter><MarketScreen
        catalog={gameCatalog}
        collection={{}}
        credits={100_000}
        market={{
          serverTime: "2026-07-14T10:00:00.000Z",
          currentEvent: { id: "signature-series", name: "Signature Series", description: "Event", startsAt: offer.startsAt, endsAt: offer.endsAt, visualMetadata: {} },
          offers: [offer],
        }}
        onBuy={onBuy}
      /></MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: `Add ${player.name} to Collection for ${card.price.toLocaleString("en-US")} RP` }));
    const dialog = screen.getByRole("dialog", { name: "Confirm Acquisition" });
    expect(within(dialog).getByText((_, element) => element?.id === "acquisition-description" && element.textContent === `Acquire ${player.name} for ${card.price.toLocaleString("en-US")} RP?`)).toBeVisible();
    expect(onBuy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Acquire Player" }));

    await waitFor(() => expect(onBuy).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Player Acquired" })).toBeVisible();
    expect(screen.getByText(/9,500 RP remaining/i)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Player Acquired" })).toHaveFocus();
  });

  it("uses each rotation's own description and keeps its Base-tab countdown live", () => {
    const { card } = baseEntry();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    render(
      <MemoryRouter><MarketScreen
        catalog={gameCatalog}
        collection={{}}
        credits={100_000}
        market={{
          serverTime: "2026-07-14T10:00:00.000Z",
          currentEvent: {
            id: "captains-clash",
            name: "Captains Clash",
            description: "Leaders from both leagues headline this week's rotation.",
            startsAt: "2026-07-13T00:00:00.000Z",
            endsAt: "2026-07-21T00:00:00.000Z",
            visualMetadata: {},
          },
          offers: [{
            id: `base-market:${card.id}`,
            cardId: card.id,
            source: "base_market",
            regularPrice: card.price,
            price: card.price,
            eventId: null,
            placement: "standard",
            startsAt: null,
            endsAt: null,
            ownedQuantity: 0,
          }],
        }}
        onBuy={vi.fn()}
      /></MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Captains Clash" })).toBeVisible();
    expect(screen.getByText("Leaders from both leagues headline this week's rotation.")).toBeVisible();
    expect(screen.queryByText(/Signature Series celebrates/i)).not.toBeInTheDocument();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1_000);
  });

  it("keeps a missing rotation distinct from Base Market search results", () => {
    const { card, player } = baseEntry();
    render(
      <MemoryRouter><MarketScreen
        catalog={gameCatalog}
        collection={{}}
        credits={100_000}
        market={{
          serverTime: "2026-07-14T10:00:00.000Z",
          currentEvent: null,
          offers: [{
            id: `base-market:${card.id}`,
            cardId: card.id,
            source: "base_market",
            regularPrice: card.price,
            price: card.price,
            eventId: null,
            placement: "standard",
            startsAt: null,
            endsAt: null,
            ownedQuantity: 0,
          }],
        }}
        onBuy={vi.fn()}
      /></MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "No Active Rotation" })).toBeVisible();
    expect(screen.getByRole("article", { name: new RegExp(player.name, "i") })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "No Releases Found" })).not.toBeInTheDocument();
  });
});
