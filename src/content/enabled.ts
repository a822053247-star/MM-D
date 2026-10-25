import type { SkillId } from '../core/progression';
import type { BaseAttackId } from '../core/fusion';
import { EFFECT_RECIPES, type EffectRecipeId, type EffectAtlasId } from './effect-recipes.ts';

interface EnabledContent {
  id: SkillId;
  title: string;
  attack?: BaseAttackId;
  effect?: EffectRecipeId;
  codePresent: boolean;
  ruleIntegrated: boolean;
  presentationIntegrated: boolean;
  resourcesIntegrated: boolean;
  userAccepted: boolean;
}
const integrated = { codePresent: true, ruleIntegrated: true, presentationIntegrated: true, resourcesIntegrated: true, userAccepted: false } as const;

/** Only integrated content enters the campaign pool; visual acceptance is tracked separately. */
export const ENABLED_CONTENT: readonly EnabledContent[] = [
  { id: 'damage', title: '魔力浓缩', ...integrated },
  { id: 'haste', title: '施法节拍', ...integrated },
  { id: 'multishot', title: '分枝魔法', ...integrated },
  { id: 'vitality', title: '蓬勃生长', ...integrated },
  { id: 'movement', title: '草叶轻步', ...integrated },
  { id: 'range', title: '远星回响', ...integrated },
  { id: 'orbit', title: '伴星魔法球', ...integrated },
  { id: 'shockwave', title: '草原冲击波', ...integrated },
  { id: 'spark-weapon', title: '火花弹', attack: 'spark', effect: 'spark-projectile', ...integrated },
  { id: 'flame-sweep-weapon', title: '火焰横扫', attack: 'flame-sweep', effect: 'flame-sweep', ...integrated },
  { id: 'leaf-weapon', title: '飞叶弹', attack: 'leaf', effect: 'leaf-projectile', ...integrated },
  { id: 'bubble-weapon', title: '水泡弹', attack: 'bubble', effect: 'bubble-projectile', ...integrated },
  { id: 'azure-burst', title: '苍蓝震爆', effect: 'azure-burst', ...integrated },
  { id: 'star-tide', title: '星潮脉冲', effect: 'star-tide', ...integrated },
  { id: 'still-sea', title: '静海法阵', effect: 'still-sea', ...integrated },
  { id: 'returning-ring', title: '回流水环', effect: 'returning-ring', ...integrated },
  { id: 'thunder-bud-weapon', title: '雷芽连锁', attack: 'thunder-bud', effect: 'thunder-chain', ...integrated },
  { id: 'frost-crystal-weapon', title: '霜晶弹', attack: 'frost-crystal', effect: 'frost-projectile', ...integrated },
  { id: 'glacier-trail', title: '冰川滑痕', effect: 'glacier-trail', ...integrated },
  { id: 'thorn-wheel-weapon', title: '环刃荆轮', attack: 'thorn-wheel', effect: 'thorn-wheel', ...integrated },
  { id: 'tidal-blade-weapon', title: '回旋潮刃', attack: 'tidal-blade', effect: 'tidal-blade', ...integrated },
  { id: 'abyss-vortex', title: '深渊漩涡', effect: 'abyss-vortex', ...integrated },
  { id: 'ice-radiance', title: '冰棱放射', effect: 'ice-radiance', ...integrated },
  { id: 'spore-trail', title: '孢火足迹', effect: 'spore-trail', ...integrated },
  { id: 'tidal-recall', title: '潮汐回收', effect: 'tidal-recall', ...integrated },
  { id: 'screen-nova', title: '星陨爆发', effect: 'screen-nova', ...integrated },
  { id: 'screen-barrage', title: '星雨弹幕', effect: 'screen-barrage', ...integrated },
  { id: 'shatter-ring', title: '碎冰震环', effect: 'shatter-ring', ...integrated },
  { id: 'dream-dart-weapon', title: '绯梦弹', attack: 'dream-dart', effect: 'dream-dart', ...integrated },
  { id: 'resonance-seed-weapon', title: '共鸣花种', attack: 'resonance-seed', effect: 'resonance-seed', ...integrated },
  { id: 'sakura-echo', title: '绯樱回响', effect: 'sakura-echo', ...integrated },
];
export const CAMPAIGN_SKILLS: ReadonlySet<SkillId> = new Set(ENABLED_CONTENT
  .filter(item => item.codePresent && item.ruleIntegrated && item.presentationIntegrated && item.resourcesIntegrated).map(item => item.id));
const byId = new Map(ENABLED_CONTENT.map(item => [item.id as string, item]));

export function effectDependencies(contentIds: readonly string[]): EffectAtlasId[] {
  const atlases = new Set<EffectAtlasId>();
  for (const id of contentIds) {
    const item = byId.get(id);
    if (!item) throw new Error(`未注册的内容：${id}`);
    if (item.effect) for (const atlas of EFFECT_RECIPES[item.effect].atlases) atlases.add(atlas);
  }
  return [...atlases];
}
export const RELEASE_EFFECT_ATLASES = effectDependencies([...CAMPAIGN_SKILLS]);

/** Only reads ranks/origins; no rendering or mutation of the combat model. */
export function activeEffectContents(ranks: Readonly<Partial<Record<SkillId, number>>>, hasOrigin: (id: BaseAttackId) => boolean) {
  return ENABLED_CONTENT.filter(item => item.effect && (item.attack ? hasOrigin(item.attack) : (ranks[item.id] ?? 0) > 0))
    .map(item => item.id);
}
