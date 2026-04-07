import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    const assets = [
      'floor-tile', 'wall-tile',
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

  create(): void {
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }
}
