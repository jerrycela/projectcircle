import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import { COMPANION_DEFS, COMPANION_CONFIG } from '../config';
import type { GameScene } from '../scenes/GameScene';
import { GOTHIC_COLORS, GOTHIC_FONTS, drawStoneFrame, drawStoneButton, drawGothicPanel } from './GothicTheme';

const PANEL_W = 420;
const PANEL_H = 700;

const TEXT_STYLE = GOTHIC_FONTS.BODY;

export class CompanionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;
  private currentView: 'overview' | 'detail' = 'overview';
  private selectedCompanionId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-companion-panel', this.show, this);
  }

  private show = (): void => {
    if (this.visible) return;
    this.visible = true;
    this.currentView = 'overview';
    EventBus.emit('ui-input-lock', true);
    EventBus.emit('gameplay-lock', true);
    this.renderOverview();
  };

  private renderOverview(): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.companionManager) { this.hide(); return; }

    this.container.removeAll(true);
    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    // Overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.7);
    this.container.add(overlay);

    // Panel
    const panelGfx = this.scene.add.graphics();
    drawGothicPanel(panelGfx, cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H);
    this.container.add(panelGfx);

    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;

    // Title
    const title = this.scene.add.text(cx, panelY + 14, 'Companions', {
      ...GOTHIC_FONTS.TITLE,
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Close button
    const closeBtn = this.scene.add.text(panelX + PANEL_W - 16, panelY + 10, 'X', {
      ...TEXT_STYLE, fontSize: '18px', color: '#ff4444',
    });
    closeBtn.setOrigin(0.5, 0);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.hide());
    this.container.add(closeBtn);

    // 5 companion slots
    const slotW = 70;
    const slotH = 90;
    const startX = cx - (slotW * 5 + 10 * 4) / 2 + slotW / 2;
    const slotY = panelY + 60;

    const companions = gameScene.companionManager.getAllCompanions();

    for (let i = 0; i < companions.length; i++) {
      const comp = companions[i];
      const sx = startX + i * (slotW + 10);

      const slotBg = this.scene.add.rectangle(sx, slotY + slotH / 2, slotW, slotH, GOTHIC_COLORS.STONE_DARK);
      slotBg.setStrokeStyle(1, comp.unlocked ? comp.def.themeColor : GOTHIC_COLORS.STONE_MID);
      this.container.add(slotBg);

      if (comp.unlocked) {
        const avatar = this.scene.add.graphics();
        avatar.fillStyle(comp.def.themeColor);
        avatar.fillCircle(sx, slotY + 25, 18);
        this.container.add(avatar);

        const name = this.scene.add.text(sx, slotY + 50, comp.def.name, {
          ...TEXT_STYLE, fontSize: '10px',
        });
        name.setOrigin(0.5, 0);
        this.container.add(name);

        // Affection bar
        const barW = 50;
        const barH = 6;
        const barX = sx - barW / 2;
        const barY = slotY + 65;
        const barBg = this.scene.add.rectangle(barX + barW / 2, barY + barH / 2, barW, barH, GOTHIC_COLORS.STONE_MID);
        this.container.add(barBg);

        const ratio = comp.affection / COMPANION_CONFIG.AFFECTION_CAP;
        if (ratio > 0) {
          const color = ratio < 0.5 ? 0x4488ff : ratio < 0.8 ? 0xff88aa : 0xffd700;
          const fill = this.scene.add.rectangle(barX + (barW * ratio) / 2, barY + barH / 2, barW * ratio, barH, color);
          this.container.add(fill);
        }

        slotBg.setInteractive({ useHandCursor: true });
        slotBg.on('pointerup', () => this.showDetail(comp.def.id));
      } else {
        const q = this.scene.add.text(sx, slotY + 30, '???', {
          ...TEXT_STYLE, fontSize: '14px', color: `#${GOTHIC_COLORS.STONE_PRESSED.toString(16).padStart(6, '0')}`,
        });
        q.setOrigin(0.5, 0.5);
        this.container.add(q);
      }
    }

    this.container.setVisible(true);
  }

  private showDetail(companionId: string): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.companionManager) return;

    this.currentView = 'detail';
    this.selectedCompanionId = companionId;
    this.container.removeAll(true);

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;
    const comp = gameScene.companionManager.getCompanion(companionId);
    const stage = gameScene.companionManager.getCurrentStage(companionId);
    const highestFloor = gameScene.floorManager.highestFloor;

    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.7);
    this.container.add(overlay);
    const panelGfx = this.scene.add.graphics();
    drawGothicPanel(panelGfx, cx - PANEL_W / 2, cy - PANEL_H / 2, PANEL_W, PANEL_H);
    this.container.add(panelGfx);
    // Colored accent border using theme color
    const accentBorder = this.scene.add.rectangle(cx, cy, PANEL_W - 4, PANEL_H - 4);
    accentBorder.setStrokeStyle(1, comp.def.themeColor);
    accentBorder.setFillStyle(0x000000, 0);
    this.container.add(accentBorder);

    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;

    // Back button
    const backBtn = this.scene.add.text(panelX + 16, panelY + 10, '< Back', {
      ...TEXT_STYLE, fontSize: '14px',
    });
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on('pointerup', () => this.renderOverview());
    this.container.add(backBtn);

    // Name + element
    const elementLabel = comp.def.element ?? 'None';
    const nameText = this.scene.add.text(cx, panelY + 14, `${comp.def.name} [${elementLabel}]`, {
      ...TEXT_STYLE, fontSize: '16px', color: `#${comp.def.themeColor.toString(16).padStart(6, '0')}`,
    });
    nameText.setOrigin(0.5, 0);
    this.container.add(nameText);

    // Portrait placeholder
    const portraitX = panelX + 20;
    const portraitY = panelY + 50;
    const portraitW = 180;
    const portraitH = 240;
    const stageLabels = ['Daily Outfit', 'Special Outfit', 'Full Portrait'];
    const stageAlphas = [0.3, 0.6, 1.0];
    const portraitStage = Math.max(0, stage - 1);

    if (stage > 0) {
      const portraitBg = this.scene.add.rectangle(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        portraitW, portraitH,
        comp.def.themeColor, stageAlphas[portraitStage],
      );
      portraitBg.setStrokeStyle(1, comp.def.themeColor);
      this.container.add(portraitBg);

      const portraitLabel = this.scene.add.text(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        stageLabels[portraitStage],
        { ...TEXT_STYLE, fontSize: '14px' },
      );
      portraitLabel.setOrigin(0.5, 0.5);
      this.container.add(portraitLabel);
    } else {
      const lockedBg = this.scene.add.rectangle(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        portraitW, portraitH, GOTHIC_COLORS.STONE_MID,
      );
      lockedBg.setStrokeStyle(1, GOTHIC_COLORS.STONE_MID);
      this.container.add(lockedBg);
      const lockText = this.scene.add.text(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        'Locked', { ...TEXT_STYLE, fontSize: '14px' },
      );
      lockText.setOrigin(0.5, 0.5);
      this.container.add(lockText);
    }

    // Affection bar (right side)
    const rightX = portraitX + portraitW + 20;
    const affBarY = portraitY + 10;
    const affBarW = 160;
    const affBarH = 16;

    const affLabel = this.scene.add.text(rightX, affBarY - 16, `Affection: ${comp.affection}/${COMPANION_CONFIG.AFFECTION_CAP}`, {
      ...TEXT_STYLE, fontSize: '11px',
    });
    this.container.add(affLabel);

    const affBarBg = this.scene.add.rectangle(rightX + affBarW / 2, affBarY + affBarH / 2, affBarW, affBarH, GOTHIC_COLORS.STONE_MID);
    this.container.add(affBarBg);
    const ratio = comp.affection / COMPANION_CONFIG.AFFECTION_CAP;
    if (ratio > 0) {
      const color = ratio < 0.17 ? 0x4488ff : ratio < 0.5 ? 0xff88aa : 0xffd700;
      const affFill = this.scene.add.rectangle(rightX + (affBarW * ratio) / 2, affBarY + affBarH / 2, affBarW * ratio, affBarH, color);
      this.container.add(affFill);
    }

    // 3 stage status
    let stageY = affBarY + 30;
    for (let s = 0; s < 3; s++) {
      const threshold = COMPANION_CONFIG.STAGE_THRESHOLDS[s];
      const floorGate = COMPANION_CONFIG.STAGE_FLOOR_GATES[s];
      const isUnlocked = stage > s;
      const meetsFloor = highestFloor >= floorGate;

      let statusText: string;
      let statusColor: string;
      if (isUnlocked) {
        statusText = `Stage ${s + 1}: Unlocked`;
        statusColor = '#00ff00';
      } else if (!meetsFloor) {
        statusText = `Stage ${s + 1}: Reach Floor ${floorGate}`;
        statusColor = '#ff6666';
      } else {
        const remaining = threshold - comp.affection;
        statusText = `Stage ${s + 1}: Need ${remaining} more`;
        statusColor = '#ffcc00';
      }

      const st = this.scene.add.text(rightX, stageY, statusText, {
        ...TEXT_STYLE, fontSize: '10px', color: statusColor,
      });
      this.container.add(st);
      stageY += 20;
    }

    // Gift area
    const giftY = portraitY + portraitH + 30;
    const atCap = comp.affection >= COMPANION_CONFIG.AFFECTION_CAP;

    const giftTitle = this.scene.add.text(panelX + 20, giftY, 'Send Gifts', {
      ...GOTHIC_FONTS.TITLE, fontSize: '14px',
    });
    this.container.add(giftTitle);

    const player = (gameScene as GameScene).player;

    // Token gift row
    this.createGiftRow(panelX + 20, giftY + 30, `${comp.def.tokenName}: ${comp.tokens}`, comp.tokens > 0 && !atCap, () => {
      gameScene.companionManager.gift(companionId, 'token', 1);
      this.showDetail(companionId);
    });

    // Token gift all
    this.createGiftRow(panelX + 20, giftY + 60, `Gift All Tokens (${comp.tokens})`, comp.tokens > 0 && !atCap, () => {
      gameScene.companionManager.gift(companionId, 'token', comp.tokens);
      this.showDetail(companionId);
    });

    // Gold gift
    this.createGiftRow(panelX + 20, giftY + 90, `Gold: ${player.gold} (Gift 100g)`, player.gold >= 100 && !atCap, () => {
      player.addGold(-100);
      gameScene.companionManager.gift(companionId, 'gold', 1);
      this.showDetail(companionId);
    });

    // Material gift
    const totalMats = player.materials.wood + player.materials.ore + player.materials.cloth;
    this.createGiftRow(panelX + 20, giftY + 120, `Material: W${player.materials.wood} O${player.materials.ore} C${player.materials.cloth} (Gift 1)`, totalMats > 0 && !atCap, () => {
      if (player.materials.wood > 0) { player.addMaterial('wood', -1); }
      else if (player.materials.ore > 0) { player.addMaterial('ore', -1); }
      else if (player.materials.cloth > 0) { player.addMaterial('cloth', -1); }
      gameScene.companionManager.gift(companionId, 'material', 1);
      this.showDetail(companionId);
    });

    this.container.setVisible(true);
  }

  private createGiftRow(x: number, y: number, label: string, enabled: boolean, onClick: () => void): void {
    const text = this.scene.add.text(x, y, `[Gift] ${label}`, {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: enabled ? '#d4c4a0' : `#${GOTHIC_COLORS.STONE_PRESSED.toString(16).padStart(6, '0')}`,
    });
    this.container.add(text);

    if (enabled) {
      text.setInteractive({ useHandCursor: true });
      text.on('pointerup', onClick);
    }
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('ui-input-lock', false);
    EventBus.emit('gameplay-lock', false);
  }

  destroy(): void {
    EventBus.off('show-companion-panel', this.show, this);
    this.container.destroy();
  }
}
