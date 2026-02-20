import { type BonusRaceState, type GameState, type PlayerState } from "./state";

const BONUS_POINTS = 2;

const baseScore = (player: PlayerState): number =>
  Object.values(player.scoreByBorough).reduce((sum, value) => sum + value, 0);

export const incrementBonusCount = (bonus: BonusRaceState, playerId: string): BonusRaceState => ({
  ...bonus,
  countsByPlayerId: {
    ...bonus.countsByPlayerId,
    [playerId]: (bonus.countsByPlayerId[playerId] ?? 0) + 1,
  },
});

export const resolveBonusOwnership = (bonus: BonusRaceState, playerId: string): BonusRaceState => {
  if (bonus.locked) {
    return bonus;
  }

  const playerCount = bonus.countsByPlayerId[playerId] ?? 0;
  const ownerId = bonus.ownerPlayerId;
  const ownerCount = ownerId ? (bonus.countsByPlayerId[ownerId] ?? 0) : -1;

  if (playerCount >= 6) {
    return {
      ...bonus,
      ownerPlayerId: playerId,
      locked: true,
    };
  }

  if (!ownerId && playerCount >= 4) {
    return {
      ...bonus,
      ownerPlayerId: playerId,
    };
  }

  if (ownerId && ownerId !== playerId && playerCount > ownerCount) {
    return {
      ...bonus,
      ownerPlayerId: playerId,
    };
  }

  return bonus;
};

export const withRecalculatedTotals = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((player) => {
    const expressPoints = state.expressRider.ownerPlayerId === player.id ? BONUS_POINTS : 0;
    const queensPoints = state.queensBusRedesign.ownerPlayerId === player.id ? BONUS_POINTS : 0;

    return {
      ...player,
      totalScore: baseScore(player) + expressPoints + queensPoints,
    };
  }),
});
