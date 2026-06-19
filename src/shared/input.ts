/**
 * Une des quatre directions cardinales utilisées par les jeux à grille.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Vecteur 2D entier (coordonnées de grille).
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Déplacement unitaire associé à chaque direction (origine en haut à gauche,
 * `y` croissant vers le bas).
 */
export const DIRECTION_DELTAS: Record<Direction, Vec2> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Direction opposée à une direction donnée (utile pour interdire les demi-tours).
 */
export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * Table de correspondance touche clavier → direction (flèches et ZQSD/WASD).
 */
const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  // WASD (clavier QWERTY) et ZQSD (clavier AZERTY) : mêmes directions.
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  z: 'up',
  q: 'left',
};

/**
 * Convertit un événement clavier en direction.
 *
 * @returns La direction correspondante, ou `null` si la touche n'en est pas une.
 */
export function keyboardDirection(event: KeyboardEvent): Direction | null {
  // event.key peut être en majuscule (Shift/Verr.Maj) : on normalise en minuscule
  // pour que W/Z/Q/S/A/D fonctionnent aussi.
  return KEY_TO_DIRECTION[event.key] ?? KEY_TO_DIRECTION[event.key.toLowerCase()] ?? null;
}

/**
 * Options du détecteur de swipe tactile.
 */
export interface SwipeOptions {
  /** Déplacement minimal (px) pour qu'un geste compte comme swipe (défaut : 30). */
  threshold?: number;
  /** Appelé avec la direction d'un swipe validé. */
  onSwipe: (direction: Direction) => void;
  /** Appelé pour un simple tap (déplacement sous le seuil), si fourni. */
  onTap?: () => void;
}

/**
 * Câble la détection de swipe (et de tap) sur un élément, pour rendre les jeux à
 * directions jouables au doigt sur mobile.
 *
 * Unifie souris et tactile via les Pointer Events ; pendant le geste, le
 * défilement/zoom natif du navigateur est neutralisé sur la cible
 * (`touch-action: none`) et le pointeur est capturé pour recevoir le relâchement
 * même si le doigt quitte l'élément.
 *
 * @returns Fonction de nettoyage retirant les écouteurs et restaurant le style.
 */
export function setupSwipe(target: HTMLElement, options: SwipeOptions): () => void {
  const threshold = options.threshold ?? 30;
  let startX = 0;
  let startY = 0;
  let tracking = false;

  const previousTouchAction = target.style.touchAction;
  target.style.touchAction = 'none';

  const onPointerDown = (event: PointerEvent): void => {
    tracking = true;
    startX = event.clientX;
    startY = event.clientY;
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Capture indisponible (pointeur déjà relâché) : sans gravité.
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!tracking) return;
    tracking = false;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) < threshold) {
      options.onTap?.();
      return;
    }

    if (absX > absY) {
      options.onSwipe(dx > 0 ? 'right' : 'left');
    } else {
      options.onSwipe(dy > 0 ? 'down' : 'up');
    }
  };

  const onPointerCancel = (): void => {
    tracking = false;
  };

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);

  return () => {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointerup', onPointerUp);
    target.removeEventListener('pointercancel', onPointerCancel);
    target.style.touchAction = previousTouchAction;
  };
}
