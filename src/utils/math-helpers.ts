/**
 * 數學工具函式
 */

import type { SeededRNG } from './seeded-rng';

/**
 * 計算兩點間距離
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 正規化向量
 */
export function normalize(x: number, y: number): { x: number; y: number } {
  const length = Math.sqrt(x * x + y * y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: x / length,
    y: y / length,
  };
}

/**
 * 限制數值在範圍內
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 線性插值
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/**
 * 生成範圍內隨機數
 * 可選使用 seeded RNG
 */
export function randomInRange(
  min: number,
  max: number,
  rng?: SeededRNG
): number {
  const random = rng ? rng.next() : Math.random();
  return min + random * (max - min);
}
