import { drawCards, initializeDecks, type DeckCatalog } from "./decks";
import { recalculateTotalScores } from "./bonuses";
import {
  createEmptyBonusCounts,
  createEmptyScore,
  type CreateGameInput,
  type GameState,
  type PlayerState,
} from "./state";

const DEFAULT_ACTIONS_PER_TURN = 2;

export const createGame = (
  input: CreateGameInput,
  catalog: DeckCatalog,
): GameState => {
  if (input.players.length < 2 || input.players.length > 4) {
    throw new Error("NYC Bus Rush requires 2 to 4 players.");
  }

  const seed = input.seed ?? Date.now();
  let { busDeck, rushDeck, eventDeck } = initializeDecks(catalog, seed);

  const players: PlayerState[] = input.players.map((player, index) => {
    const busDraw = drawCards(busDeck, 5, seed + 100 + index);
    busDeck = busDraw.deck;

    const rushDraw = drawCards(rushDeck, 2, seed + 200 + index);
    rushDeck = rushDraw.deck;

    return {
      id: player.id,
      name: player.name,
      busHand: busDraw.cards,
      rushHand: rushDraw.cards,
      scoreByBorough: createEmptyScore(),
      totalScore: 0,
      actionsRemaining: DEFAULT_ACTIONS_PER_TURN,
    };
  });

  const bonusCountsByPlayerId = Object.fromEntries(
    players.map((player) => [player.id, createEmptyBonusCounts()]),
  );

  return recalculateTotalScores({
    seed,
    players,
    currentPlayerIndex: 0,
    turn: 1,
    round: 1,
    currentBorough: "Manhattan",
    actionsRemaining: DEFAULT_ACTIONS_PER_TURN,
    busPlaysThisTurn: 0,
    busPlaysAllowedThisTurn: 1,
    rushTradeUsedThisTurn: false,
    busDeck,
    rushDeck,
    eventDeck,
    activeEvents: [],
    activeRestrictions: [],
    taxiTrip: undefined,
    expressRiderBonus: { isLocked: false },
    queensBusRedesignBonus: { isLocked: false },
    bonusCountsByPlayerId,
    eventLog: ["Game created."],
  });
};
