import Phaser from 'phaser';

// Loads LimeZu Modern Interiors (free) tiles/furniture + animated characters,
// plus the soft vignette overlay. Frames: characters are 16x32, direction order
// in the sheets is [left, up, right, down].
export const LZ_CHARS = ['Adam', 'Alex', 'Amelia', 'Bob'] as const;
export const LZ_DOGS = ['debt', 'stock', 'analytics', 'wake'] as const;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // абсолютный base от origin (без логина/пароля в URL) — fetch/загрузки не ломаются,
    // даже если страницу открыли по ссылке вида office:pass@host/office/
    this.load.setBaseURL(location.origin + import.meta.env.BASE_URL);
    const T = 'assets/tilesets/';
    const tiles = [
      'lz_floor', 'lz_wall', 'lz_wall_cap', 'lz_sofa', 'lz_plant_tall', 'lz_palm', 'lz_plant', 'lz_desk',
      'lz_window', 'lz_cabinet', 'lz_server', 'lz_globe',
      'rug_big', 'sign_board', 'poster_pink', 'hanging_plant', 'vignette', 'lz_shelf_cosmetics', 'lz_table_plain', 'lz_dog_bed',
    ];
    for (const t of tiles) this.load.image(t, `${T}${t}.png`);

    // собачки-агенты (2 кадра трусцой)
    for (const d of LZ_DOGS) this.load.spritesheet(`lz_dog_${d}`, `${T}lz_dog_${d}.png`, { frameWidth: 16, frameHeight: 16 });

    const LZ = 'assets/limezu/Characters_free/';
    for (const n of LZ_CHARS) {
      this.load.spritesheet(`lz_${n}_idle`, `${LZ}${n}_idle_16x16.png`, { frameWidth: 16, frameHeight: 32 });
      this.load.spritesheet(`lz_${n}_run`, `${LZ}${n}_run_16x16.png`, { frameWidth: 16, frameHeight: 32 });
      this.load.spritesheet(`lz_${n}_sit`, `${LZ}${n}_sit_16x16.png`, { frameWidth: 16, frameHeight: 32 });
    }
  }

  create() {
    this.scene.start('Office');
  }
}
