# NYC Bus Rush Game Specification (Current Scope)

This repository currently defines the **engine bootstrap scope** for deck/state behavior and Bus-card rule enforcement.

## Engine state requirements

- Deterministic game state model for 2-4 players.
- Card model types for Bus, Rush, Event, and Transit Perk cards.
- Player state stores Bus hand, Rush hand, and score by borough.
- Global game state tracks turn, round, current player, current borough, Bus deck, Rush deck, and event log.

## Bus and Rush deck system requirements

- Decks must support deterministic seeded shuffle.
- Decks must support draw and discard operations.
- If a draw is attempted on an empty draw pile and discard has cards, discard must be reshuffled into draw pile.
- If both draw pile and discard pile are empty, draw returns no card and state remains valid.
- Bus and Rush decks must each expose explicit deck helpers for create, draw, and discard.

## Bus card play rules

- A Bus card play must pass borough validation:
  - Standard play requires `card.borough === currentBorough`.
  - `Express` cards may move only between Manhattan and an outer borough (`Brooklyn`, `Queens`, `Bronx`, `StatenIsland`).
- A legal Bus play scores exactly `+1` point in the destination/current borough for the active player.
- Bus cards with `Limited` apply a one-turn restriction to the **next player**.
- Bus cards with `Select` apply a one-turn restriction to a **selected player**.
- Restriction model must support all of:
  - block Local/Limited/Select Bus plays (`block_non_express_bus`)
  - block Express Bus plays (`block_express_bus`)
  - block Rush card plays (`block_rush_cards`, enforcement may be implemented in later phase)
- Active restrictions must be enforced on that player's next Bus play attempt.
- Each borough has a maximum of 3 points per player.
- Bus scoring must not allow a player to exceed the borough cap.

## Turn model

- Each player turn begins with 2 actions available.
- Turn state must track `actionsRemaining` in game state.
- Playing a Bus card consumes 1 action.
- Some Rush cards consume both actions.
- Some Rush cards consume no actions.
- Turn ends when:
  - player chooses End Turn, or
  - actions reach 0.

## Rush card rules (trading + movement)

- Rush cards are played by the active player.
- Rush trading (once per turn; does not consume an action):
  - Trade Bus cards totaling 3 value -> draw 1 Rush card.
  - Trade 1 Rush card -> draw 2 Bus cards.
  - (Later: event/perk modifiers can change Rush trade cost.)

- Rush card effects:
  - Reroute (1 action): change one of your Bus cards to a different borough of your choice.
    - Rerouted Express cannot travel between two outer boroughs.
  - Bus Transfer (1 action): you may play 2 Bus cards in this turn.
  - Taxi (both actions): solo travel between any 2 boroughs.
    - Taxi player returns after 3 rounds, OR earlier if the group reaches their borough.
  - Take the Subway (both actions): travel between any 2 boroughs (except Staten Island).
  - Staten Island Ferry (0 actions): travel between Manhattan and Staten Island.
  - Commuter Rail (1 action): travel between Manhattan and any outer borough except Staten Island.
  - Interborough Express (1 action): travel between Bronx, Brooklyn, and Queens.

- `block_rush_cards` restrictions must prevent Rush card play.

## Validation expectations

- Re-running shuffle with the same seed must produce the same ordering.
- Draw should reduce draw pile size by one when a card is available.
- Reshuffle-on-depletion should occur exactly when draw pile is empty and discard has cards.
- Unit tests must cover legal and illegal Bus plays plus scoring outcomes.
- Unit tests must cover Rush action costs, movement legality, and Taxi return timing.

## Event deck runtime and timed modifiers

- Event deck must expose deterministic create/draw/discard helpers with the same reshuffle-on-depletion behavior as Bus and Rush decks.
- At the start of each new round (when turn order wraps), timed active events decrement by 1 round.
- Timed events with `roundsRemaining` reaching 0 expire immediately at round start and move to the Event discard pile.
- After round-start ticking, reveal exactly one Event card every 2 rounds (`round % 2 === 0`).
- Event cards with `durationRounds > 0` become active modifiers with matching `roundsRemaining`.
- Event cards without a positive duration resolve immediately and are discarded after resolution.
- Turn-start modifiers from active events apply for the incoming player after round advancement/reveal logic.
