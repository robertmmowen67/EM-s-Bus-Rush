export const BOROUGHS = [
  "Manhattan",
  "Brooklyn",
  "Queens",
  "Bronx",
  "StatenIsland",
] as const;

export type Borough = (typeof BOROUGHS)[number];

export type CardType = "bus" | "rush" | "event" | "perk";
export type RestrictionKind = "limited" | "select";
export type RestrictionEffect =
  | "block_non_express_bus"
  | "block_express_bus"
  | "block_rush_cards";

export interface BaseCard {
  id: string;
  name: string;
  type: CardType;
  description?: string;
}

export interface BusCard extends BaseCard {
  type: "bus";
  borough: Borough;
  routeValue: number;
  tags?: string[];
}

export interface RushCard extends BaseCard {
  type: "rush";
  effectKey: string;
  tags?: string[];
}

export interface EventCard extends BaseCard {
  type: "event";
  effectKey: string;
  durationRounds?: number;
}

export interface PerkCard extends BaseCard {
  type: "perk";
  effectKey: string;
  isPersistent: boolean;
}

export type GameCard = BusCard | RushCard | EventCard | PerkCard;

export interface DeckState<TCard extends GameCard> {
  drawPile: TCard[];
  discardPile: TCard[];
}

export interface ActiveEvent {
  card: EventCard;
  roundsRemaining: number;
}

export interface PlayerRestriction {
  targetPlayerId: string;
  source: RestrictionKind;
  effect: RestrictionEffect;
  expiresAfterBusPlay: boolean;
}

export interface TaxiTripState {
  playerId: string;
  soloBorough: Borough;
  returnAfterRound: number;
}

export interface PlayerState {
  id: string;
  name: string;
  busHand: BusCard[];
  rushHand: RushCard[];
  activePerk?: PerkCard;
  scoreByBorough: Record<Borough, number>;
  totalScore: number;
  actionsRemaining: number;
}

export interface BonusRaceState {
  ownerPlayerId?: string;
  locked: boolean;
  countsByPlayerId: Record<string, number>;
}

export interface GameState {
  seed: number;
  players: PlayerState[];
  currentPlayerIndex: number;
  turn: number;
  round: number;
  currentBorough: Borough;
  actionsRemaining: number;
  busPlaysThisTurn: number;
  busPlaysAllowedThisTurn: number;
  rushTradeUsedThisTurn: boolean;
  busDeck: DeckState<BusCard>;
  rushDeck: DeckState<RushCard>;
  eventDeck: DeckState<EventCard>;
  activeEvents: ActiveEvent[];
  activeRestrictions: PlayerRestriction[];
  taxiTrip?: TaxiTripState;
  expressRider: BonusRaceState;
  queensBusRedesign: BonusRaceState;
  eventLog: string[];
}

export interface CreateGameInput {
  players: Array<{ id: string; name: string }>;
  seed?: number;
}

export const OUTER_BOROUGHS: Borough[] = ["Brooklyn", "Queens", "Bronx", "StatenIsland"];

export const createEmptyScore = (): Record<Borough, number> => ({
  Manhattan: 0,
  Brooklyn: 0,
  Queens: 0,
  Bronx: 0,
  StatenIsland: 0,
});

export const createBonusRaceState = (playerIds: readonly string[]): BonusRaceState => ({
  ownerPlayerId: undefined,
  locked: false,
  countsByPlayerId: Object.fromEntries(playerIds.map((id) => [id, 0])),
});
