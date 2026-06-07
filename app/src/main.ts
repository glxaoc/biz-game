import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { OfficeScene } from './scenes/OfficeScene';

export const TILE = 16;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0c0f14',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: { antialias: false },
  // Use setTimeout instead of requestAnimationFrame so the game still boots and
  // runs when the tab/preview is hidden (RAF is paused on hidden tabs, which
  // otherwise stalls Phaser boot before the canvas is ever sized).
  fps: { forceSetTimeOut: true },
  scene: [BootScene, OfficeScene],
});

// Dev-only handle for snapshotting/debugging from the preview console.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;

// Prevent stacked WebGL contexts during Vite HMR: tear down on dispose.
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.destroy(true));
}

export default game;
