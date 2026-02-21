import { drawPerkCard } from "./decks";
import { isEventActive } from "./eventRules";
import { type GameState } from "./state";

export const isBridgeReconstructionActive = (state: GameState): boolean =>
  isEventActive(state, "bridge_reconstruction");

export const isPerkSuppressed = (state: GameState): boolean => isBridgeReconstructionActive(state);

interface PurchaseTransitPerkInput {
  playerId: string;
}

interface SwitchTransitPerkInput {
  playerId: string;
  perkCardId: string;
}

export const purchaseTransitPerk = (state: GameState, input: PurchaseTransitPerkInput): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== input.playerId) {
    throw new Error("Only the active player can purchase a Transit Perk.");
  }

  if (state.actionsRemaining <= 0) {
    throw new Error("No actions remaining for Transit Perk purchase.");
  }

  const draw = drawPerkCard(state.perkDeck, state.seed + state.round + state.turn + 71);
  if (!draw.card) {
    throw new Error("No Transit Perk available to purchase.");
  }

  return {
    ...state,
    perkDeck: draw.deck,
    actionsRemaining: Math.max(0, state.actionsRemaining - 1),
    players: state.players.map((player, index) =>
      index === state.currentPlayerIndex
        ? {
            ...player,
            actionsRemaining: Math.max(0, player.actionsRemaining - 1),
            transitPerks: [...player.transitPerks, draw.card!],
            activePerk: player.activePerk ?? draw.card,
          }
        : player,
    ),
    eventLog: [...state.eventLog, `${currentPlayer.name} purchased Transit Perk: ${draw.card.name}.`],
  };
};

export const switchTransitPerk = (state: GameState, input: SwitchTransitPerkInput): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== input.playerId) {
    throw new Error("Only the active player can switch Transit Perks.");
  }

  const nextPerk = currentPlayer.transitPerks.find((perk) => perk.id === input.perkCardId);
  if (!nextPerk) {
    throw new Error("Transit Perk not owned by active player.");
  }

  return {
    ...state,
    players: state.players.map((player, index) =>
      index === state.currentPlayerIndex ? { ...player, activePerk: nextPerk } : player,
    ),
    eventLog: [...state.eventLog, `${currentPlayer.name} switched active Transit Perk to ${nextPerk.name}.`],
  };
};
