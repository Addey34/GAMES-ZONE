/**
 * Generic turn-based, N-player game model — the turn-based counterpart of
 * {@link GameEngine} (which targets real-time games like Snake or Pong).
 *
 * A board game supplies only its **rules** through {@link TurnRules}: an opaque
 * game `State`, the set of `Move`s legal for the player whose turn it is, and a
 * pure reducer that advances the state. Everything reusable across board games —
 * seat rotation, filling empty seats with bots, and (Tranche 2) the
 * host-authoritative networking over `net/match.ts` — lives on top of this and
 * never needs to know a game's specific rules.
 *
 * Keeping `State`/`Move` pure (no DOM, no time) makes the rules unit-testable in
 * isolation, exactly like `levels.ts` or the bot views.
 */

/** A player position at the table, `0 .. seats-1` (clockwise). */
export type Seat = number;

/**
 * The complete, game-specific rule set. `S` is the board state, `M` a single
 * move (e.g. "bring a pawn out", "advance pawn #2"). All methods are pure.
 */
export interface TurnRules<S, M> {
  /** Number of seats (players) at the table. */
  readonly seats: number;
  /** A fresh game (pawns home, first seat to play, etc.). */
  initialState(): S;
  /** Whose turn it is in this state. */
  currentSeat(state: S): Seat;
  /** Every move the current seat may legally play (empty = must pass). */
  legalMoves(state: S): M[];
  /** The state after playing `move` (assumed legal); never mutates `state`. */
  applyMove(state: S, move: M): S;
  /** The winning seat, or `null` while the game is still running. */
  winner(state: S): Seat | null;
}

/**
 * A turn-based opponent: chooses one move among the legal ones for the seat to
 * play. The host runs one per non-human seat (and, in solo, for every other
 * seat). This is the turn-based analogue of the real-time bots' target helpers.
 */
export interface TurnBot<S, M> {
  decideMove(state: S, legalMoves: M[]): M;
}

/** The next seat clockwise, wrapping around the table. */
export function nextSeat(seat: Seat, seats: number): Seat {
  return (seat + 1) % seats;
}

/** Whether the game has ended (some seat has won). */
export function isOver<S, M>(rules: TurnRules<S, M>, state: S): boolean {
  return rules.winner(state) !== null;
}

/**
 * Applies `move` only if it is currently legal, returning the new state — or
 * `null` if the game is over or the move is not in `legalMoves`. The gate the
 * host uses before trusting a (possibly remote or bot) move, so an illegal or
 * out-of-turn action can never corrupt the authoritative state.
 *
 * @param eq Equality for moves (moves are small value objects per game).
 */
export function tryMove<S, M>(
  rules: TurnRules<S, M>,
  state: S,
  move: M,
  eq: (a: M, b: M) => boolean
): S | null {
  if (rules.winner(state) !== null) return null;
  const legal = rules.legalMoves(state).some((m) => eq(m, move));
  return legal ? rules.applyMove(state, move) : null;
}
