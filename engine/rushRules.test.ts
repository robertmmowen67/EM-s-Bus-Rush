import { describe, expect, test } from "bun:test";

import { playBusCard } from "./busRules";
import { isPerkSuppressed, purchaseTransitPerk, switchTransitPerk } from "./perkRules";
import { endTurn, playRushCard, tradeRush } from "./rushRules";
import { createBonusRaceMap, type BusCard, type EventCard, type GameState, type PerkCard, type RushCard } from "./state";

const busCard = (id: string, borough: BusCard["borough"], value = 1, tags?: string[]): BusCard => ({
  id,
  name: id,
  type: "bus",
  borough,
  routeValue: value,
  tags,
});

const rushCard = (id: string, effectKey: string): RushCard => ({
  id,
  name: effectKey,
  type: "rush",
  effectKey,
});



const perkCard = (id: string, effectKey: string): PerkCard => ({
  id,
  name: effectKey,
  type: "perk",
  effectKey,
  isPersistent: true,
});

const eventCard = (
  id: string,
  effectKey: string,
  durationRounds?: number,
): EventCard => ({
  id,
  name: effectKey,
  type: "event",
  effectKey,
  durationRounds,
});

const createState = (rushHand: RushCard[], busHand?: BusCard[], options?: Partial<GameState>): GameState => ({
  seed: 1,
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: busHand ?? [busCard("p1-b1", "Queens")],
      rushHand,
      transitPerks: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [busCard("p2-b1", "Brooklyn")],
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
  currentBorough: "Queens",
  actionsRemaining: 2,
  busPlaysThisTurn: 0,
  busPlaysAllowedThisTurn: 1,
  rushTradeUsedThisTurn: false,
  busDeck: { drawPile: [busCard("draw-b1", "Bronx"), busCard("draw-b2", "Brooklyn")], discardPile: [] },
  rushDeck: { drawPile: [rushCard("draw-r1", "take_the_subway")], discardPile: [] },
  perkDeck: { drawPile: [], discardPile: [] },
  eventDeck: { drawPile: [], discardPile: [] },
  activeEvents: [],
  activeRestrictions: [],
  bonusRaces: createBonusRaceMap(["p1", "p2"]),
  taxiTrip: undefined,
  eventLog: [],
  ...options,
});

describe("Rush trading", () => {
  test("trade Bus value 3 for 1 Rush once per turn", () => {
    const state = createState([], [busCard("b1", "Queens", 1), busCard("b2", "Queens", 2)]);

    const next = tradeRush(state, {
      playerId: "p1",
      busCardIdsForRush: ["b1", "b2"],
    });

    expect(next.players[0].busHand).toHaveLength(0);
    expect(next.players[0].rushHand.map((card) => card.id)).toContain("draw-r1");
    expect(next.rushTradeUsedThisTurn).toBe(true);
  });

  test("trade 1 Rush for 2 Bus cards", () => {
    const state = createState([rushCard("r-trade", "take_the_subway")]);
    const next = tradeRush(state, { playerId: "p1", rushCardIdForBus: "r-trade" });

    expect(next.players[0].rushHand).toHaveLength(0);
    expect(next.players[0].busHand.map((card) => card.id)).toEqual(["p1-b1", "draw-b1", "draw-b2"]);
  });
});

describe("Rush card effects and action costs", () => {
  test("Reroute modifies owned Bus card borough", () => {
    const state = createState([rushCard("r1", "reroute")], [busCard("owned", "Queens", 1)]);

    const next = playRushCard(state, {
      playerId: "p1",
      cardId: "r1",
      reroute: { busCardId: "owned", toBorough: "Bronx" },
    });

    expect(next.players[0].busHand.find((card) => card.id === "owned")?.borough).toBe("Bronx");
    expect(next.actionsRemaining).toBe(1);
  });

  test("Bus Transfer allows two Bus plays in one turn", () => {
    const state = createState(
      [rushCard("r2", "bus_transfer")],
      [busCard("q1", "Queens"), busCard("q2", "Queens")],
      { actionsRemaining: 3, players: [
        {
          id: "p1",
          name: "P1",
          busHand: [busCard("q1", "Queens"), busCard("q2", "Queens")],
          rushHand: [rushCard("r2", "bus_transfer")],
          transitPerks: [],
          scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
          totalScore: 0,
          actionsRemaining: 3,
        },
        {
          id: "p2",
          name: "P2",
          busHand: [busCard("p2-b1", "Brooklyn")],
          rushHand: [],
          transitPerks: [],
          scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
          totalScore: 0,
          actionsRemaining: 2,
        },
      ] },
    );

    const afterTransfer = playRushCard(state, { playerId: "p1", cardId: "r2" });
    expect(afterTransfer.busPlaysAllowedThisTurn).toBe(2);
    expect(afterTransfer.actionsRemaining).toBe(2);

    const afterFirstBus = playBusCard(afterTransfer, { playerId: "p1", cardId: "q1" });
    const afterSecondBus = playBusCard(afterFirstBus, { playerId: "p1", cardId: "q2" });

    expect(afterSecondBus.busPlaysThisTurn).toBe(2);
  });

  test("Take the Subway consumes both actions", () => {
    const state = createState([rushCard("r3", "take_the_subway")]);
    const next = playRushCard(state, {
      playerId: "p1",
      cardId: "r3",
      destinationBorough: "Brooklyn",
    });

    expect(next.actionsRemaining).toBe(0);
  });

  test("Interborough Express is 1 action and only Bronx/Brooklyn/Queens", () => {
    const state = createState([rushCard("r4", "interborough_express")], undefined, {
      currentBorough: "Queens",
    });

    const legal = playRushCard(state, {
      playerId: "p1",
      cardId: "r4",
      destinationBorough: "Bronx",
    });
    expect(legal.actionsRemaining).toBe(1);
    expect(legal.currentBorough).toBe("Bronx");

    expect(() =>
      playRushCard(state, {
        playerId: "p1",
        cardId: "r4",
        destinationBorough: "Manhattan",
      }),
    ).toThrow("Illegal Rush movement for selected card.");
  });

  test("Commuter Rail is Manhattan <-> outer borough except Staten Island", () => {
    const state = createState([rushCard("r5", "commuter_rail")], undefined, {
      currentBorough: "Manhattan",
    });

    const legal = playRushCard(state, {
      playerId: "p1",
      cardId: "r5",
      destinationBorough: "Queens",
    });
    expect(legal.currentBorough).toBe("Queens");

    expect(() =>
      playRushCard(state, {
        playerId: "p1",
        cardId: "r5",
        destinationBorough: "StatenIsland",
      }),
    ).toThrow("Illegal Rush movement for selected card.");
  });
});

describe("Taxi return behavior", () => {
  test("Taxi consumes both actions and returns after 3 rounds", () => {
    const state = createState([rushCard("tx", "taxi")], undefined, {
      round: 1,
      currentBorough: "Queens",
    });

    const afterTaxi = playRushCard(state, {
      playerId: "p1",
      cardId: "tx",
      destinationBorough: "Manhattan",
    });

    expect(afterTaxi.actionsRemaining).toBe(0);
    expect(afterTaxi.taxiTrip?.returnAfterRound).toBe(4);

    const t1 = endTurn(afterTaxi); // round 1 p2
    const t2 = endTurn(t1); // round 2 p1
    const t3 = endTurn(t2); // round 2 p2
    const t4 = endTurn(t3); // round 3 p1
    const t5 = endTurn(t4); // round 3 p2
    const t6 = endTurn(t5); // round 4 p1, expires

    expect(t6.round).toBe(4);
    expect(t6.taxiTrip).toBeUndefined();
  });

  test("Taxi returns earlier when group reaches taxi borough", () => {
    const state = createState([rushCard("tx2", "taxi")], undefined, { currentBorough: "Queens" });
    const afterTaxi = playRushCard(state, {
      playerId: "p1",
      cardId: "tx2",
      destinationBorough: "Manhattan",
    });

    const groupArrived = {
      ...afterTaxi,
      currentBorough: "Manhattan",
    };

    const ended = endTurn(groupArrived);
    expect(ended.taxiTrip).toBeUndefined();
  });
});

describe("Event deck system", () => {

  test("does not reveal an event on non-trigger rounds", () => {
    const state = createState([], undefined, {
      round: 1,
      currentPlayerIndex: 0,
      eventDeck: {
        drawPile: [eventCard("e0", "service_surge", 2)],
        discardPile: [],
      },
    });

    const next = endTurn(state);

    expect(next.round).toBe(1);
    expect(next.activeEvents).toHaveLength(0);
    expect(next.eventDeck.drawPile.map((card) => card.id)).toEqual(["e0"]);
  });

  test("reveals one event every 2 rounds", () => {
    const state = createState([], undefined, {
      round: 1,
      currentPlayerIndex: 1,
      eventDeck: {
        drawPile: [eventCard("e1", "service_surge", 2)],
        discardPile: [],
      },
    });

    const next = endTurn(state);

    expect(next.round).toBe(2);
    expect(next.activeEvents).toHaveLength(1);
    expect(next.activeEvents[0].roundsRemaining).toBe(2);
    expect(next.eventLog).toContain("Event revealed: service_surge.");
  });

  test("2-round modifier expires after two round advances", () => {
    const state = createState([], undefined, {
      round: 2,
      activeEvents: [{ card: eventCard("e2", "rush_hour", 2), roundsRemaining: 2 }],
      eventDeck: {
        drawPile: [eventCard("e-one-time", "city_funding_boost")],
        discardPile: [],
      },
    });

    const afterFirstRound = endTurn({ ...state, currentPlayerIndex: 1 });
    expect(afterFirstRound.round).toBe(3);
    expect(afterFirstRound.activeEvents[0].roundsRemaining).toBe(1);

    const afterSecondRound = endTurn({ ...afterFirstRound, currentPlayerIndex: 1 });
    expect(afterSecondRound.round).toBe(4);
    expect(afterSecondRound.activeEvents).toHaveLength(0);
  });

  test("applies 2-round modifiers on turn start while active", () => {
    const state = createState([], undefined, {
      round: 1,
      currentPlayerIndex: 1,
      eventDeck: {
        drawPile: [eventCard("e4", "service_surge", 2), eventCard("e5", "rush_hour", 2)],
        discardPile: [],
      },
    });

    const afterServiceSurgeReveal = endTurn(state);
    expect(afterServiceSurgeReveal.round).toBe(2);
    expect(afterServiceSurgeReveal.busPlaysAllowedThisTurn).toBe(2);

    const afterNextRoundStart = endTurn({ ...afterServiceSurgeReveal, currentPlayerIndex: 1 });
    expect(afterNextRoundStart.round).toBe(3);
    expect(afterNextRoundStart.busPlaysAllowedThisTurn).toBe(2);

    const afterRushHourReveal = endTurn({ ...afterNextRoundStart, currentPlayerIndex: 1 });
    expect(afterRushHourReveal.round).toBe(4);
    expect(afterRushHourReveal.actionsRemaining).toBe(1);
    expect(afterRushHourReveal.players[0].actionsRemaining).toBe(1);
  });


  test("expired 2-round events are discarded", () => {
    const state = createState([], undefined, {
      round: 2,
      currentPlayerIndex: 1,
      activeEvents: [{ card: eventCard("e-expire", "rush_hour", 1), roundsRemaining: 1 }],
      eventDeck: {
        drawPile: [],
        discardPile: [],
      },
    });

    const next = endTurn(state);

    expect(next.round).toBe(3);
    expect(next.activeEvents).toHaveLength(0);
    expect(next.eventDeck.discardPile.map((card) => card.id)).toContain("e-expire");
    expect(next.eventLog).toContain("Event expired: rush_hour.");
  });

  test("one-time event resolves immediately and is discarded", () => {
    const state = createState([], undefined, {
      round: 1,
      currentPlayerIndex: 1,
      actionsRemaining: 2,
      players: createState([], undefined).players.map((player, index) =>
        index === 0 ? { ...player, actionsRemaining: 2 } : player,
      ),
      eventDeck: {
        drawPile: [eventCard("e3", "city_funding_boost")],
        discardPile: [],
      },
    });

    const next = endTurn(state);

    expect(next.actionsRemaining).toBe(3);
    expect(next.players[0].actionsRemaining).toBe(3);
    expect(next.activeEvents).toHaveLength(0);
    expect(next.eventDeck.discardPile.map((card) => card.id)).toContain("e3");
  });
});


describe("Transit perks", () => {
  test("purchase draws perk and sets active perk", () => {
    const state = createState([], undefined, {
      perkDeck: { drawPile: [perkCard("pk1", "rush_trade_discount")], discardPile: [] },
    });

    const next = purchaseTransitPerk(state, { playerId: "p1" });

    expect(next.players[0].transitPerks.map((card) => card.id)).toEqual(["pk1"]);
    expect(next.players[0].activePerk?.id).toBe("pk1");
    expect(next.actionsRemaining).toBe(1);
  });

  test("switching changes active perk to owned perk", () => {
    const state = createState([], undefined, {
      players: [
        {
          ...createState([], undefined).players[0],
          transitPerks: [perkCard("pk1", "rush_trade_discount"), perkCard("pk2", "alt")],
          activePerk: perkCard("pk1", "rush_trade_discount"),
        },
        createState([], undefined).players[1],
      ],
    });

    const next = switchTransitPerk(state, { playerId: "p1", perkCardId: "pk2" });
    expect(next.players[0].activePerk?.id).toBe("pk2");
  });

  test("Bridge Reconstruction suppresses rush trade discount perk", () => {
    const discountedState = createState([], [busCard("b1", "Queens", 2)], {
      players: [
        {
          ...createState([], [busCard("b1", "Queens", 2)]).players[0],
          busHand: [busCard("b1", "Queens", 2)],
          activePerk: perkCard("pk1", "rush_trade_discount"),
          transitPerks: [perkCard("pk1", "rush_trade_discount")],
        },
        createState([], [busCard("b1", "Queens", 2)]).players[1],
      ],
    });

    const discountedTrade = tradeRush(discountedState, {
      playerId: "p1",
      busCardIdsForRush: ["b1"],
    });
    expect(discountedTrade.players[0].rushHand.map((card) => card.id)).toContain("draw-r1");

    const suppressed = {
      ...discountedState,
      activeEvents: [{ card: eventCard("e-bridge", "bridge_reconstruction", 2), roundsRemaining: 2 }],
    };

    expect(isPerkSuppressed(suppressed)).toBe(true);
    expect(() =>
      tradeRush(suppressed, {
        playerId: "p1",
        busCardIdsForRush: ["b1"],
      }),
    ).toThrow("Bus-to-Rush trade requires Bus cards totaling exactly 3 value.");
  });
});
