import { describe, expect, test } from "bun:test";

import { playBusCard } from "./busRules";
import { applyEventAtRoundBoundary, isGlobalModifierActive } from "./eventRules";
import { tradeRush } from "./rushRules";
import { type BusCard, type EventCard, type GameState, type RushCard } from "./state";

const bus = (id: string, borough: BusCard["borough"], value = 1, tags?: string[]): BusCard => ({
  id,
  name: id,
  type: "bus",
  borough,
  routeValue: value,
  tags,
});

const rush = (id: string): RushCard => ({ id, name: id, type: "rush", effectKey: id });

const event = (id: string, key: string): EventCard => ({ id, name: id, type: "event", effectKey: key });

const base = (events: EventCard[]): GameState => ({
  seed: 1,
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: [bus("l1", "Queens", 1, ["limited"]), bus("e1", "Manhattan", 2, ["express"])],
      rushHand: [rush("r1")],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [bus("b1", "Queens", 1), bus("b2", "Queens", 2)],
      rushHand: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
  ],
  currentPlayerIndex: 0,
  turn: 1,
  round: 2,
  currentBorough: "Queens",
  actionsRemaining: 2,
  busPlaysThisTurn: 0,
  busPlaysAllowedThisTurn: 1,
  rushTradeUsedThisTurn: false,
  busDeck: { drawPile: [bus("d1", "Bronx"), bus("d2", "Brooklyn")], discardPile: [] },
  rushDeck: { drawPile: [rush("dr1")], discardPile: [] },
  eventDeck: { drawPile: events, discardPile: [] },
  activeEvents: [],
  activeRestrictions: [],
  activeGlobalModifiers: [],
  taxiTrip: undefined,
  eventLog: [],
});

describe("event timing", () => {
  test("triggers event every 2 rounds", () => {
    const evenRound = applyEventAtRoundBoundary(base([event("ev1", "weekend_service")]));
    expect(evenRound.eventLog.join(" ")).toContain("Event revealed");

    const oddStart = { ...base([event("ev1", "weekend_service")]), round: 3 };
    const oddRound = applyEventAtRoundBoundary(oddStart);
    expect(oddRound.eventLog).toHaveLength(0);
  });

  test("global modifiers last exactly 2 rounds", () => {
    const withModifier = applyEventAtRoundBoundary(base([event("ev1", "weekend_service")]));
    expect(isGlobalModifierActive(withModifier, "weekend_service")).toBe(true);

    const round3 = applyEventAtRoundBoundary({ ...withModifier, round: 3 });
    expect(isGlobalModifierActive(round3, "weekend_service")).toBe(true);

    const round4 = applyEventAtRoundBoundary({ ...round3, round: 4, eventDeck: { drawPile: [], discardPile: [] } });
    expect(isGlobalModifierActive(round4, "weekend_service")).toBe(false);
  });
});

describe("modifier enforcement", () => {
  test("Weekend Service blocks Limited/Select; Late Night blocks Express", () => {
    const weekendState = {
      ...base([]),
      activeGlobalModifiers: [{ key: "weekend_service", expiresAfterRound: 3 }],
    };
    expect(() => playBusCard(weekendState, { playerId: "p1", cardId: "l1" })).toThrow(
      "Limited/Select Bus plays are blocked by Weekend Service.",
    );

    const lateNightState = {
      ...base([]),
      currentBorough: "Queens" as const,
      activeGlobalModifiers: [{ key: "late_night_service", expiresAfterRound: 3 }],
    };
    expect(() => playBusCard(lateNightState, { playerId: "p1", cardId: "e1" })).toThrow(
      "Express Bus plays are blocked by Late Night Service.",
    );
  });

  test("Fare Hike raises Bus-to-Rush trade cost to 4", () => {
    const state = {
      ...base([]),
      currentPlayerIndex: 1,
      activeGlobalModifiers: [{ key: "fare_hike", expiresAfterRound: 3 }],
    };

    expect(() =>
      tradeRush(state, {
        playerId: "p2",
        busCardIdsForRush: ["b1", "b2"],
      }),
    ).toThrow("Bus-to-Rush trade requires Bus cards totaling exactly 4 value.");
  });
});
