import { isGlobalModifierActive } from "./eventRules";
import {
  OUTER_BOROUGHS,
  type Borough,
  type BusCard,
  type GameState,
  type PlayerRestriction,
  type RestrictionEffect,
  type RestrictionKind,
} from "./state";

const MAX_POINTS_PER_BOROUGH = 3;

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
): Record<Borough, number> => ({
  ...scoreByBorough,
  [borough]: scoreByBorough[borough] + 1,
});

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

  if (isGlobalModifierActive(state, "late_night_service") && isExpressCard(card)) {
    throw new Error("Express Bus plays are blocked by Late Night Service.");
  }

  if (isGlobalModifierActive(state, "weekend_service") && (hasTag(card, "limited") || hasTag(card, "select"))) {
    throw new Error("Limited/Select Bus plays are blocked by Weekend Service.");
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

  const updatedPlayers = state.players.map((player) => {
    if (player.id !== currentPlayer.id) {
      return player;
    }

    return {
      ...player,
      busHand: player.busHand.filter((entry) => entry.id !== card.id),
      scoreByBorough: addScoreForBorough(player.scoreByBorough, card.borough),
      totalScore: player.totalScore + 1,
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
    activeRestrictions: [...remainingRestrictions, ...additionalRestrictions],
    taxiTrip:
      state.taxiTrip && state.taxiTrip.soloBorough === card.borough ? undefined : state.taxiTrip,
    eventLog: [
      ...state.eventLog,
      `${currentPlayer.name} played ${card.name} to ${card.borough} (+1 point).`,
    ],
  };
};
