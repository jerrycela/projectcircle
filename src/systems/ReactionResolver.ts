import { Element } from '../config';
import type { ElementalState } from './ElementalState';

export type ReactionType = 'ELECTRO_STORM' | 'FLAME_BURST' | 'NO_REACTION';

export interface HitContext {
  source: 'auto-attack' | 'skill';
  skillType?: string;
  attackElement: Element | null;
  hitPosition: { x: number; y: number };
  alreadyHitIds: Set<number>;
  isSecondaryProc: boolean;
}

export interface ResolveResult {
  reaction: ReactionType;
  bonusDamage: number;
  flameAura?: boolean;
}

export class ReactionResolver {
  static resolve(
    enemy: { elementalState: ElementalState },
    hitContext: HitContext,
  ): ResolveResult {
    const enemyElement = enemy.elementalState.element;
    const attackElement = hitContext.attackElement;

    if (attackElement === null) {
      return { reaction: 'NO_REACTION', bonusDamage: 0 };
    }

    const reaction = ReactionResolver.getReaction(enemyElement, attackElement);

    if (reaction !== 'NO_REACTION' && !hitContext.isSecondaryProc) {
      enemy.elementalState.clear();
      // Full implementation in Wave 2C
      return { reaction, bonusDamage: 0 };
    }

    enemy.elementalState.apply(attackElement);
    return { reaction: 'NO_REACTION', bonusDamage: 0 };
  }

  private static getReaction(enemyElement: Element | null, attackElement: Element): ReactionType {
    if (enemyElement === Element.WATER && attackElement === Element.THUNDER) return 'ELECTRO_STORM';
    if (enemyElement === Element.FIRE && attackElement === Element.WIND) return 'FLAME_BURST';
    return 'NO_REACTION';
  }
}
