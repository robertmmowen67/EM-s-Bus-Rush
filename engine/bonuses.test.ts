import { describe, expect, test } from "bun:test";

import { checkWin, recalculateTotalScores } from "./bonuses";
import { type GameState } from "./state";

const baseState = (): GameState => ({
  seed: 1,
  players: [
    {
      id: "p1",
      name: "P1",
      busHand: [],
      rushHand: [],
      scoreByBorough: { Manhattan: 3, Brooklyn: 3, Queens: 3, Bronx: 3, StatenIsland: 1 },
      totalScore: 0,
      actionsRemaining: 2,
    },
    {
      id: "p2",
      name: "P2",
      busHand: [],
      rushHand: [],
      scoreByBorough: { Manhattan: 1, Brooklyn: 1, Queens: 1, Bronx: 1, StatenIsland: 1 },
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
  eventDeck: { drawPile: [], discardPile: [] },
  activeEvents: [],
  activeRestrictions: [],
  taxiTrip: undefined,
  expressRiderBonus: { ownerPlayerId: "p1", isLocked: true },
  queensBusRedesignBonus: { ownerPlayerId: "p1", isLocked: true },
  bonusCountsByPlayerId: {
    p1: { expressBusPlays: 6, rushCardsPlayed: 6 },
    p2: { expressBusPlays: 0, rushCardsPlayed: 0 },
  },
  eventLog: [],
});

describe("bonus scoring and win checks", () => {
  test("recalculateTotalScores includes bonus ownership points", () => {
    const next = recalculateTotalScores(baseState());

    expect(next.players[0].totalScore).toBe(17);
    expect(next.players[1].totalScore).toBe(5);
  });

  test("checkWin uses bonus-inclusive totalScore and borough minimums", () => {
    const scored = recalculateTotalScores(baseState());
    expect(checkWin(scored).winnerIds).toEqual(["p1"]);

    const ineligible = recalculateTotalScores({
      ...baseState(),
      players: baseState().players.map((player, index) =>
        index === 0
          ? {
              ...player,
              scoreByBorough: { ...player.scoreByBorough, StatenIsland: 0 },
            }
          : player,
      ),
    });

    expect(checkWin(ineligible).winnerIds).toEqual([]);
  });
});
