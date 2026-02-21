import { discardEventCard, drawEventCard } from "./decks";
import { type ActiveEvent, type EventCard, type GameState } from "./state";

const normalizeEffectKey = (effectKey: string, name: string): string =>
  (effectKey || name).trim().toLowerCase().replace(/\s+/g, "_");

const EVENT_DRAW_SEED_OFFSET = 53;

const getEventDrawSeed = (state: GameState): number => state.seed + state.round + state.turn + EVENT_DRAW_SEED_OFFSET;

const decrementActiveEvents = (
  activeEvents: GameState["activeEvents"],
): { activeEvents: GameState["activeEvents"]; expiredCards: EventCard[] } => {
  const decremented = activeEvents.map((event) => ({
    ...event,
    roundsRemaining: event.roundsRemaining - 1,
  }));

  return {
    activeEvents: decremented.filter((event) => event.roundsRemaining > 0),
    expiredCards: decremented.filter((event) => event.roundsRemaining <= 0).map((event) => event.card),
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

export const activateEventFromDeck = (state: GameState): GameState => {
  const draw = drawEventCard(state.eventDeck, getEventDrawSeed(state));

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
    const timedEvent: ActiveEvent = {
      card: revealed,
      roundsRemaining: revealed.durationRounds,
    };

    return {
      ...state,
      eventDeck: draw.deck,
      activeEvents: [...state.activeEvents, timedEvent],
      eventLog: [
        ...state.eventLog,
        revealedLog,
        `Event modifier active for ${revealed.durationRounds} rounds.`,
      ],
    };
  }

  return applyOneTimeEvent(
    {
      ...state,
      eventDeck: discardEventCard(draw.deck, revealed),
      eventLog: [...state.eventLog, revealedLog],
    },
    eventKey,
  );
};

export const tickEventsForNewRound = (state: GameState): GameState => {
  const decrementedEvents = decrementActiveEvents(state.activeEvents);

  if (decrementedEvents.expiredCards.length === 0) {
    return {
      ...state,
      activeEvents: decrementedEvents.activeEvents,
    };
  }

  return {
    ...state,
    activeEvents: decrementedEvents.activeEvents,
    eventDeck: {
      ...state.eventDeck,
      discardPile: [...state.eventDeck.discardPile, ...decrementedEvents.expiredCards],
    },
    eventLog: [
      ...state.eventLog,
      ...decrementedEvents.expiredCards.map((card) => `Event expired: ${card.name}.`),
    ],
  };
};

export const isEventActive = (state: GameState, kind: string): boolean =>
  state.activeEvents.some(
    (event) => normalizeEffectKey(event.card.effectKey, event.card.name) === normalizeEffectKey(kind, kind),
  );
