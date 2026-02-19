import { BOROUGHS, type BonusTracker, type GameState, type PlayerState } from "./state";

const BONUS_AWARD_THRESHOLD = 4;
const BONUS_LOCK_THRESHOLD = 6;
const BONUS_POINTS = 2;
const WIN_SCORE_THRESHOLD = 14;

export interface WinCheckResult {
  winnerIds: string[];
}

const boroughScore = (player: PlayerState): number =>
  BOROUGHS.reduce((sum, borough) => sum + player.scoreByBorough[borough], 0);

const bonusPoints = (state: GameState, playerId: string): number => {
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
    totalScore: boroughScore(player) + bonusPoints(state, player.id),
  })),
});

const incrementBonusCount = (
  state: GameState,
  playerId: string,
  key: "expressBusPlays" | "rushCardsPlayed",
): GameState["bonusCountsByPlayerId"] => ({
  ...state.bonusCountsByPlayerId,
  [playerId]: {
    expressBusPlays: state.bonusCountsByPlayerId[playerId]?.expressBusPlays ?? 0,
    rushCardsPlayed: state.bonusCountsByPlayerId[playerId]?.rushCardsPlayed ?? 0,
    [key]: (state.bonusCountsByPlayerId[playerId]?.[key] ?? 0) + 1,
  },
});

const resolveBonusOwner = (
  tracker: BonusTracker,
  counts: GameState["bonusCountsByPlayerId"],
  currentPlayerId: string,
  countKey: "expressBusPlays" | "rushCardsPlayed",
): BonusTracker => {
  const currentCount = counts[currentPlayerId]?.[countKey] ?? 0;

  if (!tracker.ownerPlayerId) {
    if (currentCount >= BONUS_AWARD_THRESHOLD) {
      return {
        ownerPlayerId: currentPlayerId,
        isLocked: currentCount >= BONUS_LOCK_THRESHOLD,
      };
    }

    return tracker;
  }

  const ownerCount = counts[tracker.ownerPlayerId]?.[countKey] ?? 0;
  if (!tracker.isLocked && currentPlayerId !== tracker.ownerPlayerId && currentCount > ownerCount) {
    return {
      ownerPlayerId: currentPlayerId,
      isLocked: currentCount >= BONUS_LOCK_THRESHOLD,
    };
  }

  if (tracker.ownerPlayerId === currentPlayerId && currentCount >= BONUS_LOCK_THRESHOLD) {
    return {
      ...tracker,
      isLocked: true,
    };
  }

  return tracker;
};

export const registerExpressBusPlay = (state: GameState, playerId: string): GameState => {
  const bonusCountsByPlayerId = incrementBonusCount(state, playerId, "expressBusPlays");

  return recalculateTotalScores({
    ...state,
    bonusCountsByPlayerId,
    expressRiderBonus: resolveBonusOwner(
      state.expressRiderBonus,
      bonusCountsByPlayerId,
      playerId,
      "expressBusPlays",
    ),
  });
};

export const registerRushCardPlay = (state: GameState, playerId: string): GameState => {
  const bonusCountsByPlayerId = incrementBonusCount(state, playerId, "rushCardsPlayed");

  return recalculateTotalScores({
    ...state,
    bonusCountsByPlayerId,
    queensBusRedesignBonus: resolveBonusOwner(
      state.queensBusRedesignBonus,
      bonusCountsByPlayerId,
      playerId,
      "rushCardsPlayed",
    ),
  });
};

export const checkWin = (state: GameState): WinCheckResult => {
  const winnerIds = state.players
    .filter((player) => {
      const hasAllBoroughs = BOROUGHS.every((borough) => player.scoreByBorough[borough] >= 1);
      return hasAllBoroughs && player.totalScore >= WIN_SCORE_THRESHOLD;
    })
    .map((player) => player.id);

  return { winnerIds };
};
