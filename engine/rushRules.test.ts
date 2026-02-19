import { describe, expect, test } from "bun:test";

import { playBusCard } from "./busRules";
import { endTurn, playRushCard, tradeRush } from "./rushRules";
import { type BusCard, type GameState, type RushCard } from "./state";

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

const createState = (rushHand: RushCard[], busHand?: BusCard[], options?: Partial<GameState>): GameState => ({
  seed: 1,
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: busHand ?? [busCard("p1-b1", "Queens")],
      rushHand,
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [busCard("p2-b1", "Brooklyn")],
      rushHand: [],
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
  activeEvents: [],
  activeRestrictions: [],
  taxiTrip: undefined,
  expressRiderBonus: { isLocked: false },
  queensBusRedesignBonus: { isLocked: false },
  bonusCountsByPlayerId: {
    p1: { expressBusPlays: 0, rushCardsPlayed: 0 },
    p2: { expressBusPlays: 0, rushCardsPlayed: 0 },
  },
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
          scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
          totalScore: 0,
          actionsRemaining: 3,
        },
        {
          id: "p2",
          name: "P2",
          busHand: [busCard("p2-b1", "Brooklyn")],
          rushHand: [],
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


describe("Queens Bus Redesign bonus", () => {
  test("awards, steals, and locks per rush play count", () => {
    const state = createState([rushCard("r1", "bus_transfer")], undefined, {
      bonusCountsByPlayerId: {
        p1: { expressBusPlays: 0, rushCardsPlayed: 4 },
        p2: { expressBusPlays: 0, rushCardsPlayed: 4 },
      },
      queensBusRedesignBonus: { ownerPlayerId: "p2", isLocked: false },
    });

    const stolen = playRushCard(state, { playerId: "p1", cardId: "r1" });
    expect(stolen.queensBusRedesignBonus.ownerPlayerId).toBe("p1");

    const lockState = {
      ...stolen,
      currentPlayerIndex: 0,
      actionsRemaining: 2,
      players: stolen.players.map((player, index) =>
        index === 0
          ? { ...player, actionsRemaining: 2, rushHand: [rushCard("r2", "reroute")], busHand: [busCard("b1", "Queens")] }
          : index === 1
            ? { ...player, actionsRemaining: 2, rushHand: [rushCard("r3", "take_the_subway")] }
            : player,
      ),
      bonusCountsByPlayerId: {
        ...stolen.bonusCountsByPlayerId,
        p1: { ...stolen.bonusCountsByPlayerId.p1, rushCardsPlayed: 5 },
      },
    };

    const locked = playRushCard(lockState, {
      playerId: "p1",
      cardId: "r2",
      reroute: { busCardId: "b1", toBorough: "Bronx" },
    });
    expect(locked.queensBusRedesignBonus).toEqual({ ownerPlayerId: "p1", isLocked: true });

    const challenger = {
      ...locked,
      currentPlayerIndex: 1,
      actionsRemaining: 2,
      currentBorough: "Queens" as const,
      bonusCountsByPlayerId: {
        ...locked.bonusCountsByPlayerId,
        p2: { ...locked.bonusCountsByPlayerId.p2, rushCardsPlayed: 7 },
      },
    };

    const afterChallenge = playRushCard(challenger, {
      playerId: "p2",
      cardId: "r3",
      destinationBorough: "Brooklyn",
    });
    expect(afterChallenge.queensBusRedesignBonus.ownerPlayerId).toBe("p1");
  });
});
