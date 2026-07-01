import { TypingGame } from './TypingGame.js';
import { bootstrapGame } from '../shared/engine/bootstrap.js';

/**
 * Entry point of the Typing page.
 *
 * `autoStart: false`: the timer only starts on the player's first keystroke.
 */
bootstrapGame('typingGame', () => new TypingGame({ timeLimit: 60 }), {
  autoStart: false,
});
