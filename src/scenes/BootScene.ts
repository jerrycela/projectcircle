import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const assets = [
      'floor-tile', 'floor-tile-v2', 'wall-tile', 'wall-top', 'wall-face',
      'floor-debris-01', 'floor-debris-02',
      'globe-frame', 'skill-frame', 'hud-bg', 'card-bg',
      'player-body', 'player-weapon',
      'weapon-axe', 'weapon-sword', 'weapon-hammer',
      'enemy-spider', 'enemy-goblin', 'enemy-bat',
      'enemy-skel-sword', 'enemy-skel-shield', 'enemy-skel-summoner',
      'enemy-warden',
      'loot-gold', 'loot-wood', 'loot-ore', 'loot-cloth',
      'loot-health-orb', 'loot-equipment', 'loot-token',
      'altar', 'staircase',
      'attack-arc',
    ];
    for (const key of assets) {
      this.load.image(key, `assets/${key}.png`);
    }
  }

  async create(): Promise<void> {
    // Wait for gothic font to load (3s timeout fallback to monospace)
    await Promise.race([
      document.fonts.load('16px "Pirata One"'),
      new Promise(resolve => setTimeout(resolve, 3000)),
    ]);
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
