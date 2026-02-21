import {
  discardBusCard,
  discardEventCard,
  discardRushCard,
  drawCards,
  drawEventCard,
  drawRushCard,
} from "./decks";
import { isPerkSuppressed } from "./perkRules";
import { OUTER_BOROUGHS, type Borough, type GameState, type RushCard } from "./state";

const DEFAULT_ACTIONS_PER_TURN = 2;

const EVENT_TRIGGER_ROUND_INTERVAL = 2;

interface TurnEventModifiers {
  actionsDelta: number;
  busPlaysDelta: number;
  logs: string[];
}

const decrementActiveEvents = (
  activeEvents: GameState["activeEvents"],
): { activeEvents: GameState["activeEvents"]; expiredCards: GameState["eventDeck"]["discardPile"] } => {
  const decremented = activeEvents.map((event) => ({
    ...event,
    roundsRemaining: event.roundsRemaining - 1,
  }));

  const nextActiveEvents = decremented.filter((event) => event.roundsRemaining > 0);
  const expiredCards = decremented
    .filter((event) => event.roundsRemaining <= 0)
    .map((event) => event.card);

  return {
    activeEvents: nextActiveEvents,
    expiredCards,
  };
};

const applyOneTimeEvent = (state: GameState, eventKey: string): GameState => {
  if (eventKey === "city_funding_boost") {
    return {
      ...state,
      actionsRemaining: state.actionsRemaining + 1,
      players: state.players.map((player, index) =>
        index === state.currentPlayerIndex
          ? { ...player, actionsRemaining: player.actionsRemaining + 1 }
          : player,
      ),
      eventLog: [...state.eventLog, "Event effect: City Funding Boost grants +1 action this turn."],
    };
  }

  return {
    ...state,
    eventLog: [...state.eventLog, `Event effect: ${eventKey} resolved.`],
  };
};

const normalizeEffectKey = (effectKey: string, name: string): string =>
  (effectKey || name).trim().toLowerCase().replace(/\s+/g, "_");

const getTurnEventModifiers = (state: GameState): TurnEventModifiers => {
  const modifiers: TurnEventModifiers = {
    actionsDelta: 0,
    busPlaysDelta: 0,
    logs: [],
  };

  for (const activeEvent of state.activeEvents) {
    const key = normalizeEffectKey(activeEvent.card.effectKey, activeEvent.card.name);

    if (key === "service_surge") {
      modifiers.busPlaysDelta += 1;
      modifiers.logs.push("Event modifier applied: Service Surge grants +1 Bus play this turn.");
    }

    if (key === "rush_hour") {
      modifiers.actionsDelta -= 1;
      modifiers.logs.push("Event modifier applied: Rush Hour reduces actions by 1 this turn.");
    }
  }

  return modifiers;
};

const applyTurnEventModifiers = (state: GameState): GameState => {
  if (state.activeEvents.length === 0) {
    return state;
  }

  const modifiers = getTurnEventModifiers(state);
  if (modifiers.actionsDelta === 0 && modifiers.busPlaysDelta === 0) {
    return state;
  }

  const activePlayer = state.players[state.currentPlayerIndex];
  const nextActions = Math.max(0, state.actionsRemaining + modifiers.actionsDelta);

  return {
    ...state,
    actionsRemaining: nextActions,
    busPlaysAllowedThisTurn: Math.max(0, state.busPlaysAllowedThisTurn + modifiers.busPlaysDelta),
    players: state.players.map((player, index) =>
      index === state.currentPlayerIndex
        ? {
            ...player,
            actionsRemaining: Math.max(0, player.actionsRemaining + modifiers.actionsDelta),
          }
        : player,
    ),
    eventLog:
      activePlayer && modifiers.logs.length > 0
        ? [...state.eventLog, ...modifiers.logs.map((log) => `${log} (${activePlayer.name})`)]
        : state.eventLog,
  };
};

const triggerRoundEvent = (state: GameState): GameState => {
  const draw = drawEventCard(state.eventDeck, state.seed + state.round + state.turn + 53);

  if (!draw.card) {
    return {
      ...state,
      eventDeck: draw.deck,
      eventLog: [...state.eventLog, "No Event card available to reveal."],
    };
  }

  const revealed = draw.card;
  const eventKey = normalizeEffectKey(revealed.effectKey, revealed.name);
  const revealedLog = `Event revealed: ${revealed.name}.`;

  if (revealed.durationRounds && revealed.durationRounds > 0) {
    return {
      ...state,
      eventDeck: draw.deck,
      activeEvents: [
        ...state.activeEvents,
        {
          card: revealed,
          roundsRemaining: revealed.durationRounds,
        },
      ],
      eventLog: [
        ...state.eventLog,
        revealedLog,
        `Event modifier active for ${revealed.durationRounds} rounds.`,
      ],
    };
  }

  const afterDiscard = {
    ...state,
    eventDeck: discardEventCard(draw.deck, revealed),
    eventLog: [...state.eventLog, revealedLog],
  };

  return applyOneTimeEvent(afterDiscard, eventKey);
};


interface RushTradeInput {
  playerId: string;
  busCardIdsForRush?: string[];
  rushCardIdForBus?: string;
}

interface RerouteInput {
  busCardId: string;
  toBorough: Borough;
}

interface PlayRushCardInput {
  playerId: string;
  cardId: string;
  destinationBorough?: Borough;
  reroute?: RerouteInput;
}

const normalizeKey = (card: RushCard): string => normalizeEffectKey(card.effectKey, card.name);

const assertRushNotBlocked = (state: GameState, playerId: string): void => {
  const blocked = state.activeRestrictions.some(
    (restriction) => restriction.targetPlayerId === playerId && restriction.effect === "block_rush_cards",
  );

  if (blocked) {
    throw new Error("Active restriction prevents Rush card play.");
  }
};

const isOuter = (borough: Borough): boolean => OUTER_BOROUGHS.includes(borough);

const getBusTradeTargetValue = (state: GameState, playerIndex: number): number => {
  const player = state.players[playerIndex];
  if (!player?.activePerk || isPerkSuppressed(state)) {
    return 3;
  }

  const key = normalizeEffectKey(player.activePerk.effectKey, player.activePerk.name);
  return key === "rush_trade_discount" ? 2 : 3;
};

const canMoveWithKey = (key: string, from: Borough, to: Borough): boolean => {
  if (from === to) {
    return false;
  }

  if (key === "take_the_subway") {
    return to !== "StatenIsland";
  }

  if (key === "taxi") {
    return true;
  }

  if (key === "staten_island_ferry") {
    return (
      (from === "Manhattan" && to === "StatenIsland") ||
      (from === "StatenIsland" && to === "Manhattan")
    );
  }

  if (key === "commuter_rail") {
    return (
      (from === "Manhattan" && isOuter(to) && to !== "StatenIsland") ||
      (to === "Manhattan" && isOuter(from) && from !== "StatenIsland")
    );
  }

  if (key === "interborough_express") {
    const ibx = ["Bronx", "Brooklyn", "Queens"] satisfies Borough[];
    return ibx.includes(from) && ibx.includes(to);
  }

  return false;
};

export const tradeRush = (state: GameState, input: RushTradeInput): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (!currentPlayer || currentPlayer.id !== input.playerId) {
    throw new Error("Only the active player can trade Rush cards.");
  }

  assertRushNotBlocked(state, currentPlayer.id);

  if (state.rushTradeUsedThisTurn) {
    throw new Error("Rush trade already used this turn.");
  }

  if (input.busCardIdsForRush && input.rushCardIdForBus) {
    throw new Error("Choose only one Rush trade mode.");
  }

  if (!input.busCardIdsForRush && !input.rushCardIdForBus) {
    throw new Error("Trade input is required.");
  }

  if (input.busCardIdsForRush) {
    const selected = currentPlayer.busHand.filter((card) => input.busCardIdsForRush?.includes(card.id));
    const total = selected.reduce((sum, card) => sum + card.routeValue, 0);
    const tradeTargetValue = getBusTradeTargetValue(state, state.currentPlayerIndex);

    if (selected.length === 0 || total !== tradeTargetValue || selected.length !== input.busCardIdsForRush.length) {
      throw new Error(`Bus-to-Rush trade requires Bus cards totaling exactly ${tradeTargetValue} value.`);
    }

    let busDeck = state.busDeck;
    for (const card of selected) {
      busDeck = discardBusCard(busDeck, card);
    }

    const rushDraw = drawRushCard(state.rushDeck, state.seed + state.turn + state.round);

    const players = state.players.map((player, index) => {
      if (index !== state.currentPlayerIndex) {
        return player;
      }

      return {
        ...player,
        busHand: player.busHand.filter((card) => !input.busCardIdsForRush?.includes(card.id)),
        rushHand: rushDraw.card ? [...player.rushHand, rushDraw.card] : player.rushHand,
      };
    });

    return {
      ...state,
      busDeck,
      rushDeck: rushDraw.deck,
      players,
      rushTradeUsedThisTurn: true,
      eventLog: [...state.eventLog, `${currentPlayer.name} traded Bus value ${tradeTargetValue} for 1 Rush card.`],
    };
  }

  const rushCard = currentPlayer.rushHand.find((card) => card.id === input.rushCardIdForBus);
  if (!rushCard || !input.rushCardIdForBus) {
    throw new Error("Rush-to-Bus trade requires a valid Rush card.");
  }

  const rushDeckAfterDiscard = discardRushCard(state.rushDeck, rushCard);
  const busDraw = drawCards(state.busDeck, 2, state.seed + state.turn + state.round + 17);

  const players = state.players.map((player, index) => {
    if (index !== state.currentPlayerIndex) {
      return player;
    }

    return {
      ...player,
      rushHand: player.rushHand.filter((card) => card.id !== rushCard.id),
      busHand: [...player.busHand, ...busDraw.cards],
    };
  });

  return {
    ...state,
    busDeck: busDraw.deck,
    rushDeck: rushDeckAfterDiscard,
    players,
    rushTradeUsedThisTurn: true,
    eventLog: [...state.eventLog, `${currentPlayer.name} traded 1 Rush card for 2 Bus cards.`],
  };
};

const actionCostByKey: Record<string, number> = {
  reroute: 1,
  bus_transfer: 1,
  taxi: 2,
  take_the_subway: 2,
  staten_island_ferry: 0,
  commuter_rail: 1,
  interborough_express: 1,
};

export const playRushCard = (state: GameState, input: PlayRushCardInput): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (!currentPlayer || currentPlayer.id !== input.playerId) {
    throw new Error("Only the active player can play a Rush card.");
  }

  assertRushNotBlocked(state, currentPlayer.id);

  const rushCard = currentPlayer.rushHand.find((card) => card.id === input.cardId);
  if (!rushCard) {
    throw new Error("Rush card not found in active player hand.");
  }

  const key = normalizeKey(rushCard);
  const cost = actionCostByKey[key];

  if (cost === undefined) {
    throw new Error("Unsupported Rush card effect.");
  }

  if (state.actionsRemaining < cost) {
    throw new Error("Not enough actions remaining for this Rush card.");
  }

  let nextState: GameState = {
    ...state,
    actionsRemaining: Math.max(0, state.actionsRemaining - cost),
    players: state.players.map((player, index) =>
      index === state.currentPlayerIndex
        ? {
            ...player,
            rushHand: player.rushHand.filter((card) => card.id !== input.cardId),
            actionsRemaining: Math.max(0, player.actionsRemaining - cost),
          }
        : player,
    ),
    rushDeck: discardRushCard(state.rushDeck, rushCard),
  };

  if (key === "reroute") {
    if (!input.reroute) {
      throw new Error("Reroute requires a target Bus card and destination borough.");
    }

    const actor = nextState.players[nextState.currentPlayerIndex];
    const busCard = actor.busHand.find((card) => card.id === input.reroute?.busCardId);
    if (!busCard) {
      throw new Error("Reroute target Bus card not found.");
    }

    const isExpress = busCard.tags?.some((tag) => tag.toLowerCase() === "express") ?? false;
    if (isExpress && isOuter(state.currentBorough) && isOuter(input.reroute.toBorough)) {
      throw new Error("Rerouted Express cannot travel between two outer boroughs.");
    }

    const players = [...nextState.players];
    players[nextState.currentPlayerIndex] = {
      ...actor,
      busHand: actor.busHand.map((card) =>
        card.id === input.reroute?.busCardId ? { ...card, borough: input.reroute.toBorough } : card,
      ),
    };

    return {
      ...nextState,
      players,
      eventLog: [...nextState.eventLog, `${actor.name} rerouted a Bus card to ${input.reroute.toBorough}.`],
    };
  }

  if (key === "bus_transfer") {
    return {
      ...nextState,
      busPlaysAllowedThisTurn: Math.max(nextState.busPlaysAllowedThisTurn, 2),
      eventLog: [...nextState.eventLog, `${currentPlayer.name} played Bus Transfer.`],
    };
  }

  if (!input.destinationBorough) {
    throw new Error("Movement Rush card requires a destination borough.");
  }

  if (!canMoveWithKey(key, state.currentBorough, input.destinationBorough)) {
    throw new Error("Illegal Rush movement for selected card.");
  }

  const movementState: GameState = {
    ...nextState,
    currentBorough: key === "taxi" ? state.currentBorough : input.destinationBorough,
    taxiTrip:
      key === "taxi"
        ? {
            playerId: currentPlayer.id,
            soloBorough: input.destinationBorough,
            returnAfterRound: state.round + 3,
          }
        : nextState.taxiTrip,
    eventLog: [
      ...nextState.eventLog,
      `${currentPlayer.name} played ${rushCard.name}${
        key === "taxi" ? ` and traveled solo to ${input.destinationBorough}.` : ` and moved to ${input.destinationBorough}.`
      }`,
    ],
  };

  return movementState;
};

export const endTurn = (state: GameState): GameState => {
  const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  const wrappedRound = nextPlayerIndex === 0;
  const nextRound = wrappedRound ? state.round + 1 : state.round;

  let nextTaxiTrip = state.taxiTrip;
  if (nextTaxiTrip) {
    if (state.currentBorough === nextTaxiTrip.soloBorough || nextRound >= nextTaxiTrip.returnAfterRound) {
      nextTaxiTrip = undefined;
    }
  }

  const decrementedEvents = wrappedRound
    ? decrementActiveEvents(state.activeEvents)
    : { activeEvents: state.activeEvents, expiredCards: [] };

  const baseNextState: GameState = {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    turn: state.turn + 1,
    round: nextRound,
    actionsRemaining: DEFAULT_ACTIONS_PER_TURN,
    busPlaysThisTurn: 0,
    busPlaysAllowedThisTurn: 1,
    rushTradeUsedThisTurn: false,
    taxiTrip: nextTaxiTrip,
    activeEvents: decrementedEvents.activeEvents,
    eventDeck:
      decrementedEvents.expiredCards.length > 0
        ? {
            ...state.eventDeck,
            discardPile: [...state.eventDeck.discardPile, ...decrementedEvents.expiredCards],
          }
        : state.eventDeck,
    eventLog:
      decrementedEvents.expiredCards.length > 0
        ? [
            ...state.eventLog,
            ...decrementedEvents.expiredCards.map((card) => `Event expired: ${card.name}.`),
          ]
        : state.eventLog,
    players: state.players.map((player, index) =>
      index === nextPlayerIndex ? { ...player, actionsRemaining: DEFAULT_ACTIONS_PER_TURN } : player,
    ),
  };

  const shouldRevealEvent = wrappedRound && nextRound % EVENT_TRIGGER_ROUND_INTERVAL === 0;
  const withRoundEvent = shouldRevealEvent ? triggerRoundEvent(baseNextState) : baseNextState;

  return applyTurnEventModifiers(withRoundEvent);
};
