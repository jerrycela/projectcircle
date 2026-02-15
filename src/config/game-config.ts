import Phaser from 'phaser'
import { BootScene } from '../scenes/BootScene'
import { MenuScene } from '../scenes/MenuScene'
import { DungeonScene } from '../scenes/DungeonScene'
import { UIScene } from '../scenes/UIScene'
import { OverviewScene } from '../scenes/OverviewScene'
import { GAME_WIDTH, GAME_HEIGHT } from './constants'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0a0a14',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, DungeonScene, UIScene, OverviewScene],
}
