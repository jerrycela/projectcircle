import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.generateTextures();
    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }

  private generateTextures(): void {
    // player-body: 40x40 blue filled rectangle
    const playerBody = this.make.graphics({ x: 0, y: 0 }, false);
    playerBody.fillStyle(0x4444ff);
    playerBody.fillRect(0, 0, 40, 40);
    playerBody.generateTexture('player-body', 40, 40);
    playerBody.destroy();

    // player-weapon: 30x8 gray filled rectangle
    const playerWeapon = this.make.graphics({ x: 0, y: 0 }, false);
    playerWeapon.fillStyle(0x999999);
    playerWeapon.fillRect(0, 0, 30, 8);
    playerWeapon.generateTexture('player-weapon', 30, 8);
    playerWeapon.destroy();

    // enemy-spider: 30x30 dark red filled circle
    const enemySpider = this.make.graphics({ x: 0, y: 0 }, false);
    enemySpider.fillStyle(0x8b0000);
    enemySpider.fillCircle(15, 15, 15);
    enemySpider.generateTexture('enemy-spider', 30, 30);
    enemySpider.destroy();

    // floor-tile: 64x64 dark gray filled rectangle
    const floorTile = this.make.graphics({ x: 0, y: 0 }, false);
    floorTile.fillStyle(0x2c2c2c);
    floorTile.fillRect(0, 0, 64, 64);
    floorTile.generateTexture('floor-tile', 64, 64);
    floorTile.destroy();

    // wall-tile: 64x64 darker filled rectangle
    const wallTile = this.make.graphics({ x: 0, y: 0 }, false);
    wallTile.fillStyle(0x1a1a1a);
    wallTile.fillRect(0, 0, 64, 64);
    wallTile.generateTexture('wall-tile', 64, 64);
    wallTile.destroy();

    // loot-gold: 12x12 gold filled circle
    const lootGold = this.make.graphics({ x: 0, y: 0 }, false);
    lootGold.fillStyle(0xffcc00);
    lootGold.fillCircle(6, 6, 6);
    lootGold.generateTexture('loot-gold', 12, 12);
    lootGold.destroy();

    // loot-wood: 12x12 brown filled rectangle
    const lootWood = this.make.graphics({ x: 0, y: 0 }, false);
    lootWood.fillStyle(0x8b4513);
    lootWood.fillRect(0, 0, 12, 12);
    lootWood.generateTexture('loot-wood', 12, 12);
    lootWood.destroy();

    // loot-ore: 12x12 gray diamond shape (4 points)
    const lootOre = this.make.graphics({ x: 0, y: 0 }, false);
    lootOre.fillStyle(0x808080);
    lootOre.fillTriangle(6, 0, 12, 6, 6, 12);
    lootOre.fillTriangle(6, 0, 0, 6, 6, 12);
    lootOre.generateTexture('loot-ore', 12, 12);
    lootOre.destroy();

    // loot-cloth: 12x12 white triangle
    const lootCloth = this.make.graphics({ x: 0, y: 0 }, false);
    lootCloth.fillStyle(0xffffff);
    lootCloth.fillTriangle(6, 0, 12, 12, 0, 12);
    lootCloth.generateTexture('loot-cloth', 12, 12);
    lootCloth.destroy();

    // loot-health-orb: 14x14 red filled circle
    const lootHealthOrb = this.make.graphics({ x: 0, y: 0 }, false);
    lootHealthOrb.fillStyle(0xff0000);
    lootHealthOrb.fillCircle(7, 7, 7);
    lootHealthOrb.generateTexture('loot-health-orb', 14, 14);
    lootHealthOrb.destroy();

    // loot-equipment: 16x16 white bordered rectangle (2px border)
    const lootEquipment = this.make.graphics({ x: 0, y: 0 }, false);
    lootEquipment.lineStyle(2, 0xffffff);
    lootEquipment.strokeRect(1, 1, 14, 14);
    lootEquipment.generateTexture('loot-equipment', 16, 16);
    lootEquipment.destroy();

    // joystick-base: 120x120 circle, white, alpha 0.2
    const joystickBase = this.make.graphics({ x: 0, y: 0 }, false);
    joystickBase.fillStyle(0xffffff, 0.2);
    joystickBase.fillCircle(60, 60, 60);
    joystickBase.generateTexture('joystick-base', 120, 120);
    joystickBase.destroy();

    // joystick-thumb: 40x40 circle, white, alpha 0.5
    const joystickThumb = this.make.graphics({ x: 0, y: 0 }, false);
    joystickThumb.fillStyle(0xffffff, 0.5);
    joystickThumb.fillCircle(20, 20, 20);
    joystickThumb.generateTexture('joystick-thumb', 40, 40);
    joystickThumb.destroy();

    // attack-arc: 60x40 white arc shape (simple curved line)
    const attackArc = this.make.graphics({ x: 0, y: 0 }, false);
    attackArc.lineStyle(2, 0xffffff);
    attackArc.beginPath();
    attackArc.arc(30, 40, 35, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330), false);
    attackArc.strokePath();
    attackArc.generateTexture('attack-arc', 60, 40);
    attackArc.destroy();

    // altar: 48x48 white bordered circle
    const altar = this.make.graphics({ x: 0, y: 0 }, false);
    altar.lineStyle(3, 0xffffff);
    altar.strokeCircle(24, 24, 22);
    altar.generateTexture('altar', 48, 48);
    altar.destroy();
  }
}
