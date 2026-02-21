import { describe, expect, test } from "bun:test";

import { playBusCard } from "./busRules";
import { createBonusRaceMap, type BusCard, type EventCard, type GameState, type PerkCard } from "./state";

const busCard = (
  id: string,
  borough: BusCard["borough"],
  tags?: string[],
  routeValue = 1,
): BusCard => ({
  id,
  name: id,
  type: "bus",
  borough,
  routeValue,
  tags,
});


const perkCard = (id: string, effectKey: string): PerkCard => ({
  id,
  name: effectKey,
  type: "perk",
  effectKey,
  isPersistent: true,
});

const eventCard = (id: string, effectKey: string, durationRounds = 2): EventCard => ({
  id,
  name: effectKey,
  type: "event",
  effectKey,
  durationRounds,
});

const baseState = (hand: BusCard[]): GameState => ({
  seed: 1,
  currentPlayerIndex: 0,
  turn: 1,
  round: 1,
  currentBorough: "Queens",
  actionsRemaining: 2,
  busPlaysThisTurn: 0,
  busPlaysAllowedThisTurn: 1,
  rushTradeUsedThisTurn: false,
  busDeck: { drawPile: [], discardPile: [] },
  rushDeck: { drawPile: [], discardPile: [] },
  eventDeck: { drawPile: [], discardPile: [] },
  activeEvents: [],
  activeRestrictions: [],
  bonusRaces: createBonusRaceMap(["p1", "p2", "p3"]),
  eventLog: [],
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: hand,
      rushHand: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [],
      rushHand: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p3",
      name: "P3",
      busHand: [],
      rushHand: [],
      scoreByBorough: { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, StatenIsland: 0 },
      totalScore: 0,
      actionsRemaining: 2,
    },
  ],
});

describe("playBusCard borough validation and scoring", () => {
  test("allows legal borough match and scores +1", () => {
    const state = baseState([busCard("q1", "Queens")]);
    const next = playBusCard(state, { playerId: "p1", cardId: "q1" });

    expect(next.players[0].totalScore).toBe(1);
    expect(next.players[0].scoreByBorough.Queens).toBe(1);
    expect(next.currentBorough).toBe("Queens");
    expect(next.players[0].busHand).toHaveLength(0);
  });

  test("rejects illegal non-express borough move", () => {
    const state = baseState([busCard("b1", "Brooklyn")]);

    expect(() => playBusCard(state, { playerId: "p1", cardId: "b1" })).toThrow(
      "Illegal Bus play for current borough.",
    );
  });

  test("allows express movement between Manhattan and outer borough", () => {
    const state = {
      ...baseState([busCard("m1", "Manhattan", ["express"])]),
      currentBorough: "Queens" as const,
    };

    const next = playBusCard(state, { playerId: "p1", cardId: "m1" });
    expect(next.currentBorough).toBe("Manhattan");
    expect(next.players[0].scoreByBorough.Manhattan).toBe(1);
  });

  test("consumes exactly 1 action on a legal Bus play", () => {
    const state = baseState([busCard("q-action", "Queens")]);
    const next = playBusCard(state, { playerId: "p1", cardId: "q-action" });

    expect(next.players[0].actionsRemaining).toBe(1);
    expect(next.actionsRemaining).toBe(1);
    expect(next.busPlaysThisTurn).toBe(1);
  });

  test("rejects Bus play when active player has no actions remaining", () => {
    const state = {
      ...baseState([busCard("q-no-actions", "Queens")]),
      players: baseState([busCard("q-no-actions", "Queens")]).players.map((player, index) =>
        index === 0 ? { ...player, actionsRemaining: 0 } : player,
      ),
      actionsRemaining: 0,
    };

    expect(() => playBusCard(state, { playerId: "p1", cardId: "q-no-actions" })).toThrow(
      "No actions remaining for this turn.",
    );
  });

  test("rejects scoring when player already has max points in borough", () => {
    const state = {
      ...baseState([busCard("q-cap", "Queens")]),
      players: baseState([busCard("q-cap", "Queens")]).players.map((player, index) =>
        index === 0
          ? {
              ...player,
              scoreByBorough: {
                ...player.scoreByBorough,
                Queens: 3,
              },
              totalScore: 3,
            }
          : player,
      ),
    };

    expect(() => playBusCard(state, { playerId: "p1", cardId: "q-cap" })).toThrow(
      "Borough score cap reached for this player.",
    );
  });
});

describe("Limited/Select restrictions", () => {
  test("Limited applies to next player and blocks non-express bus on next play", () => {
    const state = baseState([busCard("limited", "Queens", ["limited"])]);
    const afterLimited = playBusCard(state, { playerId: "p1", cardId: "limited" });

    expect(afterLimited.activeRestrictions).toEqual([
      {
        targetPlayerId: "p2",
        source: "limited",
        effect: "block_non_express_bus",
        expiresAfterBusPlay: true,
      },
    ]);

    const p2Turn = {
      ...afterLimited,
      currentPlayerIndex: 1,
      busPlaysThisTurn: 0,
      players: afterLimited.players.map((player, index) =>
        index === 1 ? { ...player, busHand: [busCard("local", "Queens", undefined, 1)] } : player,
      ),
    };

    expect(() => playBusCard(p2Turn, { playerId: "p2", cardId: "local" })).toThrow(
      "Active restriction prevents this Bus play.",
    );
  });

  test("Select requires valid selected player and applies restriction", () => {
    const state = baseState([busCard("select", "Queens", ["select"])]);

    expect(() => playBusCard(state, { playerId: "p1", cardId: "select" })).toThrow(
      "Select card requires a valid selected player.",
    );

    const next = playBusCard(state, {
      playerId: "p1",
      cardId: "select",
      selectedPlayerId: "p3",
    });

    expect(next.activeRestrictions).toEqual([
      {
        targetPlayerId: "p3",
        source: "select",
        effect: "block_express_bus",
        expiresAfterBusPlay: true,
      },
    ]);
  });

  test("Select restriction blocks express card on affected player's next play", () => {
    const state = {
      ...baseState([busCard("select", "Queens", ["select"])]),
      currentBorough: "Queens" as const,
    };

    const next = playBusCard(state, {
      playerId: "p1",
      cardId: "select",
      selectedPlayerId: "p2",
    });

    const p2Turn = {
      ...next,
      currentPlayerIndex: 1,
      busPlaysThisTurn: 0,
      players: next.players.map((player, index) =>
        index === 1
          ? {
              ...player,
              busHand: [busCard("express", "Manhattan", ["express"])],
            }
          : player,
      ),
    };

    expect(() => playBusCard(p2Turn, { playerId: "p2", cardId: "express" })).toThrow(
      "Active restriction prevents this Bus play.",
    );
  });
});


describe("Transit perk objectives", () => {
  test("Express Rider objective grants +1 when active", () => {
    const state = {
      ...baseState([busCard("exp", "Manhattan", ["express"])]),
      currentBorough: "Queens" as const,
      players: baseState([busCard("exp", "Manhattan", ["express"])]).players.map((player, index) =>
        index === 0 ? { ...player, activePerk: perkCard("perk-e", "express_rider") } : player,
      ),
    };

    const next = playBusCard(state, { playerId: "p1", cardId: "exp" });
    expect(next.players[0].totalScore).toBe(2);
  });

  test("Queens Bus Redesign objective grants +1 when active", () => {
    const state = {
      ...baseState([busCard("q", "Queens")]),
      players: baseState([busCard("q", "Queens")]).players.map((player, index) =>
        index === 0 ? { ...player, activePerk: perkCard("perk-q", "queens_bus_redesign") } : player,
      ),
    };

    const next = playBusCard(state, { playerId: "p1", cardId: "q" });
    expect(next.players[0].totalScore).toBe(2);
  });

  test("Bridge Reconstruction disables perk effects while active", () => {
    const state = {
      ...baseState([busCard("exp-bridge", "Manhattan", ["express"])]),
      currentBorough: "Queens" as const,
      activeEvents: [{ card: eventCard("evt-1", "bridge_reconstruction", 2), roundsRemaining: 2 }],
      players: baseState([busCard("exp-bridge", "Manhattan", ["express"])]).players.map((player, index) =>
        index === 0 ? { ...player, activePerk: perkCard("perk-e", "express_rider") } : player,
      ),
    };

    const next = playBusCard(state, { playerId: "p1", cardId: "exp-bridge" });
    expect(next.players[0].totalScore).toBe(1);
    expect(next.eventLog.at(-1)).toContain("(+1 point)");
  });
});


describe("Bonus races", () => {
  test("awards Express Rider at 4 and grants +2 total score", () => {
    const state = {
      ...baseState([busCard("exp-4", "Manhattan", ["express"])]),
      currentBorough: "Queens" as const,
      players: baseState([busCard("exp-4", "Manhattan", ["express"])]).players.map((player, index) =>
        index === 0
          ? {
              ...player,
              totalScore: 3,
            }
          : player,
      ),
      bonusRaces: {
        ...createBonusRaceMap(["p1", "p2", "p3"]),
        express_rider: {
          ownerPlayerId: undefined,
          locked: false,
          perPlayerCounts: { p1: 3, p2: 1, p3: 0 },
        },
      },
    };

    const next = playBusCard(state, { playerId: "p1", cardId: "exp-4" });

    expect(next.bonusRaces.express_rider.ownerPlayerId).toBe("p1");
    expect(next.players[0].totalScore).toBe(6); // +1 bus +2 bonus
  });

  test("steals Queens Bus Redesign when challenger exceeds owner count", () => {
    const state = {
      ...baseState([busCard("q-steal", "Queens")]),
      currentPlayerIndex: 1,
      players: baseState([busCard("unused", "Queens")]).players.map((player, index) => {
        if (index === 0) {
          return { ...player, totalScore: 5 };
        }

        if (index === 1) {
          return { ...player, busHand: [busCard("q-steal", "Queens")], totalScore: 2 };
        }

        return player;
      }),
      bonusRaces: {
        ...createBonusRaceMap(["p1", "p2", "p3"]),
        queens_bus_redesign: {
          ownerPlayerId: "p1",
          locked: false,
          perPlayerCounts: { p1: 4, p2: 4, p3: 0 },
        },
      },
    };

    const next = playBusCard(state, { playerId: "p2", cardId: "q-steal" });

    expect(next.bonusRaces.queens_bus_redesign.ownerPlayerId).toBe("p2");
    expect(next.players[0].totalScore).toBe(3); // loses 2
    expect(next.players[1].totalScore).toBe(5); // +1 bus +2 bonus
  });

  test("locks Express Rider at 6 and prevents future steals", () => {
    const p2State = baseState([busCard("exp-lock", "Manhattan", ["express"])]);
    const state = {
      ...p2State,
      currentBorough: "Queens" as const,
      currentPlayerIndex: 1,
      players: p2State.players.map((player, index) => {
        if (index === 1) {
          return {
            ...player,
            busHand: [busCard("exp-lock", "Manhattan", ["express"])],
            totalScore: 2,
          };
        }

        return {
          ...player,
          totalScore: index === 0 ? 4 : player.totalScore,
        };
      }),
      bonusRaces: {
        ...createBonusRaceMap(["p1", "p2", "p3"]),
        express_rider: {
          ownerPlayerId: "p2",
          locked: false,
          perPlayerCounts: { p1: 5, p2: 5, p3: 0 },
        },
      },
    };

    const locked = playBusCard(state, { playerId: "p2", cardId: "exp-lock" });
    expect(locked.bonusRaces.express_rider.locked).toBe(true);
    expect(locked.bonusRaces.express_rider.ownerPlayerId).toBe("p2");

    const challengerTurn = {
      ...locked,
      currentPlayerIndex: 0,
      currentBorough: "Queens" as const,
      busPlaysThisTurn: 0,
      actionsRemaining: 2,
      players: locked.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              busHand: [busCard("exp-challenge", "Manhattan", ["express"])],
              actionsRemaining: 2,
            }
          : player,
      ),
    };

    const afterChallenge = playBusCard(challengerTurn, { playerId: "p1", cardId: "exp-challenge" });
    expect(afterChallenge.bonusRaces.express_rider.ownerPlayerId).toBe("p2");
  });
});
