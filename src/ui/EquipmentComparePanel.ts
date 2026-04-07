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
import { GOTHIC_COLORS, GOTHIC_FONTS, drawStoneFrame, drawStoneButton, drawGothicPanel } from './GothicTheme';

const PANEL_W = 400;
const PANEL_H = 360;
const CARD_W = 175;
const CARD_H = 240;
const CARD_GAP = 10;
const BTN_W = 140;
const BTN_H = 44;

const TEXT_STYLE = GOTHIC_FONTS.BODY;

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
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.7);
    this.container.add(overlay);

    // Panel background
    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;
    const panelGfx = this.scene.add.graphics();
    drawGothicPanel(panelGfx, panelX, panelY, PANEL_W, PANEL_H);
    this.container.add(panelGfx);

    // Title
    const title = this.scene.add.text(cx, panelY + 16, 'Equipment Compare', {
      ...GOTHIC_FONTS.TITLE,
      fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Slot label
    const slotLabel = this.scene.add.text(cx, panelY + 38, EQUIPMENT_SLOT_LABELS[newItem.slot], {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: `#${GOTHIC_COLORS.STONE_PRESSED.toString(16).padStart(6, '0')}`,
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
    this.createButton(cx - BTN_W / 2 - 10, btnsY, 'Equip', 'gold', () => {
      gameScene.equipmentManager.equip(newItem);
      loot.collect();
      this.hide();
    });
    this.createButton(cx + BTN_W / 2 + 10, btnsY, 'Discard', 'blood', () => {
      loot.collect();
      this.hide();
    });

    this.container.setVisible(true);
  };

  private createCard(cx: number, topY: number, item: EquipmentItem | null, label: string): void {
    const rarityColor = item ? EQUIPMENT_RARITY_DEFS[item.rarity].color : GOTHIC_COLORS.STONE_MID;

    // Card background
    const cardX = cx - CARD_W / 2;
    const cardGfx = this.scene.add.graphics();
    cardGfx.fillStyle(GOTHIC_COLORS.STONE_DARK);
    cardGfx.fillRect(cardX, topY, CARD_W, CARD_H);
    drawStoneFrame(cardGfx, cardX, topY, CARD_W, CARD_H);
    cardGfx.lineStyle(2, rarityColor);
    cardGfx.strokeRect(cardX + 1, topY + 1, CARD_W - 2, CARD_H - 2);
    this.container.add(cardGfx);

    // Label (Equipped / New Drop)
    const headerText = this.scene.add.text(cx, topY + 8, label, {
      ...TEXT_STYLE,
      fontSize: '10px',
      color: `#${GOTHIC_COLORS.STONE_PRESSED.toString(16).padStart(6, '0')}`,
    });
    headerText.setOrigin(0.5, 0);
    this.container.add(headerText);

    if (!item) {
      const emptyText = this.scene.add.text(cx, topY + CARD_H / 2, 'None', {
        ...TEXT_STYLE,
        color: `#${GOTHIC_COLORS.STONE_MID.toString(16).padStart(6, '0')}`,
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
        color: `#${GOTHIC_COLORS.STONE_PRESSED.toString(16).padStart(6, '0')}`,
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

  private createButton(cx: number, cy: number, label: string, style: 'gold' | 'blood', callback: () => void): void {
    const btnX = cx - BTN_W / 2;
    const btnY = cy - BTN_H / 2;

    const btnGfx = this.scene.add.graphics();
    drawStoneButton(btnGfx, btnX, btnY, BTN_W, BTN_H, false);
    btnGfx.setInteractive(new Phaser.Geom.Rectangle(btnX, btnY, BTN_W, BTN_H), Phaser.Geom.Rectangle.Contains);

    const textColor = style === 'gold'
      ? `#${GOTHIC_COLORS.TEXT_GOLD.toString(16).padStart(6, '0')}`
      : `#${GOTHIC_COLORS.TEXT_BLOOD.toString(16).padStart(6, '0')}`;

    const btnText = this.scene.add.text(cx, cy, label, {
      ...GOTHIC_FONTS.BODY,
      fontSize: '14px',
      color: textColor,
    });
    btnText.setOrigin(0.5, 0.5);

    btnGfx.on('pointerdown', () => {
      btnGfx.clear();
      drawStoneButton(btnGfx, btnX, btnY, BTN_W, BTN_H, true);
    });
    btnGfx.on('pointerup', () => {
      btnGfx.clear();
      drawStoneButton(btnGfx, btnX, btnY, BTN_W, BTN_H, false);
      callback();
    });
    btnGfx.on('pointerout', () => {
      btnGfx.clear();
      drawStoneButton(btnGfx, btnX, btnY, BTN_W, BTN_H, false);
    });

    this.container.add([btnGfx, btnText]);
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
