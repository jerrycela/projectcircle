# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Dark Dungeon RPG

## 專案概述
Diablo I 風格 2D 俯視角地牢探索 RPG。Phaser 3 + Arcade Physics + Vite + TypeScript。
直式 450x800 佈局（Rumble Raiders 風格）。

## Spectra 工作流
本專案使用 Spectra 規格驅動開發。任何程式碼變更前必須有對應 spec。
- 規格書目錄：`openspec/`
- 流程：discuss → propose → apply ⇄ ingest → archive

## 技術規範
- Phaser 3 Arcade Physics（不用 Matter）
- 所有遊戲實體用 Graphics API 佔位符（後續替換真實素材）
- Player 用 Container 架構（預留紙娃娃分層）
- UIScene 與 GameScene 完全分離
- 獨立的 Manager/System 類別管理各系統邏輯

## 開發慣例
- 嚴格 TypeScript（no any）
- 每個類別一個檔案
- 常數集中在 config.ts
- Debug 功能集中在 DebugManager，不散落各處

## 建置與部署
- 建置：`npm run build`（tsc + vite build）
- 型別檢查：`npx tsc --noEmit`
- 本地預覽：`npm run preview`
- 部署至 GitHub Pages：`npx vite build && npx gh-pages -d dist`
- 線上版：https://jerrycela.github.io/projectcircle/
- Debug 模式加 `?debug=1` 啟用物理碰撞框 + `window.__debug` API

## Debug API（QA 測試用）
`?debug=1` 啟用後，`window.__debug` 提供：
- `teleportToRoom(idx)` — 傳送到指定房間
- `giveGold(amount)` — 給金幣
- `killAllEnemies()` — 殺全場敵人
- `setInvincible(true/false)` — 無敵切換
- `healFull()` — 滿血滿魔
- `getStateSnapshot()` — 取得完整遊戲狀態
- `setFloor(n)` — 跳到指定樓層（保留當前玩家狀態）
- `revealStaircase()` — 強制顯示樓梯
新功能實作時必須同步更新 DebugManager API 和 GameState snapshot。

## QA 執行規則（CRITICAL）

**QA loop 禁止由 Opus 主模型執行。必須委派 Sonnet subagent。**

原因：QA 是機械性的 eval + 驗證工作，不需要架構決策能力。用 Opus 跑 QA 每次 agent-browser eval + 結果分析都消耗主 context，浪費大量 token。

### 執行方式

```
Opus 主模型：
  1. 從 openspec/ 讀取 AC 列表
  2. 組裝 QA prompt（見下方模板）
  3. 委派 Agent(model: "sonnet", subagent_type: "general-purpose")
  4. 收到結果後只做：判斷 PASS/FAIL、決定是否修 bug

Sonnet subagent：
  1. 啟動 vite preview + agent-browser
  2. 逐項驗證 AC（用 debug API + eval）
  3. 回傳 AC table + 發現的 bug 列表 + console errors
```

### QA prompt 模板

委派 Sonnet 時，prompt 必須包含以下區塊：

```
1. 目標：「驗證 Phase X 的 N 個 AC，回傳結果表格」
2. 啟動指令：vite build → vite preview --port 4173 → agent-browser open URL?debug=1
3. AC 列表：逐條列出，含驗證方法和預期結果
4. Debug API 清單：可用的 window.__debug 方法
5. 輸出格式：「回傳 markdown table：AC | 測試方法 | PASS/FAIL | 備註」
6. 收尾：agent-browser close + kill preview server
```

### 禁止事項

- 禁止 Opus 直接執行 agent-browser eval
- 禁止 Opus 逐條跑 AC 驗證
- 禁止跳過 QA（必須跑完才能報完成）

## 設計文件（Obsidian）
完整規格書在 Obsidian vault「SG-Arts Group」→ GameJam/暗黑地牢RPG/
