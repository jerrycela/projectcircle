# 009 — Visual Hotfix A.1: Lighting, Fog, DPad

## Overview

Gothic Visual Overhaul v2 (008) 已部署，但三個問題嚴重影響遊戲體驗：
1. **光源階梯感**：FogOfWar 的 3-step erase brush 產生明顯的同心圓邊界，不像漸層光照
2. **暗區全黑**：`FOG_ALPHA=0.95` + floor tint `0x3a3228` 導致光圈外材質完全不可見
3. **DPad 過小**：`KEY_SIZE=36` 在 450px 寬螢幕上不到 21% 寬，拇指操作困難

## Constraints

- 僅修改渲染參數與繪製邏輯，不動遊戲邏輯/資料結構
- 使用 Phaser RenderTexture erase 機制（不引入 CanvasTexture），確保 WebGL/Canvas 雙模式相容
- 改動規模：~80 行差異，3 檔案 → 走小型流程

---

## Fix 1 — 平滑光源漸層（P0）

### 問題分析

`FogOfWar.ts:25-35` 用 3 個不同半徑的 `fillCircle` 疊加 erase：
- 外圈 `r` @ alpha 0.35
- 中圈 `r*0.6` @ alpha 0.35
- 內圈 `r*0.3` @ alpha 0.25

三步之間的 alpha 落差過大，在暗背景上形成明顯的亮度階梯。

### 解法

將 playerBrush 從 3 步改為 **10 步等距漸層**。每步半徑從 `r` 線性遞減到 `r*0.15`，alpha 遞增使累積 erase 效果在中心趨近全透明。

```
步驟計算邏輯（playerBrush 建構時）：
  const STEPS = 10;
  for (let i = 0; i < STEPS; i++) {
    const t = i / (STEPS - 1);           // 0.0 → 1.0
    const stepRadius = r * (1 - t * 0.85); // r → r*0.15
    const stepAlpha = 0.06 + t * 0.14;     // 0.06 → 0.20
    brush.fillStyle(0xffffff, stepAlpha);
    brush.fillCircle(r, r, stepRadius);
  }
```

累積 erase 效果：
- 邊緣（只被最外圈覆蓋）：erase ~0.06 → 殘餘暗度 ~0.89 × FOG_ALPHA
- 中間地帶（被多圈覆蓋）：累積 erase → 殘餘暗度逐步降低
- 中心（被全部 10 圈覆蓋）：累積 erase ~0.95+ → 幾乎全透明

torchBrush 同理，改為 **8 步**（半徑較小，不需要同等精細度）。

### 效能考量

每步只是多一個 `fillCircle` 在預建的 Graphics brush 上，brush 建構只在 constructor 執行一次。每幀的 `rt.erase()` 呼叫次數不變（仍是 1 次 player + N 次 torch），只是 brush 本身更精細。效能影響可忽略。

---

## Fix 2 — 降低暗區不透明度（P0）

### 變更

| 參數 | 原值 | 新值 | 位置 |
|------|------|------|------|
| `FOG_ALPHA` | 0.95 | 0.85 | `FogOfWar.ts:6` |
| Floor tile tint | `0x3a3228` | `0x4a4238` | `GameScene.ts:145` |

效果：暗區從「純黑」變為「能隱約看見地板紋理」，配合光源漸層邊緣的低 alpha erase，形成自然的明暗過渡。

### 為什麼兩個都要改

- 只降 FOG_ALPHA：地板本身太暗，0.85 的霧下仍幾乎看不到
- 只提亮 tint：光圈內會過亮，失去哥德式氛圍
- 兩者搭配：暗區「隱約可見」但不亮，光圈內保持溫暖的對比度

---

## Fix 3 — DPad 放大（P1）

### 變更

| 參數 | 原值 | 新值 | 位置 |
|------|------|------|------|
| `KEY_SIZE` | 36 | 50 | `DPad.ts:6` |
| `CENTER_SIZE` | 18 | 24 | `DPad.ts:7` |
| `arrowSize` | 5 | 9 | `DPad.ts:207` |
| `touchPad` | 4 | 6 | `DPad.ts:56` |

整體 DPad bounding box：`50*2 + 24 + 2*2 = 128px`（原 94px），佔螢幕寬 28.4%。

觸控區：每個按鍵 `50 + 6*2 = 62px`，遠超 Apple HIG 44pt 最小標準。

### DPad Y 位置

`cy` 維持 750（距螢幕底部 50px）。新 DPad 上緣會到 `750 - 50 - 2 - 50/2 = 673px`，不會遮擋 HUD globe（globe center ~680px）。需確認不衝突。

若衝突，將 `cy` 下移到 755。

---

## Acceptance Criteria

| AC | 描述 | 驗證方法 |
|----|------|----------|
| AC-01 | 玩家光源從中心到邊緣呈平滑漸層，無明顯同心圓階梯 | agent-browser 截圖，目視檢查光照邊緣 |
| AC-02 | 火把光源同樣呈平滑漸層 | 導航到有火把的房間截圖 |
| AC-03 | 光圈外暗區能隱約看見地板石板紋理（非純黑） | 截圖暗區，確認地板 texture 可辨識 |
| AC-04 | 光圈內地板不會過亮、保持哥德式氛圍 | 截圖光圈中心，對比修改前 |
| AC-05 | DPad 按鍵視覺尺寸明顯放大，箭頭清晰可見 | 截圖 DPad 區域 |
| AC-06 | DPad 觸控區 >= 56px（測量 hitTest 範圍） | 程式碼審查 KEY_SIZE + touchPad*2 |
| AC-07 | DPad 不與 HUD globe 重疊 | 截圖底部 UI 全景 |
| AC-08 | TypeScript 編譯通過 `npx tsc --noEmit` | 執行指令 |
| AC-09 | 生產建置通過 `npm run build` | 執行指令 |
| AC-10 | 原有遊戲功能無回歸（戰鬥、拾取、祭壇、樓梯） | 玩 2 層驗證 |

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/effects/FogOfWar.ts` | playerBrush 3→10 步, torchBrush 3→8 步, FOG_ALPHA 0.95→0.85 |
| `src/ui/DPad.ts` | KEY_SIZE 36→50, CENTER_SIZE 18→24, arrowSize 5→9, touchPad 4→6 |
| `src/scenes/GameScene.ts` | Floor tint 0x3a3228→0x4a4238 (line 145) |

### Not Changed
- FogOfWar warm overlay（已在 008 調整過，目前數值合理）
- Vignette（008 已調整）
- 任何遊戲邏輯

---

## Risks

| Risk | Mitigation |
|------|------------|
| 10-step brush 在低階裝置影響效能 | Brush 只建構一次，erase 呼叫數不變；若有問題可降到 6 步 |
| FOG_ALPHA 0.85 讓未探索區域「太亮」失去恐懼感 | 0.85 仍是相當暗的值；配合 vignette（0.65 max alpha）角落依然深黑 |
| DPad 放大後遮擋畫面 | 128px 佔 28% 寬，底部區域本來就是 UI 區，可接受 |
