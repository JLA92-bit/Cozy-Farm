/**
 * 1.8.5 Skills: four skills (Farming, Animals, Fishing, Cooking) level 1-10 by doing what players already
 * enjoy. XP comes from the game's own stat counters (skills.json says which stat gives how much), a level gives a
 * small bonus, and at levels 5 and 10 the player picks one of two perks. What the levels and perks DO lives in
 * SkillEffects.ts; this file keeps the XP, the choices, the one-time head start and the level-up messages.
 */
import { SKILLS, SKILL, SKILL_HEADSTART_MAX, SKILL_PERK_LEVELS, SKILL_XP_LEVELS, type SkillDef, type SkillId, type SkillPerkDef } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { mail } from './Mail';
import { MAX_SKILL_LEVEL, levelForXp, skillLevel, skillState, skillXp } from './SkillEffects';
import { logEvent } from '../online/Events';

export interface SkillProgress { level: number; xp: number; into: number; need: number; pct: number; max: boolean }

class SkillsSystem {
  private started = false;

  list(): SkillDef[] { return SKILLS; }
  level(id: SkillId): number { return skillLevel(id); }
  xp(id: SkillId): number { return skillXp(id); }

  progress(id: SkillId): SkillProgress {
    const xp = skillXp(id), level = levelForXp(xp);
    if (level >= MAX_SKILL_LEVEL) return { level, xp, into: 0, need: 0, pct: 100, max: true };
    const from = SKILL_XP_LEVELS[level - 1], to = SKILL_XP_LEVELS[level];
    return { level, xp, into: xp - from, need: to - from, pct: Math.min(100, Math.round(((xp - from) / (to - from)) * 100)), max: false };
  }

  /** Perk ids chosen so far (in level order). */
  chosen(id: SkillId): string[] { return game.state.skills?.perks[id] ?? []; }

  /** The perk level (5 or 10) waiting for a choice in this skill, or null. */
  pendingChoice(id: SkillId): number | null {
    const picked = this.chosen(id).length, lvl = skillLevel(id);
    const next = SKILL_PERK_LEVELS[picked];
    return next !== undefined && lvl >= next ? next : null;
  }
  /** How many perk choices are waiting across all skills (the dot on the Skills tab and the Me button). */
  pendingCount(): number { return SKILLS.filter((s) => this.pendingChoice(s.id) !== null).length; }

  /** The two perks on offer at a perk level of a skill. */
  options(id: SkillId, perkLevel: number): SkillPerkDef[] { return SKILL[id].perks[String(perkLevel)] ?? []; }

  /** Pick a perk for the waiting perk level. Returns false when nothing is waiting or the perk is not on offer. */
  choose(id: SkillId, perkId: string): boolean {
    const lvl = this.pendingChoice(id);
    if (lvl === null) return false;
    const perk = this.options(id, lvl).find((p) => p.id === perkId);
    if (!perk) return false;
    const st = skillState();
    (st.perks[id] ??= []).push(perk.id);
    saves.save();
    game.bus.emit('toast', { title: perk.name, sub: perk.text, icon: perk.icon });
    game.bus.emit('sfx', { name: 'bonus' });
    game.bus.emit('state:changed', {});
    logEvent('skill_perk', { skill: id, perk: perk.id });
    return true;
  }

  /** Add XP to a skill, with a message when it levels up. */
  addXp(id: SkillId, n: number): void {
    if (n <= 0) return;
    const st = skillState();
    const before = levelForXp(st.xp[id] ?? 0);
    st.xp[id] = Math.floor((st.xp[id] ?? 0) + n);
    const after = levelForXp(st.xp[id]);
    if (after > before) this.levelUp(id, after);
  }

  private levelUp(id: SkillId, level: number): void {
    const def = SKILL[id];
    const choose = SKILL_PERK_LEVELS.includes(level);
    game.bus.emit('toast', { title: `${def.name} level ${level}!`, sub: choose ? 'Choose a new perk in Me > Skills' : def.perLevel, icon: def.icon });
    game.bus.emit('sfx', { name: 'bonus' });
    game.bus.emit('state:changed', {});
    logEvent('skill_level', { skill: id, level });
  }

  /**
   * Once per farm: starting XP from what the player already did (their stat counters), at most level 5, with the
   * perk choice waiting. Brand new farms have no stats, so nothing happens. Returns true if XP was given.
   */
  applyHeadStart(): boolean {
    const st = skillState();
    if (st.headStart) return false;
    st.headStart = true;
    const cap = SKILL_XP_LEVELS[SKILL_HEADSTART_MAX - 1];
    let any = false;
    for (const s of SKILLS) {
      let total = 0;
      for (const [stat, w] of Object.entries(s.xp)) total += game.stat(stat) * w;
      const xp = Math.min(cap, Math.floor(total));
      if (xp > (st.xp[s.id] ?? 0)) { st.xp[s.id] = xp; any = true; }
    }
    if (any) {
      const l = mail.send('hazel', 'Your skills are growing',
        `Dear ${game.state.player.name},\n\nAll that harvesting, feeding, fishing and baking has not gone unnoticed. Everything you have done on the farm so far now counts towards your skills, and you start ahead.\n\nOpen Me > Skills to see them, and to choose a perk where one is waiting.\n\nWith love,\nHazel`);
      st.letter = l.id;
      logEvent('skills_headstart', { farming: levelForXp(st.xp.farming ?? 0), animals: levelForXp(st.xp.animals ?? 0), fishing: levelForXp(st.xp.fishing ?? 0), cooking: levelForXp(st.xp.cooking ?? 0) });
    }
    saves.save();
    return any;
  }

  /** Start listening (once, after the farm is loaded): stat counters turn into skill XP. */
  init(): void {
    if (this.started) return;
    this.started = true;
    skillState();
    this.applyHeadStart();
    const weights = new Map<string, { skill: SkillId; w: number }[]>();
    for (const s of SKILLS) for (const [stat, w] of Object.entries(s.xp)) { const a = weights.get(stat) ?? []; a.push({ skill: s.id, w }); weights.set(stat, a); }
    game.bus.on('stat', ({ stat, delta }) => {
      const hit = weights.get(stat);
      if (hit && delta > 0) for (const { skill, w } of hit) this.addXp(skill, delta * w);
    });
  }
}

export const skills = new SkillsSystem();
