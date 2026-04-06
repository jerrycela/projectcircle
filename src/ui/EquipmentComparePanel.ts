import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import type { EquipmentItem } from '../config';
import {
  EQUIPMENT_RARITY_DEFS,
  EQUIPMENT_SLOT_LABELS,
  WEAPON_TYPE_DEFS,
} from '../config';
import type { Loot } from '../entities/Loot';
import type { GameScene } from '../scenes/GameScene';

const PANEL_W = 400;
const PANEL_H = 360;
const CARD_W = 175;
const CARD_H = 240;
const CARD_GAP = 10;
const BTN_W = 140;
const BTN_H = 44;

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

export class EquipmentComparePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-equipment-compare', this.show, this);
  }

  private show = (newItem: EquipmentItem, loot: Loot): void => {
    if (this.visible) return;
    this.visible = true;

    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    const equipped = gameScene?.equipmentManager?.getEquipped(newItem.slot) ?? null;

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    this.container.removeAll(true);

    // Background overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);

    // Panel background
    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, 0x444444);
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(cx, panelY + 16, 'Equipment Compare', {
      ...TEXT_STYLE,
      fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Slot label
    const slotLabel = this.scene.add.text(cx, panelY + 38, EQUIPMENT_SLOT_LABELS[newItem.slot], {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: '#aaaaaa',
    });
    slotLabel.setOrigin(0.5, 0);
    this.container.add(slotLabel);

    // Cards
    const cardsY = panelY + 58;
    const leftX = cx - CARD_GAP / 2 - CARD_W / 2;
    const rightX = cx + CARD_GAP / 2 + CARD_W / 2;

    this.createCard(leftX, cardsY, equipped, 'Equipped');
    this.createCard(rightX, cardsY, newItem, 'New Drop');

    // Buttons
    const btnsY = cardsY + CARD_H + 16;
    this.createButton(cx - BTN_W / 2 - 10, btnsY, 'Equip', 0x006600, () => {
      gameScene.equipmentManager.equip(newItem);
      loot.collect();
      this.hide();
    });
    this.createButton(cx + BTN_W / 2 + 10, btnsY, 'Discard', 0x660000, () => {
      loot.collect();
      this.hide();
    });

    this.container.setVisible(true);
  };

  private createCard(cx: number, topY: number, item: EquipmentItem | null, label: string): void {
    const rarityColor = item ? EQUIPMENT_RARITY_DEFS[item.rarity].color : 0x444444;

    // Card background
    const cardBg = this.scene.add.rectangle(cx, topY + CARD_H / 2, CARD_W, CARD_H, 0x222222);
    cardBg.setStrokeStyle(2, rarityColor);
    this.container.add(cardBg);

    // Label (Equipped / New Drop)
    const headerText = this.scene.add.text(cx, topY + 8, label, {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: '#888888',
    });
    headerText.setOrigin(0.5, 0);
    this.container.add(headerText);

    if (!item) {
      const emptyText = this.scene.add.text(cx, topY + CARD_H / 2, 'None', {
        ...TEXT_STYLE,
        color: '#666666',
      });
      emptyText.setOrigin(0.5, 0.5);
      this.container.add(emptyText);
      return;
    }

    // Item name
    const nameText = this.scene.add.text(cx, topY + 26, item.name, {
      ...TEXT_STYLE,
      fontSize: '13px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    nameText.setOrigin(0.5, 0);
    this.container.add(nameText);

    // Rarity label
    const rarityLabel = this.scene.add.text(cx, topY + 44, EQUIPMENT_RARITY_DEFS[item.rarity].label, {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: `#${rarityColor.toString(16).padStart(6, '0')}`,
    });
    rarityLabel.setOrigin(0.5, 0);
    this.container.add(rarityLabel);

    // Weapon subtype
    if (item.slot === 'weapon' && WEAPON_TYPE_DEFS[item.subtype]) {
      const wtd = WEAPON_TYPE_DEFS[item.subtype];
      const subtypeText = this.scene.add.text(cx, topY + 58, `${wtd.label} | SPD ${wtd.attackSpeedMult}x RNG ${wtd.rangeMult}x DMG ${wtd.damageMult}x`, {
        ...TEXT_STYLE,
        fontSize: '9px',
        color: '#aaaaaa',
      });
      subtypeText.setOrigin(0.5, 0);
      this.container.add(subtypeText);
    }

    // Stats
    let statY = item.slot === 'weapon' ? topY + 76 : topY + 62;
    for (const [key, value] of Object.entries(item.stats)) {
      if (value === undefined) continue;
      const display = `${STAT_LABELS[key] ?? key}: +${formatStatValue(key, value)}`;
      const statText = this.scene.add.text(cx - CARD_W / 2 + 12, statY, display, {
        ...TEXT_STYLE,
        fontSize: '11px',
      });
      statText.setOrigin(0, 0);
      this.container.add(statText);
      statY += 16;
    }
  }

  private createButton(cx: number, cy: number, label: string, color: number, callback: () => void): void {
    const btn = this.scene.add.rectangle(cx, cy, BTN_W, BTN_H, color);
    btn.setStrokeStyle(1, 0xffffff);
    btn.setInteractive({ useHandCursor: true });

    const btnText = this.scene.add.text(cx, cy, label, {
      ...TEXT_STYLE,
      fontSize: '14px',
    });
    btnText.setOrigin(0.5, 0.5);

    btn.on('pointerdown', () => {
      btn.setScale(0.95);
    });
    btn.on('pointerup', () => {
      btn.setScale(1);
      callback();
    });
    btn.on('pointerout', () => {
      btn.setScale(1);
    });

    this.container.add([btn, btnText]);
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('equipment-compare-done');
  }

  destroy(): void {
    EventBus.off('show-equipment-compare', this.show, this);
    this.container.destroy();
  }
}
