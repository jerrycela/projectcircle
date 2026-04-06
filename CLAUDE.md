# Dark Dungeon RPG

## 專案概述
Diablo I 風格 2D 俯視角地牢探索 RPG。Phaser 3 + Arcade Physics + Vite + TypeScript。

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

## 設計文件（Obsidian）
完整規格書在 Obsidian vault「SG-Arts Group」→ GameJam/暗黑地牢RPG/
