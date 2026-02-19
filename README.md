# EM-s-Bus-Rush NYC Bus Rush — Web Game Prototype

A browser-based digital version of the transit strategy board game NYC Bus Rush, built using a deterministic game engine and a lightweight web UI.

This repository is structured so an AI coding agent (Codex) can implement the rules engine first, then layer on a playable interface.

🎯 Project goal (Phase 1)

Create a playable web MVP that allows 2–4 players to play NYC Bus Rush locally (hot-seat) with:

full rules enforcement

working Bus / Rush / Event / Perk systems

score tracking by borough

turn and round management

win condition detection

This phase prioritizes correct gameplay over visual polish.

🧠 Source of truth

All rules are defined in:

/spec/game-spec.md


The engine must follow this document exactly.

Original reference:

/rules/NYC Bus Rush Game Rulebook.pdf

🏗️ Tech approach
Engine-first architecture

The project is split into:

/engine  → deterministic rules engine (no UI assumptions)
/web     → React UI that consumes the engine
/spec    → rules spec Codex reads from
/rules   → original rulebook PDF


The engine must be fully testable independently of the UI.

⚙️ Stack

Engine

TypeScript

Node

Vitest or Jest

Web UI

React

Vite

TypeScript

No backend required for MVP.

🧱 Repository structure
/rules
  NYC Bus Rush Game Rulebook.pdf

/spec
  game-spec.md

/engine
  state.ts
  decks.ts
  moves.ts
  reducers.ts
  rules.test.ts

/web
  src/
    App.tsx
    GameBoard.tsx
    PlayerPanel.tsx
    ActionControls.tsx

🧩 Engine responsibilities

Codex should implement:

Game lifecycle

createGame(players, seed?)

applyMove(state, move)

endTurn(state)

checkWin(state)

Systems to implement

Bus cards

Rush cards

Event timing

Transit perks

Bonuses (Express Rider, Queens Bus Redesign)

Borough scoring

Restrictions (Limited/Select effects)

Taxi solo travel

2-round temporary event effects

Deck behavior

shuffle

draw

discard

reshuffle discard when Bus deck depletes

🖥️ UI responsibilities (MVP)

Minimal playable interface:

Must display

current group borough

current player + actions remaining

player hands (Bus + Rush)

score by borough

active perk

active event effects

event log

Must allow

play Bus card

play Rush card

trade

end turn

🧪 Testing requirements

Codex must write automated tests for:

win condition (14 points + ≥1 per borough)

borough validation for Bus play

event trigger every 2 rounds

Taxi return timing

Limited/Select restriction enforcement

Fare Inspector cancelling Fare Evader

Bus Lane timing rules

2-round event duration logic

perk activation and switching

🚀 First tasks for Codex
Task 1

Read /spec/game-spec.md and implement engine state models.

Task 2

Implement deck system (Bus, Rush, Event).

Task 3

Implement Bus card rules.

Task 4

Implement Rush card rules.

Task 5

Implement Events + round tracking.

Task 6

Implement Transit perks.

Task 7

Write rules test suite.

Task 8

Create minimal React UI wired to engine.

📌 Definition of “done” for MVP

The prototype is complete when:

a full game can be played in browser

rules are enforced automatically

events and perks function correctly

a winner is declared correctly

no manual rule interpretation is required

Visual polish, animation, and multiplayer come later.

🔮 Future phases

Phase 2

improved board visualization

card art

animations

sound

Phase 3

online multiplayer

accounts

matchmaking

Phase 4

mobile app packaging

👤 Maintainers

Game design: NYC Bus Rush creators

Engineering: Codex + human collaborators

## Current implementation status

The repository has been bootstrapped with:

- `spec/game-spec.md` current-scope spec for engine bootstrap and deck behavior.
- `engine/state.ts` for game state and card/deck models.
- `engine/decks.ts` for deterministic seeded deck operations.
- `engine/createGame.ts` for initial game-state creation with opening hands.
