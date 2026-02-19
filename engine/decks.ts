import { type BusCard, type DeckState, type EventCard, type GameCard, type RushCard } from "./state";

const RNG_MODULUS = 2147483647;
const RNG_MULTIPLIER = 48271;

export interface DrawResult<TCard extends GameCard> {
  deck: DeckState<TCard>;
  card?: TCard;
  reshuffled: boolean;
}

export interface DeckCatalog {
  bus: BusCard[];
  rush: RushCard[];
  event?: EventCard[];
}

export interface InitializedDecks {
  busDeck: DeckState<BusCard>;
  rushDeck: DeckState<RushCard>;
  eventDeck: DeckState<EventCard>;
}

export const normalizeSeed = (seed: number): number => {
  const normalized = Math.floor(seed) % RNG_MODULUS;
  return normalized > 0 ? normalized : normalized + RNG_MODULUS - 1;
};

export const seededRng = (seed: number): (() => number) => {
  let current = normalizeSeed(seed);
  return () => {
    current = (current * RNG_MULTIPLIER) % RNG_MODULUS;
    return current / RNG_MODULUS;
  };
};

export const shuffleWithSeed = <T>(cards: readonly T[], seed: number): T[] => {
  const rng = seededRng(seed);
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const createDeckState = <TCard extends GameCard>(
  cards: readonly TCard[],
  seed: number,
): DeckState<TCard> => ({ drawPile: shuffleWithSeed(cards, seed), discardPile: [] });

const maybeReshuffleDiscardIntoDrawPile = <TCard extends GameCard>(
  deck: DeckState<TCard>,
  seed: number,
): { deck: DeckState<TCard>; reshuffled: boolean } => {
  if (deck.drawPile.length > 0 || deck.discardPile.length === 0) {
    return { deck, reshuffled: false };
  }
  return {
    reshuffled: true,
    deck: { drawPile: shuffleWithSeed(deck.discardPile, seed), discardPile: [] },
  };
};

export const drawCard = <TCard extends GameCard>(deck: DeckState<TCard>, seed: number): DrawResult<TCard> => {
  const refill = maybeReshuffleDiscardIntoDrawPile(deck, seed);
  if (refill.deck.drawPile.length === 0) {
    return { deck: refill.deck, card: undefined, reshuffled: refill.reshuffled };
  }
  const [card, ...remainingCards] = refill.deck.drawPile;
  return { card, reshuffled: refill.reshuffled, deck: { ...refill.deck, drawPile: remainingCards } };
};

export const drawCards = <TCard extends GameCard>(
  deck: DeckState<TCard>,
  count: number,
  seed: number,
): { deck: DeckState<TCard>; cards: TCard[]; reshuffled: boolean } => {
  if (count <= 0) return { deck, cards: [], reshuffled: false };
  let nextDeck = deck;
  let rollingSeed = seed;
  let reshuffled = false;
  const cards: TCard[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = drawCard(nextDeck, rollingSeed);
    nextDeck = result.deck;
    rollingSeed += 1;
    reshuffled = reshuffled || result.reshuffled;
    if (!result.card) break;
    cards.push(result.card);
  }
  return { deck: nextDeck, cards, reshuffled };
};

export const discardCard = <TCard extends GameCard>(deck: DeckState<TCard>, card: TCard): DeckState<TCard> => ({
  ...deck,
  discardPile: [...deck.discardPile, card],
});

export const discardCards = <TCard extends GameCard>(deck: DeckState<TCard>, cards: readonly TCard[]): DeckState<TCard> => ({
  ...deck,
  discardPile: [...deck.discardPile, ...cards],
});

export const createBusDeck = (cards: readonly BusCard[], seed: number): DeckState<BusCard> => createDeckState(cards, seed);
export const createRushDeck = (cards: readonly RushCard[], seed: number): DeckState<RushCard> => createDeckState(cards, seed);
export const createEventDeck = (cards: readonly EventCard[], seed: number): DeckState<EventCard> => createDeckState(cards, seed);

export const drawBusCard = (deck: DeckState<BusCard>, seed: number): DrawResult<BusCard> => drawCard(deck, seed);
export const drawRushCard = (deck: DeckState<RushCard>, seed: number): DrawResult<RushCard> => drawCard(deck, seed);
export const drawEventCard = (deck: DeckState<EventCard>, seed: number): DrawResult<EventCard> => drawCard(deck, seed);

export const discardBusCard = (deck: DeckState<BusCard>, card: BusCard): DeckState<BusCard> => discardCard(deck, card);
export const discardRushCard = (deck: DeckState<RushCard>, card: RushCard): DeckState<RushCard> => discardCard(deck, card);
export const discardEventCard = (deck: DeckState<EventCard>, card: EventCard): DeckState<EventCard> => discardCard(deck, card);

export const initializeDecks = (catalog: DeckCatalog, seed: number): InitializedDecks => ({
  busDeck: createBusDeck(catalog.bus, seed + 11),
  rushDeck: createRushDeck(catalog.rush, seed + 23),
  eventDeck: createEventDeck(catalog.event ?? [], seed + 31),
});
