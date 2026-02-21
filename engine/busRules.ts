import {
  OUTER_BOROUGHS,
  type BonusRaceKey,
  type BonusRaceMap,
  type Borough,
  type BusCard,
  type GameState,
  type PlayerRestriction,
  type RestrictionEffect,
  type RestrictionKind,
} from "./state";

const MAX_POINTS_PER_BOROUGH = 3;
const BONUS_RACE_AWARD_AT = 4;
const BONUS_RACE_LOCK_AT = 6;
const BONUS_RACE_SCORE = 2;

interface PlayBusCardInput {
  playerId: string;
  cardId: string;
  selectedPlayerId?: string;
}

const hasTag = (card: BusCard, tag: string): boolean =>
  card.tags?.some((entry) => entry.toLowerCase() === tag.toLowerCase()) ?? false;

const isExpressCard = (card: BusCard): boolean => hasTag(card, "express");

const isExpressMoveValid = (from: Borough, to: Borough): boolean => {
  const fromManhattan = from === "Manhattan";
  const toManhattan = to === "Manhattan";

  if (fromManhattan && OUTER_BOROUGHS.includes(to)) {
    return true;
  }

  if (toManhattan && OUTER_BOROUGHS.includes(from)) {
    return true;
  }

  return false;
};

const canPlayCardForBorough = (state: GameState, card: BusCard): boolean => {
  if (card.borough === state.currentBorough) {
    return true;
  }

  return isExpressCard(card) && isExpressMoveValid(state.currentBorough, card.borough);
};

const isRestrictedCardPlay = (card: BusCard, restrictions: PlayerRestriction[]): boolean => {
  if (restrictions.length === 0) {
    return false;
  }

  return restrictions.some((restriction) => {
    if (restriction.effect === "block_non_express_bus") {
      return !isExpressCard(card);
    }

    if (restriction.effect === "block_express_bus") {
      return isExpressCard(card);
    }

    if (restriction.effect === "block_rush_cards") {
      return false;
    }

    return false;
  });
};

const addScoreForBorough = (
  scoreByBorough: Record<Borough, number>,
  borough: Borough,
  points: number,
): Record<Borough, number> => ({
  ...scoreByBorough,
  [borough]: scoreByBorough[borough] + points,
});

const normalizeEffectKey = (effectKey: string): string => effectKey.trim().toLowerCase().replace(/\s+/g, "_");

const isPerkEffectsDisabled = (state: GameState): boolean =>
  state.activeEvents.some((activeEvent) => normalizeEffectKey(activeEvent.card.effectKey) === "bridge_reconstruction");

const calculatePerkObjectiveBonus = (
  state: GameState,
  playerPerk: GameState["players"][number]["activePerk"],
  card: BusCard,
): number => {
  if (!playerPerk || isPerkEffectsDisabled(state)) {
    return 0;
  }

  const perkKey = normalizeEffectKey(playerPerk.effectKey);

  if (perkKey === "express_rider" && isExpressCard(card)) {
    return 1;
  }

  if (perkKey === "queens_bus_redesign" && card.borough === "Queens") {
    return 1;
  }

  return 0;
};

const buildRestriction = (
  targetPlayerId: string,
  source: RestrictionKind,
  effect: RestrictionEffect,
): PlayerRestriction => ({
  targetPlayerId,
  source,
  effect,
  expiresAfterBusPlay: true,
});

const updateBonusRace = (
  raceKey: BonusRaceKey,
  shouldCountPlay: boolean,
  playerId: string,
  playerNameById: Record<string, string>,
  bonusRaces: BonusRaceMap,
  totalScoreByPlayerId: Record<string, number>,
): { bonusRaces: BonusRaceMap; totalScoreByPlayerId: Record<string, number>; logs: string[] } => {
  if (!shouldCountPlay) {
    return { bonusRaces, totalScoreByPlayerId, logs: [] };
  }

  const race = bonusRaces[raceKey];
  const logs: string[] = [];
  const nextCounts = {
    ...race.perPlayerCounts,
    [playerId]: (race.perPlayerCounts[playerId] ?? 0) + 1,
  };

  let nextOwnerId = race.ownerPlayerId;
  let nextLocked = race.locked;
  const playerCount = nextCounts[playerId];

  if (!nextLocked) {
    if (!nextOwnerId && playerCount >= BONUS_RACE_AWARD_AT) {
      nextOwnerId = playerId;
      totalScoreByPlayerId[playerId] = (totalScoreByPlayerId[playerId] ?? 0) + BONUS_RACE_SCORE;
      logs.push(`${playerNameById[playerId]} claimed ${raceKey} bonus (+${BONUS_RACE_SCORE} points).`);
    } else if (nextOwnerId && nextOwnerId !== playerId) {
      const ownerCount = nextCounts[nextOwnerId] ?? 0;
      if (playerCount > ownerCount) {
        totalScoreByPlayerId[nextOwnerId] = (totalScoreByPlayerId[nextOwnerId] ?? 0) - BONUS_RACE_SCORE;
        totalScoreByPlayerId[playerId] = (totalScoreByPlayerId[playerId] ?? 0) + BONUS_RACE_SCORE;
        logs.push(
          `${playerNameById[playerId]} stole ${raceKey} bonus from ${playerNameById[nextOwnerId]} (+${BONUS_RACE_SCORE} points).`,
        );
        nextOwnerId = playerId;
      }
    }

    if (nextOwnerId && (nextCounts[nextOwnerId] ?? 0) >= BONUS_RACE_LOCK_AT) {
      nextLocked = true;
      logs.push(`${playerNameById[nextOwnerId]} locked ${raceKey} bonus at ${BONUS_RACE_LOCK_AT}.`);
    }
  }

  return {
    bonusRaces: {
      ...bonusRaces,
      [raceKey]: {
        ownerPlayerId: nextOwnerId,
        locked: nextLocked,
        perPlayerCounts: nextCounts,
      },
    },
    totalScoreByPlayerId,
    logs,
  };
};

export const playBusCard = (state: GameState, input: PlayBusCardInput): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (!currentPlayer || currentPlayer.id !== input.playerId) {
    throw new Error("Only the active player can play a Bus card.");
  }

  const card = currentPlayer.busHand.find((entry) => entry.id === input.cardId);
  if (!card) {
    throw new Error("Bus card not found in active player hand.");
  }

  if (!canPlayCardForBorough(state, card)) {
    throw new Error("Illegal Bus play for current borough.");
  }

  if (state.actionsRemaining <= 0) {
    throw new Error("No actions remaining for this turn.");
  }

  if (state.busPlaysThisTurn >= state.busPlaysAllowedThisTurn) {
    throw new Error("No Bus plays remaining for this turn.");
  }

  const playerRestrictions = state.activeRestrictions.filter(
    (restriction) => restriction.targetPlayerId === currentPlayer.id,
  );

  if (isRestrictedCardPlay(card, playerRestrictions)) {
    throw new Error("Active restriction prevents this Bus play.");
  }

  if (currentPlayer.scoreByBorough[card.borough] >= MAX_POINTS_PER_BOROUGH) {
    throw new Error("Borough score cap reached for this player.");
  }

  const perkBonus = calculatePerkObjectiveBonus(state, currentPlayer.activePerk, card);
  const totalPointsToAward = Math.min(
    MAX_POINTS_PER_BOROUGH - currentPlayer.scoreByBorough[card.borough],
    1 + perkBonus,
  );

  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const selectedPlayerExists =
    input.selectedPlayerId && state.players.some((player) => player.id === input.selectedPlayerId);

  const additionalRestrictions: PlayerRestriction[] = [];

  if (hasTag(card, "limited")) {
    additionalRestrictions.push(
      buildRestriction(state.players[nextPlayerIndex].id, "limited", "block_non_express_bus"),
    );
  }

  if (hasTag(card, "select")) {
    if (!selectedPlayerExists || !input.selectedPlayerId) {
      throw new Error("Select card requires a valid selected player.");
    }

    additionalRestrictions.push(
      buildRestriction(input.selectedPlayerId, "select", "block_express_bus"),
    );
  }

  const totalScoreByPlayerId = Object.fromEntries(
    state.players.map((player) => [player.id, player.totalScore]),
  );
  totalScoreByPlayerId[currentPlayer.id] += totalPointsToAward;

  const playerNameById = Object.fromEntries(state.players.map((player) => [player.id, player.name]));

  const expressRaceUpdate = updateBonusRace(
    "express_rider",
    isExpressCard(card),
    currentPlayer.id,
    playerNameById,
    state.bonusRaces,
    totalScoreByPlayerId,
  );

  const queensRaceUpdate = updateBonusRace(
    "queens_bus_redesign",
    card.borough === "Queens",
    currentPlayer.id,
    playerNameById,
    expressRaceUpdate.bonusRaces,
    expressRaceUpdate.totalScoreByPlayerId,
  );

  const updatedPlayers = state.players.map((player) => {
    if (player.id !== currentPlayer.id) {
      return {
        ...player,
        totalScore: queensRaceUpdate.totalScoreByPlayerId[player.id] ?? player.totalScore,
      };
    }

    return {
      ...player,
      busHand: player.busHand.filter((entry) => entry.id !== card.id),
      scoreByBorough: addScoreForBorough(player.scoreByBorough, card.borough, totalPointsToAward),
      totalScore: queensRaceUpdate.totalScoreByPlayerId[player.id],
      actionsRemaining: Math.max(0, player.actionsRemaining - 1),
    };
  });

  const remainingRestrictions = state.activeRestrictions.filter(
    (restriction) => restriction.targetPlayerId !== currentPlayer.id,
  );

  return {
    ...state,
    currentBorough: card.borough,
    actionsRemaining: Math.max(0, state.actionsRemaining - 1),
    busPlaysThisTurn: state.busPlaysThisTurn + 1,
    players: updatedPlayers,
    bonusRaces: queensRaceUpdate.bonusRaces,
    activeRestrictions: [...remainingRestrictions, ...additionalRestrictions],
    taxiTrip:
      state.taxiTrip && state.taxiTrip.soloBorough === card.borough ? undefined : state.taxiTrip,
    eventLog: [
      ...state.eventLog,
      `${currentPlayer.name} played ${card.name} to ${card.borough} (+${totalPointsToAward} point${
        totalPointsToAward === 1 ? "" : "s"
      }).`,
      ...expressRaceUpdate.logs,
      ...queensRaceUpdate.logs,
    ],
  };
};
