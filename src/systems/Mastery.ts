/**
 * 1.8.6 Mastery plaques: from level 40 every crop and every workshop that makes starred goods has a gold-star
 * challenge. Progress is counted from the stats `gold_<item>` that Quality.addRolled keeps (so it starts when 1.8.6
 * is installed). Finishing one gives coins, gems and a Mastery Plaque decoration for the farm. The numbers are in
 * mastery.json.
 */
import { BUILDINGS, CROPS, ITEMS, MASTERY, RECIPES } from '../data';
import { game } from './Game';
import { saves } from './Save';
import { rollsQuality } from './Quality';
import { logEvent } from '../online/Events';
import { hints } from './Hints';
import { LINES, type LineDef } from './MasteryEffects';

export interface MasteryEntry { id: string; kind: 'crop' | 'workshop'; name: string; icon: string; target: number; items: string[] }

function buildEntries(): MasteryEntry[] {
  const out: MasteryEntry[] = CROPS.map((c) => ({ id: `crop:${c.id}`, kind: 'crop' as const, name: c.name, icon: c.id, target: MASTERY.cropGold, items: [c.id] }));
  for (const b of BUILDINGS) {
    if (b.cat !== 'production') continue;
    const items = [...new Set(RECIPES.filter((r) => r.building === b.id && rollsQuality(r.item)).map((r) => r.item))];
    if (items.length) out.push({ id: `workshop:${b.id}`, kind: 'workshop', name: b.name, icon: b.icon ?? b.id, target: MASTERY.workshopGold, items });
  }
  return out;
}

class MasterySystem {
  private cached: MasteryEntry[] | null = null;
  private started = false;

  get entries(): MasteryEntry[] { return (this.cached ??= buildEntries()); }
  get st(): { done: string[]; picks?: Record<string, string> } { return (game.state.mastery ??= { done: [] }); }

  /** 1.25 the lines a mastered entry can take, and the one picked (picked once, for good). */
  lines(e: MasteryEntry): LineDef[] { return LINES[e.kind] ?? []; }
  picked(id: string): string | undefined { return game.state.mastery?.picks?.[id]; }
  /** A line's text for this entry ({name}, {pct}). */
  lineText(e: MasteryEntry, l: LineDef): string {
    const pct = `${Math.round(((l.chance ?? l.gold ?? (l.mult !== undefined ? 1 - l.mult : 0)) as number) * 100)}%`;
    return l.text.split('{name}').join(e.name).split('{pct}').join(pct);
  }
  /** Pick a line for a mastered entry. False when it is not mastered, already has a line, or the line is unknown. */
  pick(id: string, line: string): boolean {
    const e = this.entries.find((x) => x.id === id);
    if (!e || !this.isDone(id) || this.picked(id) || !this.lines(e).some((l) => l.id === line)) return false;
    (this.st.picks ??= {})[id] = line;
    game.incStat('mastery_lines');
    logEvent('mastery_line', { id, line });
    saves.save();
    return true;
  }
  /** Mastered entries still waiting for a line (the dot on Me > Mastery). */
  unpicked(): number { return this.entries.filter((e) => this.isDone(e.id) && !this.picked(e.id)).length; }

  isOpen(): boolean { return game.level >= MASTERY.unlockLevel; }
  isDone(id: string): boolean { return !!game.state.mastery?.done.includes(id); }
  doneCount(): number { return game.state.mastery?.done.length ?? 0; }
  progress(e: MasteryEntry): number { return Math.min(e.target, e.items.reduce((s, i) => s + game.stat(`gold_${i}`), 0)); }
  itemName(id: string): string { return ITEMS[id]?.name ?? id; }

  /** Finish every challenge whose count has been reached (only from the unlock level). */
  check(): void {
    if (!this.isOpen()) return;
    // a one-time tip the first time Mastery is open (level 40, or already past it when 1.8.6 arrives)
    if (hints.firstTime('intro:mastery')) setTimeout(() => game.bus.emit('toast', { title: 'Mastery is open!', sub: 'Grow gold crops and make gold goods to earn plaques. See Me > Mastery.', icon: 'trophy' }), 3500);
    for (const e of this.entries) {
      if (this.isDone(e.id) || this.progress(e) < e.target) continue;
      this.st.done.push(e.id);
      game.addCoins(MASTERY.reward.coins);
      game.addGems(MASTERY.reward.gems);
      game.state.storage[MASTERY.plaque] = (game.state.storage[MASTERY.plaque] ?? 0) + 1;
      game.discover(MASTERY.plaque, 'building');
      game.incStat('masteries');
      game.setGauge('masteries', this.doneCount());
      game.bus.emit('toast', { title: `${e.name} mastered!`, sub: `A Mastery Plaque is in your storage, plus ${MASTERY.reward.coins} coins and ${MASTERY.reward.gems} gems. Pick its mastery line in Me > Mastery.`, icon: 'trophy' });
      game.bus.emit('sfx', { name: 'levelup' });
      logEvent('mastery', { id: e.id, level: game.level });
    }
    saves.save();
  }

  init(): void {
    if (this.started) return;
    this.started = true;
    game.bus.on('stat', ({ stat }) => { if (stat.startsWith('gold_')) this.check(); });
    game.bus.on('levelup', () => this.check());
    this.check();
  }
}

export const mastery = new MasterySystem();
