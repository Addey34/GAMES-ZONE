/**
 * Versus primitives shared by 1-v-1 games.
 *
 * A versus game has exactly one opponent paddle/side whose driver varies:
 *  - `solo`  : driven locally by a bot;
 *  - `host`  : this client is authoritative — it simulates the ball + scores and
 *    broadcasts them, while reading the guest's input off the network;
 *  - `guest` : this client only sends its own input and renders the state the
 *    host broadcasts.
 *
 * Keeping the role in one shared type lets the networking layer (net/match.ts) and
 * the games agree on who simulates what, so a new versus game reuses the same
 * vocabulary instead of reinventing it.
 */
export type VersusRole = 'solo' | 'host' | 'guest';
