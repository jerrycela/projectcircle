/**
 * Texture Factory - 程式碼生成像素藝術 texture
 * 使用 Phaser.GameObjects.Graphics + generateTexture() 逐像素繪製
 * 零外部圖檔依賴，配合 pixelArt: true 確保縮放後像素銳利
 */

import Phaser from 'phaser'

// ============ Texture Keys ============

export const TEXTURE_KEYS = {
  BRICK_WALL: 'tex_brick_wall',       // 16x16
  FLOOR_TILE: 'tex_floor_tile',       // 16x16
  DOOR: 'tex_door',                   // 16x8
  GOBLIN: 'tex_goblin',               // 12x12
  SKELETON: 'tex_skeleton',           // 12x14
  OGRE: 'tex_ogre',                   // 14x14
  ADVENTURER: 'tex_adventurer',       // 12x14
  PALADIN: 'tex_paladin',             // 14x16
  CHICKEN: 'tex_chicken',             // 8x8
  ICON_GOLD: 'tex_icon_gold',         // 10x10
  ICON_HEART: 'tex_icon_heart',       // 10x10
  ICON_WAVE: 'tex_icon_wave',         // 10x10
  ICON_TRAP: 'tex_icon_trap',         // 12x12
  SHADOW: 'tex_shadow',               // 12x6
  // 進化型獨立紋理
  GOBLIN_ASSASSIN: 'tex_goblin_assassin',   // 12x12
  GOBLIN_CAPTAIN: 'tex_goblin_captain',     // 12x12
  SKELETON_ARCHER: 'tex_skeleton_archer',   // 12x14
  SKELETON_MAGE: 'tex_skeleton_mage',       // 12x14
  IRONCLAD_OGRE: 'tex_ironclad_ogre',       // 14x14
  BERSERKER_OGRE: 'tex_berserker_ogre',     // 14x14
} as const

// ============ 像素藝術調色盤 ============

// 磚牆
const WALL_BASE = 0x2a2a38
const WALL_LIGHT = 0x3a3a4a
const WALL_MORTAR = 0x141420
const WALL_HIGHLIGHT = 0x4a4a5a

// 地板
const FLOOR_BASE = 0x1a1a24
const FLOOR_LIGHT = 0x222230
const FLOOR_CRACK = 0x111118
const FLOOR_GRAVEL = 0x2a2a36

// 哥布林
const GOB_SKIN = 0x4a8a5a
const GOB_DARK = 0x2a5a3a
const GOB_EYE = 0xff3333
const GOB_KNIFE = 0xaaaaaa

// 骷髏
const BONE_WHITE = 0xddddcc
const BONE_SHADOW = 0x999988
const BONE_DARK = 0x666655
const BONE_EYE = 0x332222

// 食人魔
const OGRE_SKIN = 0x8a6a4a
const OGRE_DARK = 0x6a4a2a
const OGRE_BELLY = 0x9a7a5a
const OGRE_TUSK = 0xeeeecc

// 冒險者
const ADV_ARMOR = 0x888888
const ADV_DARK = 0x666666
const ADV_SKIN = 0xddb888
const ADV_SWORD = 0xcccccc
const ADV_SHIELD = 0x6688aa
const ADV_HELMET = 0x777788

// 聖騎士
const PAL_ARMOR = 0xd4b888
const PAL_DARK = 0xaa8866
const PAL_GLOW = 0xffffaa
const PAL_CAPE = 0x4444aa
const PAL_CROSS = 0xffffff
const PAL_SKIN = 0xddbb99

// 圖示
const GOLD_MAIN = 0xd4aa44
const GOLD_LIGHT = 0xffdd66
const GOLD_DARK = 0xaa8822
const HEART_MAIN = 0xcc4444
const HEART_LIGHT = 0xff6666
const HEART_DARK = 0x882222
const WAVE_BLADE = 0xcccccc
const WAVE_HANDLE = 0x8a6a4a
const TRAP_SPIKE = 0xcc6644
const TRAP_BASE = 0x666666

// 哥布林刺客
const ASSN_CLOAK = 0x5a3a7a
const ASSN_DARK = 0x3a2a5a
const ASSN_SKIN = 0x3a7a4a
const ASSN_BLADE = 0xccccdd

// 哥布林隊長
const CAPT_CAPE = 0xcc3333
const CAPT_CAPE_DARK = 0x882222
const CAPT_ARMOR = 0x777777
const CAPT_ARMOR_LIGHT = 0x999999
const CAPT_FLAG = 0xcc3333

// 骷髏弓箭手
const ARCH_BOW = 0x5a9a7a
const ARCH_ACCENT = 0x66ccaa
const ARCH_ARROW = 0xcccccc

// 骷髏法師
const MAGE_ROBE = 0x334488
const MAGE_ROBE_DARK = 0x223366
const MAGE_ORB = 0x88bbff
const MAGE_FLAME = 0x5588ff

// 鐵甲食人魔
const IRON_PLATE = 0x8888aa
const IRON_DARK = 0x666688
const IRON_LIGHT = 0xaaaacc
const IRON_RIVET = 0xbbbbdd

// 狂戰士食人魔
const BERSERK_SKIN = 0x9a6a3a
const BERSERK_RAGE = 0xcc3333
const BERSERK_AXE = 0x888888
const BERSERK_DARK = 0x6a4a2a

// ============ 輔助函式 ============

function px(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number, alpha: number = 1): void {
  g.fillStyle(color, alpha)
  g.fillRect(x, y, 1, 1)
}

function hline(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, color: number, alpha: number = 1): void {
  g.fillStyle(color, alpha)
  g.fillRect(x, y, len, 1)
}

function vline(g: Phaser.GameObjects.Graphics, x: number, y: number, len: number, color: number, alpha: number = 1): void {
  g.fillStyle(color, alpha)
  g.fillRect(x, y, 1, len)
}

function rect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number = 1): void {
  g.fillStyle(color, alpha)
  g.fillRect(x, y, w, h)
}

// ============ 各 Texture 生成 ============

function generateBrickWall(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 16, H = 16

  // 灰漿底色
  rect(g, 0, 0, W, H, WALL_MORTAR)

  // 第 1 行磚 (y=0..3): 2 塊
  rect(g, 1, 0, 6, 3, WALL_BASE)
  rect(g, 9, 0, 6, 3, WALL_BASE)
  hline(g, 1, 0, 6, WALL_LIGHT)
  hline(g, 9, 0, 6, WALL_LIGHT)
  hline(g, 1, 2, 6, 0x222232)  // 底部暗邊
  hline(g, 9, 2, 6, 0x222232)
  px(g, 2, 0, WALL_HIGHLIGHT)
  px(g, 10, 0, WALL_HIGHLIGHT)
  px(g, 4, 1, 0x333344) // 磚面紋理點

  // 第 2 行磚 (y=4..7): 偏移 4px
  rect(g, 0, 4, 4, 3, WALL_BASE)
  rect(g, 5, 4, 6, 3, WALL_BASE)
  rect(g, 13, 4, 3, 3, WALL_BASE)
  hline(g, 0, 4, 4, WALL_LIGHT)
  hline(g, 5, 4, 6, WALL_LIGHT)
  hline(g, 13, 4, 3, WALL_LIGHT)
  hline(g, 0, 6, 4, 0x222232)
  hline(g, 5, 6, 6, 0x222232)
  hline(g, 13, 6, 3, 0x222232)
  px(g, 1, 4, WALL_HIGHLIGHT)
  px(g, 6, 4, WALL_HIGHLIGHT)
  px(g, 14, 4, WALL_HIGHLIGHT)
  px(g, 8, 5, 0x333344)

  // 第 3 行磚 (y=8..11): 同第 1 行對齊
  rect(g, 1, 8, 6, 3, WALL_BASE)
  rect(g, 9, 8, 6, 3, WALL_BASE)
  hline(g, 1, 8, 6, WALL_LIGHT)
  hline(g, 9, 8, 6, WALL_LIGHT)
  hline(g, 1, 10, 6, 0x222232)
  hline(g, 9, 10, 6, 0x222232)
  px(g, 3, 8, WALL_HIGHLIGHT)
  px(g, 11, 8, WALL_HIGHLIGHT)
  px(g, 5, 9, 0x333344)
  px(g, 12, 9, 0x333344)

  // 第 4 行磚 (y=12..15): 偏移
  rect(g, 0, 12, 4, 3, WALL_BASE)
  rect(g, 5, 12, 6, 3, WALL_BASE)
  rect(g, 13, 12, 3, 3, WALL_BASE)
  hline(g, 0, 12, 4, WALL_LIGHT)
  hline(g, 5, 12, 6, WALL_LIGHT)
  hline(g, 13, 12, 3, WALL_LIGHT)
  hline(g, 0, 14, 4, 0x222232)
  hline(g, 5, 14, 6, 0x222232)
  hline(g, 13, 14, 3, 0x222232)
  px(g, 0, 12, WALL_HIGHLIGHT)
  px(g, 7, 12, WALL_HIGHLIGHT)
  px(g, 2, 13, 0x333344)

  g.generateTexture(TEXTURE_KEYS.BRICK_WALL, W, H)
  g.destroy()
}

function generateFloorTile(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 16, H = 16

  // 石板底色
  rect(g, 0, 0, W, H, FLOOR_BASE)

  // 4 塊石板 (2x2) -- 微妙色差
  rect(g, 0, 0, 7, 7, FLOOR_LIGHT)
  rect(g, 9, 0, 7, 7, FLOOR_BASE)
  rect(g, 0, 9, 7, 7, FLOOR_BASE)
  rect(g, 9, 9, 7, 7, FLOOR_LIGHT)

  // 石板內紋理（微弱色點）
  px(g, 2, 2, 0x262634)
  px(g, 5, 4, 0x1e1e2a)
  px(g, 11, 2, 0x1c1c28)
  px(g, 13, 5, 0x1e1e2a)
  px(g, 3, 11, 0x1c1c28)
  px(g, 1, 13, 0x1e1e2a)
  px(g, 10, 11, 0x262634)
  px(g, 14, 13, 0x1e1e2a)

  // 接縫（深色十字 + 邊緣亮線）
  hline(g, 0, 7, W, FLOOR_CRACK)
  hline(g, 0, 8, W, FLOOR_CRACK)
  vline(g, 7, 0, H, FLOOR_CRACK)
  vline(g, 8, 0, H, FLOOR_CRACK)
  // 接縫亮邊（石板邊緣微反光）
  hline(g, 0, 6, 7, 0x242432, 0.5)
  hline(g, 9, 6, 7, 0x1c1c28, 0.5)
  hline(g, 0, 9, 7, 0x1c1c28, 0.5)
  hline(g, 9, 9, 7, 0x242432, 0.5)

  // 碎石點
  px(g, 3, 2, FLOOR_GRAVEL)
  px(g, 11, 4, FLOOR_GRAVEL)
  px(g, 5, 12, FLOOR_GRAVEL)
  px(g, 13, 10, FLOOR_GRAVEL)
  px(g, 2, 14, FLOOR_GRAVEL)
  px(g, 1, 4, 0x282838)
  px(g, 14, 1, 0x282838)

  // 裂縫
  px(g, 4, 3, FLOOR_CRACK)
  px(g, 5, 4, FLOOR_CRACK)
  px(g, 4, 4, 0x151520)
  px(g, 12, 11, FLOOR_CRACK)
  px(g, 13, 12, FLOOR_CRACK)
  px(g, 11, 12, 0x151520)

  g.generateTexture(TEXTURE_KEYS.FLOOR_TILE, W, H)
  g.destroy()
}

function generateDoor(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 16, H = 8

  // 門框
  rect(g, 0, 0, W, H, 0x443333)
  // 門板
  rect(g, 1, 1, W - 2, H - 2, 0x554433)
  // 中央亮色
  rect(g, 3, 2, W - 6, H - 4, 0x665544)
  // 門釘
  px(g, 4, 3, 0x888866)
  px(g, W - 5, 3, 0x888866)
  // 邊緣暗色
  hline(g, 0, 0, W, 0x332222)
  hline(g, 0, H - 1, W, 0x332222)

  g.generateTexture(TEXTURE_KEYS.DOOR, W, H)
  g.destroy()
}

function generateGoblin(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 12

  // 身體輪廓（暗綠邊緣）
  rect(g, 3, 3, 6, 6, GOB_DARK)
  // 身體填充
  rect(g, 4, 3, 4, 5, GOB_SKIN)
  // 頭
  rect(g, 4, 1, 4, 3, GOB_SKIN)
  px(g, 3, 2, GOB_SKIN) // 左臉頰
  px(g, 8, 2, GOB_SKIN) // 右臉頰
  // 暗面（下半身）
  rect(g, 4, 7, 4, 2, GOB_DARK)
  // 頭頂高光
  px(g, 5, 0, 0x5a9a6a)
  px(g, 6, 0, 0x5a9a6a)
  // 尖耳
  px(g, 2, 1, GOB_SKIN)
  px(g, 9, 1, GOB_SKIN)
  px(g, 1, 2, GOB_DARK)
  px(g, 10, 2, GOB_DARK)
  // 紅眼 + 瞳孔
  px(g, 5, 2, GOB_EYE)
  px(g, 7, 2, GOB_EYE)
  px(g, 5, 2, 0xee2222) // 暗紅瞳孔
  // 鼻子
  px(g, 6, 3, 0x3a6a4a)
  // 嘴（露齒）
  px(g, 5, 3, GOB_DARK)
  px(g, 7, 3, GOB_DARK)
  px(g, 6, 4, 0xccccaa) // 獠牙
  // 手臂
  px(g, 2, 4, GOB_DARK)
  px(g, 2, 5, GOB_DARK)
  px(g, 9, 4, GOB_DARK)
  px(g, 9, 5, GOB_DARK)
  // 腿
  rect(g, 4, 9, 2, 2, GOB_DARK)
  rect(g, 7, 9, 2, 2, GOB_DARK)
  px(g, 3, 10, 0x1a3a2a) // 靴子
  px(g, 8, 10, 0x1a3a2a)
  // 小刀（右手，閃亮）
  px(g, 10, 3, 0xdddddd) // 刀尖
  px(g, 10, 4, GOB_KNIFE)
  px(g, 10, 5, GOB_KNIFE)
  px(g, 11, 3, 0xeeeeee)

  g.generateTexture(TEXTURE_KEYS.GOBLIN, W, H)
  g.destroy()
}

function generateSkeleton(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 14

  // 頭骨（圓潤）
  rect(g, 4, 0, 4, 3, BONE_WHITE)
  px(g, 3, 1, BONE_WHITE)
  px(g, 8, 1, BONE_WHITE)
  px(g, 3, 0, BONE_SHADOW)
  px(g, 8, 0, BONE_SHADOW)
  // 頭頂高光
  px(g, 5, 0, 0xeeeeDD)
  // 暗眼窩（深凹感）
  px(g, 5, 1, BONE_EYE)
  px(g, 7, 1, BONE_EYE)
  px(g, 5, 2, 0x221111) // 眼窩深處
  px(g, 7, 2, 0x221111)
  // 鼻腔
  px(g, 6, 2, BONE_SHADOW)
  // 下頜 + 牙齒
  hline(g, 4, 3, 5, BONE_SHADOW)
  px(g, 5, 3, BONE_WHITE)
  px(g, 7, 3, BONE_WHITE)

  // 脊椎
  vline(g, 6, 4, 5, BONE_WHITE)
  px(g, 6, 5, BONE_SHADOW) // 椎節暗面
  px(g, 6, 7, BONE_SHADOW)
  // 肋骨（交替明暗）
  hline(g, 4, 5, 5, BONE_WHITE)
  hline(g, 4, 6, 5, BONE_SHADOW)
  hline(g, 5, 7, 3, BONE_WHITE)
  hline(g, 5, 8, 3, BONE_SHADOW)
  // 肩膀
  px(g, 3, 4, BONE_WHITE)
  px(g, 9, 4, BONE_WHITE)
  px(g, 2, 4, BONE_SHADOW) // 肩外緣
  // 手臂（骨節感）
  vline(g, 3, 5, 3, BONE_SHADOW)
  vline(g, 9, 5, 3, BONE_SHADOW)
  px(g, 3, 6, BONE_WHITE) // 肘關節
  px(g, 2, 7, BONE_DARK) // 手指

  // 骨盆
  hline(g, 5, 9, 3, BONE_WHITE)
  // 腿（骨節感）
  vline(g, 5, 10, 3, BONE_SHADOW)
  vline(g, 7, 10, 3, BONE_SHADOW)
  px(g, 5, 11, BONE_WHITE) // 膝蓋
  px(g, 7, 11, BONE_WHITE)
  // 腳
  px(g, 4, 12, BONE_DARK)
  px(g, 5, 13, BONE_DARK)
  px(g, 7, 13, BONE_DARK)
  px(g, 8, 12, BONE_DARK)

  // 弓（右邊，帶弧度）
  vline(g, 10, 3, 6, 0x8a6a3a)
  px(g, 11, 3, 0x7a5a2a)
  px(g, 11, 8, 0x7a5a2a)
  px(g, 11, 2, 0x6a4a1a) // 弓尖
  px(g, 11, 9, 0x6a4a1a)
  // 弦
  vline(g, 11, 4, 4, 0x555555)

  g.generateTexture(TEXTURE_KEYS.SKELETON, W, H)
  g.destroy()
}

function generateOgre(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 14, H = 14

  // 壯碩身軀（輪廓）
  rect(g, 2, 3, 10, 7, OGRE_DARK)
  // 身軀填充
  rect(g, 3, 3, 8, 6, OGRE_SKIN)
  // 肚子亮色（圓潤感）
  rect(g, 4, 5, 6, 3, OGRE_BELLY)
  px(g, 5, 4, OGRE_BELLY) // 上肚
  px(g, 8, 4, OGRE_BELLY)
  // 暗面
  rect(g, 3, 8, 8, 2, OGRE_DARK)
  // 肩膀高光
  px(g, 3, 3, 0x9a7a5a)
  px(g, 10, 3, 0x9a7a5a)

  // 頭
  rect(g, 5, 0, 4, 4, OGRE_SKIN)
  px(g, 4, 1, OGRE_SKIN) // 寬臉
  px(g, 9, 1, OGRE_SKIN)
  // 眉毛
  hline(g, 5, 0, 4, OGRE_DARK)
  // 眼
  px(g, 6, 1, 0xffaa44)
  px(g, 8, 1, 0xffaa44)
  px(g, 6, 2, 0xcc8833) // 瞳孔
  px(g, 8, 2, 0xcc8833)
  // 獠牙（突出）
  px(g, 5, 3, OGRE_TUSK)
  px(g, 8, 3, OGRE_TUSK)
  px(g, 5, 4, 0xddddbb) // 下延獠牙
  px(g, 8, 4, 0xddddbb)
  // 嘴
  hline(g, 6, 3, 2, 0x5a3a1a)

  // 粗手臂
  rect(g, 1, 4, 2, 5, OGRE_SKIN)
  rect(g, 11, 4, 2, 5, OGRE_SKIN)
  px(g, 0, 5, OGRE_DARK) // 手臂外輪廓
  px(g, 13, 5, OGRE_DARK)
  // 拳頭
  rect(g, 0, 8, 3, 2, OGRE_DARK)
  rect(g, 11, 8, 3, 2, OGRE_DARK)

  // 粗腿
  rect(g, 4, 10, 3, 2, OGRE_DARK)
  rect(g, 8, 10, 3, 2, OGRE_DARK)
  // 腳（大腳）
  rect(g, 3, 12, 4, 2, 0x5a4a2a)
  rect(g, 7, 12, 4, 2, 0x5a4a2a)
  px(g, 2, 13, 0x4a3a1a) // 腳趾

  // 棍棒（右手上方，帶釘頭）
  vline(g, 13, 1, 4, 0x6a5a3a)
  rect(g, 12, 0, 2, 2, 0x8a7a5a)
  px(g, 11, 0, 0x999999) // 釘子
  px(g, 13, 0, 0x999999)

  g.generateTexture(TEXTURE_KEYS.OGRE, W, H)
  g.destroy()
}

function generateAdventurer(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 14

  // 頭盔（帶面罩感）
  rect(g, 4, 0, 4, 2, ADV_HELMET)
  hline(g, 3, 2, 6, ADV_HELMET)
  px(g, 5, 0, 0x8888aa) // 頭盔高光
  // T型面罩開口
  px(g, 5, 1, 0x333344)
  px(g, 6, 1, 0x333344)
  // 臉
  rect(g, 5, 2, 3, 2, ADV_SKIN)
  // 眼
  px(g, 5, 3, 0x334444)
  px(g, 7, 3, 0x334444)

  // 盔甲軀幹（帶層次）
  rect(g, 3, 4, 6, 5, ADV_ARMOR)
  rect(g, 3, 7, 6, 2, ADV_DARK)
  // 胸甲高光
  vline(g, 6, 4, 4, 0x999999)
  px(g, 5, 5, 0x9999aa) // 左胸高光
  // 腰帶
  hline(g, 3, 8, 6, 0x664422)

  // 手臂 + 盾（左）
  rect(g, 1, 4, 2, 4, ADV_ARMOR)
  rect(g, 0, 5, 2, 4, ADV_SHIELD)
  px(g, 0, 5, 0x88aacc) // 盾面高光
  px(g, 1, 6, 0x557799) // 盾紋章
  px(g, 0, 8, 0x445566) // 盾底

  // 手臂 + 劍（右）
  rect(g, 9, 4, 2, 4, ADV_ARMOR)
  vline(g, 11, 1, 6, ADV_SWORD)
  px(g, 11, 0, 0xeeeeee) // 劍尖
  px(g, 11, 1, 0xdddddd)
  px(g, 11, 7, 0x886644) // 劍柄
  px(g, 10, 6, 0xaa9955) // 護手

  // 腿
  rect(g, 4, 9, 2, 3, ADV_DARK)
  rect(g, 7, 9, 2, 3, ADV_DARK)
  // 靴子
  rect(g, 3, 12, 3, 2, 0x554433)
  rect(g, 6, 12, 3, 2, 0x554433)
  px(g, 4, 12, 0x665544) // 靴子高光

  g.generateTexture(TEXTURE_KEYS.ADVENTURER, W, H)
  g.destroy()
}

function generatePaladin(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 14, H = 16

  // 光暈頂部（金色神聖光環）
  hline(g, 4, 0, 6, PAL_GLOW, 0.4)
  px(g, 3, 0, PAL_GLOW, 0.2)
  px(g, 10, 0, PAL_GLOW, 0.2)
  px(g, 6, 0, 0xffffff, 0.6) // 中央強光

  // 頭盔（金色，帶冠飾）
  rect(g, 5, 1, 4, 2, PAL_ARMOR)
  hline(g, 4, 3, 6, PAL_ARMOR)
  px(g, 6, 1, GOLD_LIGHT) // 頭盔高光
  px(g, 7, 1, 0xeedd88) // 閃光
  // 冠飾
  px(g, 7, 0, 0xeedd88)
  // 面部
  rect(g, 5, 3, 4, 2, PAL_SKIN)
  // 眼（深藍色，神聖感）
  px(g, 6, 4, 0x3344bb)
  px(g, 8, 4, 0x3344bb)

  // 盔甲軀幹（金色，帶層次）
  rect(g, 4, 5, 6, 5, PAL_ARMOR)
  rect(g, 4, 8, 6, 2, PAL_DARK)
  // 肩甲高光
  px(g, 4, 5, 0xeedd88)
  px(g, 9, 5, 0xeedd88)
  // 十字紋章（更精緻）
  vline(g, 7, 5, 4, PAL_CROSS)
  hline(g, 6, 6, 3, PAL_CROSS)
  px(g, 7, 5, 0xffffff) // 十字中心強光
  // 腰帶
  hline(g, 4, 9, 6, 0x887744)
  px(g, 7, 9, 0xaaaa66) // 腰帶扣

  // 披風（藍色，帶褶皺感）
  rect(g, 1, 5, 3, 7, PAL_CAPE)
  rect(g, 10, 5, 3, 7, PAL_CAPE)
  // 披風褶皺亮面
  px(g, 2, 6, 0x5555bb)
  px(g, 11, 6, 0x5555bb)
  // 披風暗面
  px(g, 1, 10, 0x333388)
  px(g, 12, 10, 0x333388)
  px(g, 1, 11, 0x2a2a77)
  px(g, 12, 11, 0x2a2a77)

  // 手臂（金甲）
  rect(g, 2, 5, 2, 4, PAL_ARMOR)
  rect(g, 10, 5, 2, 4, PAL_ARMOR)
  px(g, 3, 5, 0xeedd88) // 手臂高光

  // 腿
  rect(g, 5, 10, 2, 4, PAL_DARK)
  rect(g, 8, 10, 2, 4, PAL_DARK)
  // 靴子
  rect(g, 4, 13, 3, 3, 0x665533)
  rect(g, 7, 13, 3, 3, 0x665533)
  px(g, 5, 13, 0x776644) // 靴子高光

  // 聖劍（右手，帶金色護手）
  vline(g, 13, 1, 7, ADV_SWORD)
  px(g, 13, 0, 0xffffcc) // 金色劍尖
  px(g, 13, 1, 0xeeeeee)
  px(g, 12, 7, 0xccaa55) // 金色護手
  px(g, 13, 8, 0x886644) // 劍柄

  g.generateTexture(TEXTURE_KEYS.PALADIN, W, H)
  g.destroy()
}

function generateChicken(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 8, H = 8

  // 身體（黃色圓潤）
  rect(g, 2, 2, 4, 4, 0xffee88)
  rect(g, 3, 2, 2, 4, 0xfff4aa) // 肚子亮色
  // 頭
  rect(g, 3, 1, 3, 2, 0xffee88)
  // 翅膀（帶尖端）
  px(g, 1, 3, 0xddcc66)
  px(g, 1, 4, 0xccbb55)
  px(g, 6, 3, 0xddcc66)
  px(g, 6, 4, 0xccbb55)
  // 眼
  px(g, 4, 1, 0x222222)
  // 嘴
  px(g, 6, 2, 0xff8844)
  px(g, 7, 2, 0xff6622) // 嘴尖
  // 雞冠（紅色三角）
  px(g, 3, 0, 0xff4444)
  px(g, 4, 0, 0xff4444)
  px(g, 4, -1, 0xee3333) // 冠頂
  // 尾巴
  px(g, 1, 2, 0xccbb55)
  // 腳
  px(g, 3, 6, 0xff8844)
  px(g, 5, 6, 0xff8844)
  px(g, 2, 7, 0xff6622)
  px(g, 4, 7, 0xff6622)

  g.generateTexture(TEXTURE_KEYS.CHICKEN, W, H)
  g.destroy()
}

function generateIconGold(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 10, H = 10

  // 圓形金幣（精緻版）
  rect(g, 3, 1, 4, 8, GOLD_MAIN)
  rect(g, 2, 2, 6, 6, GOLD_MAIN)
  rect(g, 1, 3, 8, 4, GOLD_MAIN)
  // 外圈暗邊
  px(g, 2, 1, GOLD_DARK)
  px(g, 7, 1, GOLD_DARK)
  px(g, 1, 2, GOLD_DARK)
  px(g, 8, 2, GOLD_DARK)
  px(g, 1, 7, GOLD_DARK)
  px(g, 8, 7, GOLD_DARK)
  px(g, 2, 8, GOLD_DARK)
  px(g, 7, 8, GOLD_DARK)
  // 高光（左上弧）
  px(g, 3, 2, GOLD_LIGHT)
  px(g, 4, 2, GOLD_LIGHT)
  px(g, 2, 3, GOLD_LIGHT)
  px(g, 3, 3, 0xffee88)
  // 暗面（右下弧）
  px(g, 6, 7, GOLD_DARK)
  px(g, 7, 6, GOLD_DARK)
  px(g, 7, 7, 0x886611)
  // $ 符號（更清晰）
  hline(g, 4, 3, 2, 0x997711)
  px(g, 4, 4, 0x997711)
  hline(g, 4, 5, 2, 0x997711)
  px(g, 5, 6, 0x997711)
  hline(g, 4, 7, 2, 0x997711)
  // $ 中線
  vline(g, 5, 2, 7, 0xbb9922)

  g.generateTexture(TEXTURE_KEYS.ICON_GOLD, W, H)
  g.destroy()
}

function generateIconHeart(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 10, H = 10

  // 外框暗紅
  px(g, 1, 1, HEART_DARK)
  px(g, 4, 1, HEART_DARK)
  px(g, 5, 1, HEART_DARK)
  px(g, 8, 1, HEART_DARK)
  // 頂部兩個圓弧
  rect(g, 1, 2, 3, 2, HEART_MAIN)
  rect(g, 6, 2, 3, 2, HEART_MAIN)
  px(g, 2, 1, HEART_MAIN)
  px(g, 3, 1, HEART_MAIN)
  px(g, 6, 1, HEART_MAIN)
  px(g, 7, 1, HEART_MAIN)
  // 中段
  rect(g, 1, 4, 8, 2, HEART_MAIN)
  // 底部三角
  rect(g, 2, 6, 6, 1, HEART_MAIN)
  rect(g, 3, 7, 4, 1, HEART_MAIN)
  rect(g, 4, 8, 2, 1, HEART_MAIN)
  px(g, 5, 9, HEART_DARK) // 底尖
  // 高光（左上弧，更強）
  px(g, 2, 2, HEART_LIGHT)
  px(g, 3, 2, HEART_LIGHT)
  px(g, 2, 3, 0xee5555)
  // 反光點
  px(g, 2, 1, 0xff8888)
  // 暗面（右下弧）
  px(g, 7, 4, HEART_DARK)
  px(g, 8, 3, HEART_DARK)
  px(g, 7, 5, HEART_DARK)
  px(g, 6, 6, HEART_DARK)
  px(g, 5, 7, HEART_DARK)

  g.generateTexture(TEXTURE_KEYS.ICON_HEART, W, H)
  g.destroy()
}

function generateIconWave(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 10, H = 10

  // 劍形圖示
  // 劍身
  vline(g, 5, 0, 7, WAVE_BLADE)
  vline(g, 4, 1, 5, WAVE_BLADE)
  // 劍尖
  px(g, 5, 0, 0xeeeeee)
  // 護手
  hline(g, 2, 7, 6, WAVE_HANDLE)
  // 劍柄
  vline(g, 5, 7, 3, WAVE_HANDLE)
  px(g, 4, 8, WAVE_HANDLE)
  // 劍柄底
  px(g, 5, 9, 0x6a5a3a)

  g.generateTexture(TEXTURE_KEYS.ICON_WAVE, W, H)
  g.destroy()
}

function generateIconTrap(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 12

  // 底座
  rect(g, 2, 9, 8, 2, TRAP_BASE)
  hline(g, 1, 11, 10, 0x555555)

  // 三根尖刺
  // 左刺
  vline(g, 3, 4, 5, TRAP_SPIKE)
  px(g, 3, 3, 0xee8866)
  // 中刺（最高）
  vline(g, 6, 2, 7, TRAP_SPIKE)
  px(g, 6, 1, 0xee8866)
  // 右刺
  vline(g, 9, 4, 5, TRAP_SPIKE)
  px(g, 9, 3, 0xee8866)

  // 高光
  px(g, 3, 5, 0xee9966)
  px(g, 6, 3, 0xee9966)
  px(g, 9, 5, 0xee9966)

  g.generateTexture(TEXTURE_KEYS.ICON_TRAP, W, H)
  g.destroy()
}

function generateShadow(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 6

  // 半透明橢圓（用多行矩形近似）
  g.fillStyle(0x000000, 0.15)
  g.fillRect(3, 0, 6, 1)
  g.fillStyle(0x000000, 0.25)
  g.fillRect(2, 1, 8, 1)
  g.fillStyle(0x000000, 0.35)
  g.fillRect(1, 2, 10, 2)
  g.fillStyle(0x000000, 0.25)
  g.fillRect(2, 4, 8, 1)
  g.fillStyle(0x000000, 0.15)
  g.fillRect(3, 5, 6, 1)

  g.generateTexture(TEXTURE_KEYS.SHADOW, W, H)
  g.destroy()
}

// ============ 進化型紋理 ============

function generateGoblinAssassin(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 12

  // 斗篷（深紫，覆蓋大部分身體）
  rect(g, 3, 2, 6, 7, ASSN_CLOAK)
  rect(g, 2, 3, 8, 5, ASSN_CLOAK)
  // 斗篷暗面
  rect(g, 3, 7, 6, 2, ASSN_DARK)
  px(g, 2, 7, ASSN_DARK)
  px(g, 9, 7, ASSN_DARK)
  // 斗篷邊角（飄逸感）
  px(g, 1, 7, ASSN_DARK)
  px(g, 10, 7, ASSN_DARK)
  px(g, 1, 8, ASSN_CLOAK)
  px(g, 10, 8, ASSN_CLOAK)

  // 兜帽
  rect(g, 4, 0, 4, 3, ASSN_CLOAK)
  px(g, 3, 1, ASSN_CLOAK)
  px(g, 8, 1, ASSN_CLOAK)
  // 兜帽尖端
  px(g, 5, 0, ASSN_DARK)
  px(g, 6, 0, ASSN_DARK)

  // 臉（在兜帽下方露出）
  rect(g, 5, 2, 3, 2, ASSN_SKIN)
  // 紅眼（在陰影中發光）
  px(g, 5, 2, 0xff3333)
  px(g, 7, 2, 0xff3333)
  px(g, 5, 3, 0xcc2222) // 眼下陰影

  // 尖耳（從兜帽側露出）
  px(g, 2, 2, ASSN_SKIN)
  px(g, 9, 2, ASSN_SKIN)

  // 雙匕首（交叉感）
  // 左手匕首
  px(g, 1, 3, ASSN_BLADE)
  px(g, 1, 4, ASSN_BLADE)
  px(g, 0, 2, 0xeeeeee) // 刀尖
  // 右手匕首
  px(g, 10, 3, ASSN_BLADE)
  px(g, 10, 4, ASSN_BLADE)
  px(g, 11, 2, 0xeeeeee) // 刀尖
  // 匕首護手
  px(g, 1, 5, 0x886644)
  px(g, 10, 5, 0x886644)

  // 腿（深色，蹲伏姿勢）
  rect(g, 4, 9, 2, 2, ASSN_DARK)
  rect(g, 7, 9, 2, 2, ASSN_DARK)
  // 靴子
  px(g, 3, 10, 0x2a1a3a)
  px(g, 8, 10, 0x2a1a3a)
  px(g, 3, 11, 0x1a1a2a)
  px(g, 8, 11, 0x1a1a2a)

  g.generateTexture(TEXTURE_KEYS.GOBLIN_ASSASSIN, W, H)
  g.destroy()
}

function generateGoblinCaptain(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 12

  // 身體（帶胸甲）
  rect(g, 3, 3, 6, 6, CAPT_ARMOR)
  rect(g, 4, 3, 4, 5, CAPT_ARMOR_LIGHT)
  // 胸甲高光
  px(g, 5, 4, 0xbbbbbb)
  // 胸甲暗面
  rect(g, 3, 7, 6, 2, 0x555555)

  // 頭（基礎綠皮）
  rect(g, 4, 1, 4, 3, GOB_SKIN)
  px(g, 3, 2, GOB_SKIN)
  px(g, 8, 2, GOB_SKIN)
  // 頭盔（小鐵盔）
  hline(g, 4, 0, 4, CAPT_ARMOR)
  hline(g, 3, 1, 6, CAPT_ARMOR)
  px(g, 5, 0, CAPT_ARMOR_LIGHT) // 頭盔高光
  // 紅色頭飾
  px(g, 6, 0, CAPT_CAPE)

  // 尖耳
  px(g, 2, 1, GOB_SKIN)
  px(g, 9, 1, GOB_SKIN)
  // 眼（堅定的黃眼）
  px(g, 5, 2, 0xffaa44)
  px(g, 7, 2, 0xffaa44)

  // 紅色披風（背後飄逸）
  rect(g, 1, 3, 2, 7, CAPT_CAPE)
  rect(g, 9, 3, 2, 7, CAPT_CAPE)
  // 披風暗面
  px(g, 1, 8, CAPT_CAPE_DARK)
  px(g, 10, 8, CAPT_CAPE_DARK)
  px(g, 1, 9, CAPT_CAPE_DARK)
  px(g, 10, 9, CAPT_CAPE_DARK)

  // 旗幟（右肩上方）
  vline(g, 10, 0, 4, 0x6a4a2a) // 旗桿
  px(g, 11, 0, CAPT_FLAG) // 旗面
  px(g, 11, 1, CAPT_FLAG)
  px(g, 11, 2, CAPT_CAPE_DARK)

  // 劍（右手）
  vline(g, 11, 4, 5, GOB_KNIFE)
  px(g, 11, 3, 0xdddddd) // 劍尖

  // 腿
  rect(g, 4, 9, 2, 2, GOB_DARK)
  rect(g, 7, 9, 2, 2, GOB_DARK)
  px(g, 3, 10, 0x1a3a2a)
  px(g, 8, 10, 0x1a3a2a)

  g.generateTexture(TEXTURE_KEYS.GOBLIN_CAPTAIN, W, H)
  g.destroy()
}

function generateSkeletonArcher(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 14

  // 頭骨（與基礎骷髏類似）
  rect(g, 4, 0, 4, 3, BONE_WHITE)
  px(g, 3, 1, BONE_WHITE)
  px(g, 8, 1, BONE_WHITE)
  px(g, 5, 0, 0xeeeeDD)
  // 眼窩（翠綠色火焰）
  px(g, 5, 1, ARCH_ACCENT)
  px(g, 7, 1, ARCH_ACCENT)
  px(g, 5, 2, 0x339977)
  px(g, 7, 2, 0x339977)
  // 下頜
  hline(g, 4, 3, 5, BONE_SHADOW)
  px(g, 5, 3, BONE_WHITE)
  px(g, 7, 3, BONE_WHITE)

  // 脊椎
  vline(g, 6, 4, 5, BONE_WHITE)
  px(g, 6, 5, BONE_SHADOW)
  px(g, 6, 7, BONE_SHADOW)
  // 肋骨
  hline(g, 4, 5, 5, BONE_WHITE)
  hline(g, 4, 6, 5, BONE_SHADOW)
  hline(g, 5, 7, 3, BONE_WHITE)
  // 肩膀（帶護肩）
  px(g, 3, 4, ARCH_ACCENT)
  px(g, 9, 4, ARCH_ACCENT)
  px(g, 2, 4, 0x449977)

  // 手臂
  vline(g, 3, 5, 3, BONE_SHADOW)
  vline(g, 9, 5, 3, BONE_SHADOW)
  px(g, 3, 6, BONE_WHITE)

  // 箭袋（背後，帶箭矢）
  rect(g, 1, 4, 1, 5, 0x6a5a3a)
  px(g, 1, 3, ARCH_ARROW) // 箭尾
  px(g, 0, 3, ARCH_ARROW)
  px(g, 1, 2, 0x44aa88) // 箭羽

  // 弓（右邊，更精緻）
  vline(g, 10, 2, 8, ARCH_BOW)
  px(g, 11, 2, 0x4a8a6a) // 弓尖
  px(g, 11, 9, 0x4a8a6a)
  // 弦
  vline(g, 11, 3, 6, 0x888888)
  // 搭箭（準備射擊）
  px(g, 9, 5, ARCH_ARROW) // 箭身
  px(g, 8, 5, ARCH_ARROW)
  px(g, 7, 5, 0x44aa88) // 箭尖

  // 骨盆
  hline(g, 5, 9, 3, BONE_WHITE)
  // 腿
  vline(g, 5, 10, 3, BONE_SHADOW)
  vline(g, 7, 10, 3, BONE_SHADOW)
  px(g, 5, 11, BONE_WHITE)
  px(g, 7, 11, BONE_WHITE)
  // 腳
  px(g, 4, 12, BONE_DARK)
  px(g, 5, 13, BONE_DARK)
  px(g, 7, 13, BONE_DARK)
  px(g, 8, 12, BONE_DARK)

  g.generateTexture(TEXTURE_KEYS.SKELETON_ARCHER, W, H)
  g.destroy()
}

function generateSkeletonMage(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 12, H = 14

  // 頭骨
  rect(g, 4, 0, 4, 3, BONE_WHITE)
  px(g, 3, 1, BONE_WHITE)
  px(g, 8, 1, BONE_WHITE)
  px(g, 5, 0, 0xeeeeDD)
  // 眼窩（藍色魔法火焰）
  px(g, 5, 1, MAGE_FLAME)
  px(g, 7, 1, MAGE_FLAME)
  px(g, 5, 2, 0x3366cc)
  px(g, 7, 2, 0x3366cc)
  // 下頜
  hline(g, 4, 3, 5, BONE_SHADOW)

  // 法袍（覆蓋身體）
  rect(g, 3, 4, 6, 6, MAGE_ROBE)
  rect(g, 2, 5, 8, 4, MAGE_ROBE)
  // 法袍暗面
  rect(g, 3, 8, 6, 2, MAGE_ROBE_DARK)
  // 法袍領口
  px(g, 5, 4, 0x445599)
  px(g, 6, 4, 0x445599)
  // 法袍紋飾（中間豎線）
  vline(g, 6, 5, 4, 0x4466aa)
  // 法袍星紋
  px(g, 5, 6, MAGE_ORB)
  px(g, 7, 7, 0x6699cc)

  // 法袍下擺（飄逸）
  rect(g, 2, 10, 8, 2, MAGE_ROBE_DARK)
  px(g, 1, 11, MAGE_ROBE)
  px(g, 10, 11, MAGE_ROBE)
  // 腳不可見（被法袍遮住）
  px(g, 4, 12, MAGE_ROBE_DARK)
  px(g, 7, 12, MAGE_ROBE_DARK)
  px(g, 3, 13, 0x1a1a33)
  px(g, 8, 13, 0x1a1a33)

  // 手臂
  vline(g, 2, 5, 3, BONE_SHADOW)
  vline(g, 9, 5, 3, BONE_SHADOW)

  // 法杖（左手，帶發光球）
  vline(g, 1, 1, 8, 0x6a5a3a) // 杖身
  px(g, 1, 0, MAGE_ORB) // 法球
  px(g, 0, 0, 0x6699cc) // 法球光暈
  px(g, 2, 0, 0x6699cc)
  px(g, 1, 1, 0xaaddff) // 法球核心高光

  g.generateTexture(TEXTURE_KEYS.SKELETON_MAGE, W, H)
  g.destroy()
}

function generateIroncladOgre(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 14, H = 14

  // 壯碩身軀（鐵甲覆蓋）
  rect(g, 2, 3, 10, 7, IRON_DARK)
  rect(g, 3, 3, 8, 6, IRON_PLATE)
  // 甲片紋路
  hline(g, 3, 5, 8, IRON_DARK)
  hline(g, 3, 7, 8, IRON_DARK)
  // 胸甲高光
  px(g, 5, 4, IRON_LIGHT)
  px(g, 8, 4, IRON_LIGHT)
  // 鉚釘
  px(g, 4, 3, IRON_RIVET)
  px(g, 9, 3, IRON_RIVET)
  px(g, 4, 6, IRON_RIVET)
  px(g, 9, 6, IRON_RIVET)
  // 暗面
  rect(g, 3, 8, 8, 2, IRON_DARK)

  // 頭（帶鐵盔）
  rect(g, 5, 0, 4, 4, IRON_PLATE)
  px(g, 4, 1, IRON_PLATE)
  px(g, 9, 1, IRON_PLATE)
  // 盔面罩縫
  hline(g, 5, 2, 4, IRON_DARK)
  // 眼（從面罩縫隙露出）
  px(g, 6, 2, 0xffaa44)
  px(g, 8, 2, 0xffaa44)
  // 盔頂高光
  px(g, 6, 0, IRON_LIGHT)
  px(g, 7, 0, IRON_LIGHT)
  // 盔角飾
  px(g, 4, 0, IRON_DARK)
  px(g, 9, 0, IRON_DARK)

  // 肩甲（寬闊）
  rect(g, 1, 3, 2, 3, IRON_PLATE)
  rect(g, 11, 3, 2, 3, IRON_PLATE)
  px(g, 1, 3, IRON_LIGHT) // 肩甲高光
  px(g, 12, 3, IRON_LIGHT)
  // 肩甲鉚釘
  px(g, 1, 4, IRON_RIVET)
  px(g, 12, 4, IRON_RIVET)

  // 鐵甲手臂
  rect(g, 0, 5, 2, 4, IRON_DARK)
  rect(g, 12, 5, 2, 4, IRON_DARK)
  // 鐵拳
  rect(g, 0, 8, 2, 2, IRON_PLATE)
  rect(g, 12, 8, 2, 2, IRON_PLATE)

  // 盾牌（左手，大型）
  rect(g, 0, 4, 2, 5, 0x6666aa)
  px(g, 0, 5, IRON_LIGHT) // 盾面高光
  px(g, 1, 6, 0x555588) // 盾紋
  px(g, 0, 8, 0x444477) // 盾底

  // 鐵甲腿
  rect(g, 4, 10, 3, 2, IRON_DARK)
  rect(g, 8, 10, 3, 2, IRON_DARK)
  // 鐵靴
  rect(g, 3, 12, 4, 2, IRON_PLATE)
  rect(g, 7, 12, 4, 2, IRON_PLATE)
  px(g, 4, 12, IRON_LIGHT)

  g.generateTexture(TEXTURE_KEYS.IRONCLAD_OGRE, W, H)
  g.destroy()
}

function generateBerserkerOgre(scene: Phaser.Scene): void {
  const g = scene.add.graphics()
  const W = 14, H = 14

  // 壯碩身軀（裸露上身）
  rect(g, 2, 3, 10, 7, BERSERK_DARK)
  rect(g, 3, 3, 8, 6, BERSERK_SKIN)
  // 肚子
  rect(g, 4, 5, 6, 3, 0xaa7a4a)
  // 怒氣紋路（紅色戰紋）
  px(g, 4, 4, BERSERK_RAGE)
  px(g, 5, 5, BERSERK_RAGE)
  px(g, 9, 4, BERSERK_RAGE)
  px(g, 8, 5, BERSERK_RAGE)
  // 胸口傷疤
  hline(g, 5, 4, 3, 0x884433)
  // 暗面
  rect(g, 3, 8, 8, 2, BERSERK_DARK)

  // 頭（怒髮衝冠）
  rect(g, 5, 1, 4, 3, BERSERK_SKIN)
  px(g, 4, 2, BERSERK_SKIN)
  px(g, 9, 2, BERSERK_SKIN)
  // 怒髮（紅色尖刺）
  px(g, 5, 0, BERSERK_RAGE)
  px(g, 6, 0, BERSERK_RAGE)
  px(g, 7, 0, BERSERK_RAGE)
  px(g, 8, 0, BERSERK_RAGE)
  px(g, 6, -1, 0xee2222) // 最高髮尖
  // 紅眼（狂暴發光）
  px(g, 6, 2, 0xff2222)
  px(g, 8, 2, 0xff2222)
  px(g, 6, 1, 0xff4444) // 眼上紅光
  px(g, 8, 1, 0xff4444)
  // 獠牙
  px(g, 5, 3, OGRE_TUSK)
  px(g, 8, 3, OGRE_TUSK)
  px(g, 5, 4, 0xddddbb)

  // 粗手臂（裸露肌肉）
  rect(g, 1, 4, 2, 5, BERSERK_SKIN)
  rect(g, 11, 4, 2, 5, BERSERK_SKIN)
  px(g, 0, 5, BERSERK_DARK)
  px(g, 13, 5, BERSERK_DARK)
  // 臂環（紅色戰飾）
  px(g, 1, 4, BERSERK_RAGE)
  px(g, 12, 4, BERSERK_RAGE)

  // 雙戰斧
  // 左斧
  rect(g, 0, 1, 2, 2, BERSERK_AXE)
  px(g, 0, 0, 0xaaaaaa) // 斧刃亮點
  vline(g, 1, 2, 3, 0x6a5a3a) // 斧柄
  // 右斧
  rect(g, 12, 1, 2, 2, BERSERK_AXE)
  px(g, 13, 0, 0xaaaaaa) // 斧刃亮點
  vline(g, 12, 2, 3, 0x6a5a3a) // 斧柄

  // 粗腿
  rect(g, 4, 10, 3, 2, BERSERK_DARK)
  rect(g, 8, 10, 3, 2, BERSERK_DARK)
  // 腳
  rect(g, 3, 12, 4, 2, 0x5a4a2a)
  rect(g, 7, 12, 4, 2, 0x5a4a2a)

  g.generateTexture(TEXTURE_KEYS.BERSERKER_OGRE, W, H)
  g.destroy()
}

// ============ 公開 API ============

export function generateAllTextures(scene: Phaser.Scene): void {
  generateBrickWall(scene)
  generateFloorTile(scene)
  generateDoor(scene)
  generateGoblin(scene)
  generateSkeleton(scene)
  generateOgre(scene)
  generateAdventurer(scene)
  generatePaladin(scene)
  generateChicken(scene)
  generateIconGold(scene)
  generateIconHeart(scene)
  generateIconWave(scene)
  generateIconTrap(scene)
  generateShadow(scene)
  // 進化型
  generateGoblinAssassin(scene)
  generateGoblinCaptain(scene)
  generateSkeletonArcher(scene)
  generateSkeletonMage(scene)
  generateIroncladOgre(scene)
  generateBerserkerOgre(scene)
}

// ============ 單位 Texture 對照表 ============

export const UNIT_TEXTURE_MAP: Record<string, string> = {
  goblin: TEXTURE_KEYS.GOBLIN,
  skeleton: TEXTURE_KEYS.SKELETON,
  ogre: TEXTURE_KEYS.OGRE,
  adventurer: TEXTURE_KEYS.ADVENTURER,
  paladin: TEXTURE_KEYS.PALADIN,
  chicken: TEXTURE_KEYS.CHICKEN,
  // 進化型獨立紋理
  goblin_assassin: TEXTURE_KEYS.GOBLIN_ASSASSIN,
  goblin_captain: TEXTURE_KEYS.GOBLIN_CAPTAIN,
  skeleton_archer: TEXTURE_KEYS.SKELETON_ARCHER,
  skeleton_mage: TEXTURE_KEYS.SKELETON_MAGE,
  berserker_ogre: TEXTURE_KEYS.BERSERKER_OGRE,
  ironclad_ogre: TEXTURE_KEYS.IRONCLAD_OGRE,
}

// 進化型 tint 色差區分
export const EVOLUTION_TINTS: Record<string, number> = {
  goblin_assassin: 0xaa66cc,   // 紫色
  goblin_captain: 0xcc5555,    // 紅色
  skeleton_archer: 0x66ccaa,   // 青色
  skeleton_mage: 0x5588cc,     // 藍色
  berserker_ogre: 0xcc6644,    // 橘紅
  ironclad_ogre: 0x8888aa,     // 銀灰
}
