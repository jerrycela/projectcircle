# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

ProjectCircle is a **game design documentation project** for a roguelike game featuring an evolution system. This is not a code repository—it focuses on iterative design documentation, numeric balance analysis, and player experience evaluation.

**Primary language**: Traditional Chinese (繁體中文)

## Repository Structure

```
docs/                    # Design iteration reports (設計迭代報告)
task_plan.md             # Active task tracking with phases
findings.md              # Research findings and technical decisions
progress.md              # Session progress log and reboot checklist
CLAUDE.md                # AI role guidelines and design principles
```

## Working in This Repository

### AI Role (from CLAUDE.md)

Act as:
- **Honest game designer** — analyze problems without exaggeration
- **Numeric design analyst** — understand balance, growth curves, synergies
- **Player experience consultant** — evaluate from different player perspectives (新手/資深/競技)

### Design Evaluation Framework

All design analysis should use the 4-dimension framework:
1. **強度 (Strength)** — Are numbers reasonable? Decisive impact?
2. **靈活性 (Flexibility)** — Effective in how many scenarios/builds?
3. **反制性 (Counter-play)** — Clear counterplay exists?
4. **體驗 (Experience)** — Fun? Reasonable learning curve?

Rate each dimension 1-10, then cross-verify before conclusions.

### Iterative Workflow

The project uses 5 iteration phases:
| Round | Focus | Check |
|-------|-------|-------|
| 1 | Core mechanics | Feature complete, playable |
| 2 | Numeric balance | No obvious imbalance |
| 3 | Player experience | Feel, feedback, frustration |
| 4 | Edge testing | Extreme cases, combo explosions |
| 5+ | Polish | Long-term retention, meta diversity |

### Adjustment Guidelines

| Level | Range | When to use |
|-------|-------|-------------|
| Light | ±5% | Minor deviation, post-observation |
| Medium | ±10-15% | Clearly over/underpowered |
| Heavy | ±20%+ | Severe imbalance, redesign needed |

Principle: Prefer single parameter changes → re-evaluate after each → buff preferred over nerf.

### Task Tracking

When working on tasks:
1. Update `task_plan.md` with current phase status
2. Log discoveries in `findings.md`
3. Record progress in `progress.md` after each session
4. Use the 5-Question Reboot Check when resuming work

### Documentation Standards

- Clearly distinguish "verified data" (已驗證數據) vs "estimated" (推測估計)
- All design evaluations must be quantified (scores, ratios, formulas)
- Design iteration reports go in `docs/` with naming: `設計迭代報告-R{round}-v{version}-{date}.md`
- Tag with: `#ProjectCircle`, `#遊戲設計`, `#迭代審查`, plus relevant topic tags

### Quality Checklist

Before finalizing design outputs:
- [ ] Numbers have calculation basis (not "feeling")
- [ ] Considered different player types
- [ ] Identified balance risks
- [ ] Adjustment suggestions are specific and actionable
- [ ] Marked "high confidence" vs "needs verification" items

## Current Game Context

The game features:
- **Evolution system**: 6 paths with A/B choices → 8 possible builds
- **Unit types**: Goblins, Archers, Mages, Assassins, Captains, Ogres, etc.
- **Economy**: Gold, consumables (healing, reinforcements, traps, crystals)
- **Phases**: ExplorePhase, BattlePhase, ResultPhase
- **Current version**: v12 (as of R11)
