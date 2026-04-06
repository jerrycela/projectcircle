import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_RARITY_DEFS,
  EQUIPMENT_SLOT_LABELS,
} from '../config';
import type { EquipmentSlot } from '../config';
import type { GameScene } from '../scenes/GameScene';

const PANEL_W = 380;
const PANEL_H = 400;
const ROW_H = 80;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '12px',
  color: '#ffffff',
  fontFamily: 'monospace',
};

const STAT_LABELS: Record<string, string> = {
  attackMin: 'ATK Min',
  attackMax: 'ATK Max',
  armor: 'Armor',
  maxHp: 'Max HP',
  critChance: 'Crit %',
  critDamage: 'Crit DMG',
  recovery: 'Regen',
  moveSpeed: 'Speed',
};

function formatStatValue(key: string, value: number): string {
  if (key === 'critChance') return `${(value * 100).toFixed(1)}%`;
  if (key === 'critDamage') return `${(value * 100).toFixed(0)}%`;
  if (key === 'recovery') return value.toFixed(1);
  return String(Math.round(value));
}

export class EquipmentPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-equipment-panel', this.show, this);
  }

  private show = (): void => {
    if (this.visible) return;
    this.visible = true;

    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.equipmentManager) return;

    EventBus.emit('ui-input-lock', true);
    EventBus.emit('gameplay-lock', true);

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    this.container.removeAll(true);

    // Overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);

    // Panel
    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, 0x444444);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(cx, panelY + 14, 'My Equipment', {
      ...TEXT_STYLE,
      fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Close button
    const closeBtn = this.scene.add.text(panelX + PANEL_W - 16, panelY + 10, 'X', {
      ...TEXT_STYLE,
      fontSize: '18px',
      color: '#ff4444',
    });
    closeBtn.setOrigin(0.5, 0);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.hide());
    this.container.add(closeBtn);

    // Equipment rows
    let rowY = panelY + 44;
    for (const slot of EQUIPMENT_SLOTS) {
      this.createRow(panelX + 10, rowY, PANEL_W - 20, slot, gameScene);
      rowY += ROW_H + 4;
    }

    this.container.setVisible(true);
  };

  private createRow(x: number, y: number, width: number, slot: EquipmentSlot, gameScene: GameScene): void {
    const item = gameScene.equipmentManager.getEquipped(slot);
    const rarityColor = item ? EQUIPMENT_RARITY_DEFS[item.rarity].color : 0x444444;

    // Row background
    const rowBg = this.scene.add.rectangle(x + width / 2, y + ROW_H / 2, width, ROW_H, 0x1a1a1a);
    rowBg.setStrokeStyle(1, rarityColor);
    this.container.add(rowBg);

    // Slot label
    const slotText = this.scene.add.text(x + 10, y + 6, `[${EQUIPMENT_SLOT_LABELS[slot]}]`, {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: '#888888',
    });
    this.container.add(slotText);

    if (!item) {
      const emptyText = this.scene.add.text(x + 100, y + 6, '(empty)', {
        ...TEXT_STYLE,
        color: '#555555',
      });
      this.container.add(emptyText);
      return;
    }

    // Item name
    const nameText = this.scene.add.text(x + 100, y + 6, item.name, {
      ...TEXT_STYLE,
      fontSize: '13px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    this.container.add(nameText);

    // Stats summary
    const statParts: string[] = [];
    for (const [key, value] of Object.entries(item.stats)) {
      if (value === undefined) continue;
      statParts.push(`${STAT_LABELS[key] ?? key}+${formatStatValue(key, value)}`);
    }
    const statsText = this.scene.add.text(x + 10, y + 28, statParts.join('  '), {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: '#cccccc',
    });
    this.container.add(statsText);

    // Unequip button
    const unequipBtn = this.scene.add.text(x + width - 30, y + 6, 'X', {
      ...TEXT_STYLE,
      fontSize: '16px',
      color: '#ff6666',
    });
    unequipBtn.setOrigin(0.5, 0);
    unequipBtn.setInteractive({ useHandCursor: true });
    unequipBtn.on('pointerup', () => {
      gameScene.equipmentManager.unequip(slot);
      this.hide();
      this.show();
    });
    this.container.add(unequipBtn);
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('ui-input-lock', false);
    EventBus.emit('gameplay-lock', false);
  }

  destroy(): void {
    EventBus.off('show-equipment-panel', this.show, this);
    this.container.destroy();
  }
}
