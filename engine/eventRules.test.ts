import { describe, expect, test } from "bun:test";

import { createEventDeck, discardEventCard, drawEventCard } from "./decks";
import { activateEventFromDeck, isEventActive, tickEventsForNewRound } from "./eventRules";
import { endTurn } from "./rushRules";
import { createBonusRaceMap, type EventCard, type GameState } from "./state";

const eventCard = (id: string, effectKey: string, durationRounds?: number): EventCard => ({
  id,
  name: effectKey,
  type: "event",
  effectKey,
  durationRounds,
});

const createState = (options?: Partial<GameState>): GameState => ({
  seed: 7,
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: [],
      rushHand: [],
      transitPerks: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [],
      rushHand: [],
      transitPerks: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
  ],
  currentPlayerIndex: 0,
  turn: 1,
  round: 1,
  currentBorough: "Manhattan",
  actionsRemaining: 2,
  busPlaysThisTurn: 0,
  busPlaysAllowedThisTurn: 1,
  rushTradeUsedThisTurn: false,
  busDeck: { drawPile: [], discardPile: [] },
  rushDeck: { drawPile: [], discardPile: [] },
  perkDeck: { drawPile: [], discardPile: [] },
  eventDeck: { drawPile: [], discardPile: [] },
  activeEvents: [],
  activeRestrictions: [],
  bonusRaces: createBonusRaceMap(["p1", "p2"]),
  taxiTrip: undefined,
  eventLog: [],
  ...options,
});

describe("event deck helpers", () => {
  test("draw reshuffles discard deterministically when draw pile is empty", () => {
    const catalog = [
      eventCard("e1", "service_surge", 2),
      eventCard("e2", "rush_hour", 2),
      eventCard("e3", "city_funding_boost"),
    ];

    const seededDeck = createEventDeck(catalog, 99);
    const drained = { drawPile: [], discardPile: seededDeck.drawPile };

    const first = drawEventCard(drained, 444);
    const second = drawEventCard(drained, 444);

    expect(first.reshuffled).toBe(true);
    expect(second.reshuffled).toBe(true);
    expect(first.card?.id).toBe(second.card?.id);
    expect(first.deck.drawPile.map((card) => card.id)).toEqual(second.deck.drawPile.map((card) => card.id));
  });

  test("discard helper appends cards to discard pile", () => {
    const card = eventCard("e-discard", "rush_hour", 2);
    const nextDeck = discardEventCard({ drawPile: [], discardPile: [] }, card);

    expect(nextDeck.discardPile.map((event) => event.id)).toEqual(["e-discard"]);
  });
});

describe("event activation and timing", () => {
  test("activateEventFromDeck activates timed events with rounds remaining", () => {
    const state = createState({
      eventDeck: { drawPile: [eventCard("e-timed", "service_surge", 2)], discardPile: [] },
    });

    const next = activateEventFromDeck(state);

    expect(next.activeEvents).toHaveLength(1);
    expect(next.activeEvents[0].roundsRemaining).toBe(2);
    expect(isEventActive(next, "service_surge")).toBe(true);
  });

  test("tickEventsForNewRound decrements and expires timed events", () => {
    const state = createState({
      activeEvents: [
        { card: eventCard("e-keep", "service_surge", 2), roundsRemaining: 2 },
        { card: eventCard("e-expire", "rush_hour", 1), roundsRemaining: 1 },
      ],
    });

    const next = tickEventsForNewRound(state);

    expect(next.activeEvents.map((event) => event.card.id)).toEqual(["e-keep"]);
    expect(next.activeEvents[0].roundsRemaining).toBe(1);
    expect(next.eventDeck.discardPile.map((event) => event.id)).toContain("e-expire");
    expect(next.eventLog.at(-1)).toBe("Event expired: rush_hour.");
  });

  test("endTurn round hook ticks active events and then reveals an event", () => {
    const state = createState({
      currentPlayerIndex: 1,
      round: 1,
      turn: 3,
      activeEvents: [{ card: eventCard("e-existing", "service_surge", 2), roundsRemaining: 1 }],
      eventDeck: { drawPile: [eventCard("e-new", "rush_hour", 2)], discardPile: [] },
    });

    const next = endTurn(state);

    expect(next.round).toBe(2);
    expect(next.activeEvents.map((event) => event.card.id)).toEqual(["e-new"]);
    expect(next.activeEvents[0].roundsRemaining).toBe(2);
    expect(next.eventDeck.discardPile.map((event) => event.id)).toContain("e-existing");
  });
});
