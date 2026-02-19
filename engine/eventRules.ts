import { discardBusCard, discardEventCard, drawCard, drawCards } from "./decks";
import {
  BOROUGHS,
  type ActiveGlobalModifier,
  type Borough,
  type EventCard,
  type GameState,
  type GlobalModifierKey,
} from "./state";

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "_");

export const isGlobalModifierActive = (state: GameState, key: GlobalModifierKey): boolean =>
  state.activeGlobalModifiers.some((modifier) => modifier.key === key);

const withPoint = (state: GameState, playerIndex: number, borough: Borough, delta: number): GameState => {
  const players = [...state.players];
  const player = players[playerIndex];
  const current = player.scoreByBorough[borough];
  const next = Math.max(0, Math.min(3, current + delta));
  const diff = next - current;

  players[playerIndex] = {
    ...player,
    scoreByBorough: { ...player.scoreByBorough, [borough]: next },
    totalScore: Math.max(0, player.totalScore + diff),
  };

  return { ...state, players };
};

const applyOneTimeEvent = (state: GameState, card: EventCard): GameState => {
  const key = normalize(card.effectKey || card.name);

  if (key === "extra_service") {
    let next = state;
    next.players.forEach((player, index) => {
      const draw = drawCards(next.busDeck, 2, next.seed + next.turn + index + 701);
      next = {
        ...next,
        busDeck: draw.deck,
        players: next.players.map((p, i) => (i === index ? { ...p, busHand: [...p.busHand, ...draw.cards] } : p)),
      };
    });
    return { ...next, eventLog: [...next.eventLog, "Event: Extra Service applied."] };
  }

  if (key === "budget_cuts") {
    let next = state;
    next.players.forEach((player, index) => {
      const toDiscard = player.busHand.slice(0, 2);
      let deck = next.busDeck;
      toDiscard.forEach((cardItem) => {
        deck = discardBusCard(deck, cardItem);
      });
      next = {
        ...next,
        busDeck: deck,
        players: next.players.map((p, i) =>
          i === index ? { ...p, busHand: p.busHand.slice(Math.min(2, p.busHand.length)) } : p,
        ),
      };
    });
    return { ...next, eventLog: [...next.eventLog, "Event: Budget Cuts applied."] };
  }

  if (key === "no_smoking") {
    let next = state;
    next.players.forEach((player, index) => {
      const target = BOROUGHS.find((borough) => player.scoreByBorough[borough] > 0);
      if (target) next = withPoint(next, index, target, -1);
    });
    return { ...next, eventLog: [...next.eventLog, "Event: No Smoking applied."] };
  }

  const boroughParty: Record<string, Borough> = {
    manhattan_party: "Manhattan",
    brooklyn_party: "Brooklyn",
    queens_party: "Queens",
    bronx_party: "Bronx",
    statenisland_party: "StatenIsland",
  };
  const borough = boroughParty[key];
  if (borough) {
    let next = state;
    next.players.forEach((player, index) => {
      if (player.busHand.some((cardItem) => cardItem.borough === borough)) {
        next = withPoint(next, index, borough, 1);
      }
    });
    return { ...next, eventLog: [...next.eventLog, `Event: ${card.name} applied.`] };
  }

  return state;
};

const asModifier = (key: string): GlobalModifierKey | undefined => {
  const map: Record<string, GlobalModifierKey> = {
    weekend_service: "weekend_service",
    fare_hike: "fare_hike",
    late_night_service: "late_night_service",
    bridge_reconstruction: "bridge_reconstruction",
  };
  return map[key];
};

export const applyEventAtRoundBoundary = (state: GameState): GameState => {
  const retained = state.activeGlobalModifiers.filter((modifier) => modifier.expiresAfterRound >= state.round);
  let next: GameState = { ...state, activeGlobalModifiers: retained };

  if (state.round % 2 !== 0) {
    return next;
  }

  const draw = drawCard(next.eventDeck, next.seed + next.turn + next.round + 501);
  if (!draw.card) {
    return { ...next, eventDeck: draw.deck };
  }

  const key = normalize(draw.card.effectKey || draw.card.name);
  const modifierKey = asModifier(key);

  next = {
    ...next,
    eventDeck: discardEventCard(draw.deck, draw.card),
    eventLog: [...next.eventLog, `Event revealed: ${draw.card.name}.`],
  };

  if (modifierKey) {
    const modifier: ActiveGlobalModifier = { key: modifierKey, expiresAfterRound: state.round + 1 };
    return {
      ...next,
      activeGlobalModifiers: [...next.activeGlobalModifiers.filter((m) => m.key !== modifierKey), modifier],
      eventLog: [...next.eventLog, `Modifier active: ${draw.card.name} (2 rounds).`],
    };
  }

  return applyOneTimeEvent(next, draw.card);
};
