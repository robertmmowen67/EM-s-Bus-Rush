import { BOROUGHS, type BonusTracker, type GameState, type PlayerState } from "./state";

const BONUS_AWARD_THRESHOLD = 4;
const BONUS_LOCK_THRESHOLD = 6;
const BONUS_POINTS = 2;
const WINNING_SCORE = 14;

export interface WinStatus {
  winnerIds: string[];
}

const sumBoroughScore = (player: PlayerState): number =>
  BOROUGHS.reduce((total, borough) => total + player.scoreByBorough[borough], 0);

const bonusPointsForPlayer = (state: GameState, playerId: string): number => {
  let points = 0;

  if (state.expressRiderBonus.ownerPlayerId === playerId) {
    points += BONUS_POINTS;
  }

  if (state.queensBusRedesignBonus.ownerPlayerId === playerId) {
    points += BONUS_POINTS;
  }

  return points;
};

export const recalculateTotalScores = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((player) => ({
    ...player,
    totalScore: sumBoroughScore(player) + bonusPointsForPlayer(state, player.id),
  })),
});

const getCount = (state: GameState, playerId: string, key: "expressBusPlays" | "rushCardsPlayed"): number =>
  state.bonusCountsByPlayerId[playerId]?.[key] ?? 0;

const resolveBonusOwner = (
  tracker: BonusTracker,
  countsByPlayerId: GameState["bonusCountsByPlayerId"],
  currentPlayerId: string,
  key: "expressBusPlays" | "rushCardsPlayed",
): BonusTracker => {
  const currentCount = countsByPlayerId[currentPlayerId]?.[key] ?? 0;

  if (!tracker.ownerPlayerId) {
    if (currentCount >= BONUS_AWARD_THRESHOLD) {
      return { ownerPlayerId: currentPlayerId, isLocked: currentCount >= BONUS_LOCK_THRESHOLD };
    }

    return tracker;
  }

  const ownerCount = countsByPlayerId[tracker.ownerPlayerId]?.[key] ?? 0;

  if (!tracker.isLocked && currentPlayerId !== tracker.ownerPlayerId && currentCount > ownerCount) {
    return { ownerPlayerId: currentPlayerId, isLocked: currentCount >= BONUS_LOCK_THRESHOLD };
  }

  if (tracker.ownerPlayerId === currentPlayerId && currentCount >= BONUS_LOCK_THRESHOLD) {
    return { ...tracker, isLocked: true };
  }

  return tracker;
};

const incrementCount = (
  state: GameState,
  playerId: string,
  key: "expressBusPlays" | "rushCardsPlayed",
): GameState["bonusCountsByPlayerId"] => ({
  ...state.bonusCountsByPlayerId,
  [playerId]: {
    expressBusPlays: state.bonusCountsByPlayerId[playerId]?.expressBusPlays ?? 0,
    rushCardsPlayed: state.bonusCountsByPlayerId[playerId]?.rushCardsPlayed ?? 0,
    [key]: getCount(state, playerId, key) + 1,
  },
});

export const registerExpressBusPlay = (state: GameState, playerId: string): GameState => {
  const bonusCountsByPlayerId = incrementCount(state, playerId, "expressBusPlays");
  const expressRiderBonus = resolveBonusOwner(
    state.expressRiderBonus,
    bonusCountsByPlayerId,
    playerId,
    "expressBusPlays",
  );

  return recalculateTotalScores({
    ...state,
    bonusCountsByPlayerId,
    expressRiderBonus,
  });
};

export const registerRushCardPlay = (state: GameState, playerId: string): GameState => {
  const bonusCountsByPlayerId = incrementCount(state, playerId, "rushCardsPlayed");
  const queensBusRedesignBonus = resolveBonusOwner(
    state.queensBusRedesignBonus,
    bonusCountsByPlayerId,
    playerId,
    "rushCardsPlayed",
  );

  return recalculateTotalScores({
    ...state,
    bonusCountsByPlayerId,
    queensBusRedesignBonus,
  });
};

export const checkWin = (state: GameState): WinStatus => {
  const winnerIds = state.players
    .filter((player) => {
      const hasPointInEveryBorough = BOROUGHS.every((borough) => player.scoreByBorough[borough] >= 1);
      return player.totalScore >= WINNING_SCORE && hasPointInEveryBorough;
    })
    .map((player) => player.id);

  return { winnerIds };
};
