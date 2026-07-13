import { z } from "zod";

import type { CardCatalog } from "../domain/cards/types";

export const leagueSchema = z.enum(["NHL", "PWHL"]);
export const lineupSlotSchema = z.enum(["LW", "C", "RW", "LD", "RD", "G"]);
export const handednessSchema = z.enum(["left", "right"]);

const stableIdSchema = z
  .string()
  .min(3)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a stable lowercase kebab-case ID");

const commonPlayerSchema = z.object({
  id: stableIdSchema,
  name: z.string().trim().min(2),
  league: leagueSchema,
  team: z.string().trim().min(2),
  nationality: z.string().trim().length(3),
  archetype: z.string().trim().min(2),
  primaryPosition: lineupSlotSchema,
  eligiblePositions: z.array(lineupSlotSchema).min(1),
  handedness: handednessSchema,
  imageReference: z.string().startsWith("placeholder:"),
});

export const skaterPlayerSchema = commonPlayerSchema.extend({
  role: z.literal("skater"),
  primaryPosition: z.enum(["LW", "C", "RW", "LD", "RD"]),
  eligiblePositions: z.array(z.enum(["LW", "C", "RW", "LD", "RD"])).min(1),
});

export const goaliePlayerSchema = commonPlayerSchema.extend({
  role: z.literal("goalie"),
  primaryPosition: z.literal("G"),
  eligiblePositions: z.tuple([z.literal("G")]),
});

export const playerSchema = z.discriminatedUnion("role", [
  skaterPlayerSchema,
  goaliePlayerSchema,
]);

const ratingSchema = z.number().int().min(40).max(99);

export const skaterAttributesSchema = z.object({
  speed: ratingSchema,
  shooting: ratingSchema,
  passing: ratingSchema,
  puckControl: ratingSchema,
  defense: ratingSchema,
  physicality: ratingSchema,
  hockeyIq: ratingSchema,
  clutch: ratingSchema,
});

export const goalieAttributesSchema = z.object({
  reflexes: ratingSchema,
  positioning: ratingSchema,
  glove: ratingSchema,
  blocker: ratingSchema,
  reboundControl: ratingSchema,
  puckHandling: ratingSchema,
  consistency: ratingSchema,
  clutch: ratingSchema,
});

const commonCardSchema = z.object({
  id: stableIdSchema,
  playerId: stableIdSchema,
  setId: stableIdSchema,
  cardType: z.enum(["base", "featured", "elite", "signature"]),
  overall: ratingSchema,
  abilities: z.array(z.string().trim().min(2)).max(3),
  price: z.number().int().positive(),
  availableFrom: z.string().datetime().optional(),
  availableTo: z.string().datetime().optional(),
  isPermanent: z.boolean(),
});

export const skaterCardSchema = commonCardSchema.extend({
  role: z.literal("skater"),
  attributes: skaterAttributesSchema,
});

export const goalieCardSchema = commonCardSchema.extend({
  role: z.literal("goalie"),
  attributes: goalieAttributesSchema,
});

export const cardVersionSchema = z.discriminatedUnion("role", [
  skaterCardSchema,
  goalieCardSchema,
]);

export const catalogMetadataSchema = z.object({
  catalogId: stableIdSchema,
  generatedAt: z.string().datetime(),
  sourceWindow: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(3),
  disclaimer: z.string().min(20),
  requiresManualApproval: z.literal(true),
});

export const catalogSchema = z
  .object({
    metadata: catalogMetadataSchema,
    players: z.array(playerSchema),
    cards: z.array(cardVersionSchema),
  })
  .superRefine((catalog, context) => {
    const playerIds = new Set<string>();
    const cardIds = new Set<string>();

    for (const [index, player] of catalog.players.entries()) {
      if (playerIds.has(player.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate player ID: ${player.id}`,
          path: ["players", index, "id"],
        });
      }
      playerIds.add(player.id);

      if (!player.eligiblePositions.includes(player.primaryPosition as never)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "primaryPosition must be present in eligiblePositions",
          path: ["players", index, "eligiblePositions"],
        });
      }
    }

    for (const [index, card] of catalog.cards.entries()) {
      if (cardIds.has(card.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate card ID: ${card.id}`,
          path: ["cards", index, "id"],
        });
      }
      cardIds.add(card.id);

      const player = catalog.players.find((candidate) => candidate.id === card.playerId);
      if (!player) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown player reference: ${card.playerId}`,
          path: ["cards", index, "playerId"],
        });
        continue;
      }

      if (player.role !== card.role) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Card role ${card.role} does not match player role ${player.role}`,
          path: ["cards", index, "role"],
        });
      }

      if (card.isPermanent && (card.availableFrom !== undefined || card.availableTo !== undefined)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Permanent cards cannot have an availability window",
          path: ["cards", index],
        });
      }

      if (!card.isPermanent && (!card.availableFrom || !card.availableTo)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Rotating cards require availableFrom and availableTo",
          path: ["cards", index],
        });
      }

      if (
        card.availableFrom &&
        card.availableTo &&
        Date.parse(card.availableFrom) >= Date.parse(card.availableTo)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "availableFrom must be earlier than availableTo",
          path: ["cards", index, "availableTo"],
        });
      }
    }
  });

export type League = z.infer<typeof leagueSchema>;
export type LineupSlot = z.infer<typeof lineupSlotSchema>;
export type Player = z.infer<typeof playerSchema>;
export type CardVersion = z.infer<typeof cardVersionSchema>;
export type Catalog = z.infer<typeof catalogSchema>;

export function parseCatalog(input: unknown): Catalog & { players: CardCatalog["players"]; cards: CardCatalog["cards"] } {
  return catalogSchema.parse(input);
}
