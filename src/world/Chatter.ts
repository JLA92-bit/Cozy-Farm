import { ANIMAL, BUILDING, ITEMS, type VillagerDef } from '../data';
import { game } from '../systems/Game';
import { animals } from '../systems/Animals';
import { buildings } from '../systems/Buildings';
import { isBuilt, plotReady, settleProduction } from '../systems/Timers';
import type { PlacedBuilding } from '../systems/State';
import type { SayOpts } from '../ui/Speech';

/** Short, friendly lines for villagers, the farmer and the merchant. Pure text: no balance numbers here. */
export const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const fill = (s: string, vars: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
const lower = (s: string): string => s.toLowerCase();


const ANIMAL_SOUND: Record<string, string> = { cow: 'Moo!', chicken: 'Cluck cluck!', pig: 'Oink oink!', sheep: 'Baa!', goat: 'Meh-eh!' };

/** Is it evening or night right now? (Environment.night is 0 by day, 1 at night.) */
export const isNight = (night: number): boolean => night > 0.55;

export function greeting(night: number): SayOpts {
  return { icon: 'wave', text: pick(isNight(night) ? ['Evening!', 'Hi there!', 'Lovely night!'] : ['Hi!', 'Hello!', 'Howdy!', 'Morning!', 'Hey there!']) };
}

export function arrivalLine(night: number): SayOpts | null {
  const charm = buildings.charm();
  if (isNight(night)) return Math.random() < 0.5 ? { icon: 'moon', text: pick(['Evening stroll!', 'So peaceful at night.']) } : null;
  if (Math.random() > 0.45) return null;
  if (charm >= 300) return { icon: 'sparkle_heart', text: pick(['What a charming farm!', 'This place is magical!', 'Best farm in the valley!']) };
  if (charm >= 80) return { icon: 'heart', text: pick(['So cozy here!', 'What a pretty farm!', 'I love visiting!']) };
  return { icon: 'smile', text: pick(['Nice little farm!', 'Hello, farm!', 'Fresh air!']) };
}

export function leavingLine(night: number): SayOpts | null {
  if (isNight(night)) return { icon: 'zzz', text: pick(['Bedtime for me!', 'Getting late!']) };
  return Math.random() < 0.35 ? { icon: 'wave', text: pick(['Bye bye!', 'See you!', 'Off I go!']) } : null;
}

/** A villager admiring/visiting a building. */
export function reactionTo(b: PlacedBuilding): SayOpts {
  const def = BUILDING[b.type];
  const now = game.now();
  if (b.type === 'order_board') {
    const o = game.state.orders.list.find((x) => x.readyAt <= now);
    const it = o ? pick(o.lines).item : null;
    return it ? { icon: it, text: `I need some ${lower(ITEMS[it]?.name ?? it)}!` } : { icon: 'clipboard', text: pick(['Any orders today?', 'Let me see...']) };
  }
  if (b.type === 'roadside_stall') {
    const has = game.state.stall.slots.some((s) => s.item && s.soldAt && s.soldAt > now);
    return has ? { icon: 'bags', text: pick(['Ooh, fresh goods!', 'What a bargain!', 'I will take one!']) } : { icon: 'store', text: pick(['Nothing yet...', 'I will come back!']) };
  }
  if (def.cat === 'animal') {
    const a = def.animal ? ANIMAL[def.animal] : null;
    const c = animals.counts(b);
    if (!a) return { icon: 'heart' };
    if (c.hungry && !c.producing && !c.ready) return { icon: a.feed, text: 'They look hungry!' };
    return { icon: def.animal!, text: Math.random() < 0.5 ? (ANIMAL_SOUND[def.animal!] ?? 'Hello, cutie!') : pick(['Hello, cutie!', 'So fluffy!', 'Aww!']) };
  }
  if (b.type === 'plot' && b.plot) {
    const name = lower(ITEMS[b.plot.crop]?.name ?? b.plot.crop);
    return plotReady(b, now)
      ? { icon: b.plot.crop, text: fill(pick(['Mmm, {c}!', 'That {c} looks ripe!', 'Yum, {c}!']), { c: name }) }
      : { icon: 'seedling', text: fill(pick(['Grow, little {c}!', 'The {c} is coming along!']), { c: name }) };
  }
  if (def.cat === 'decor') {
    const big = def.charm >= 15;
    return { icon: big ? 'sparkle_heart' : pick(['heart', 'sparkles', 'blossom']), text: Math.random() < 0.6 ? fill(pick(big ? ['Wow, a {n}!', 'Look at that {n}!', 'So fancy!'] : ['What a lovely {n}!', 'So pretty!', 'I love this {n}!', 'How cozy!']), { n: lower(def.name) }) : undefined };
  }
  return { icon: 'smile' };
}

/**
 * What a named villager says when you tap them (1.8): hello the first time, their birthday, a line in their own
 * voice, or now and then a gentle hint about the farm.
 */
export function tapLine(v: VillagerDef, night: number, firstMeet: boolean, birthday: boolean): SayOpts {
  if (firstMeet) return { icon: 'wave', text: `Hi! I'm ${v.name}. ${v.role}.` };
  if (birthday) return { icon: 'birthday_cake', text: v.birthdayChat };
  const now = game.now();
  if (Math.random() < 0.2) {
    const ready = game.state.buildings.find((b) => b.type === 'plot' && b.plot && plotReady(b, now));
    if (ready?.plot) { const it = ready.plot.crop; return { icon: it, text: `Your ${lower(ITEMS[it]?.name ?? it)} is ready!` }; }
    if (buildings.charm() < 60) return { icon: 'blossom', text: 'More flowers would be so pretty!' };
  }
  if (isNight(night) && Math.random() < 0.25) return { icon: 'moon', text: pick(['Lovely evening, isn\'t it?', 'The stars are out!', 'Nearly bedtime for me.']) };
  return { icon: Math.random() < 0.5 ? v.icon : pick(['smile', 'heart', 'music', 'sun']), text: pick(v.chat) };
}

/** The farmer's own thoughts when tapped: the most useful nudge first. */
export function farmerLine(): SayOpts {
  const now = game.now();
  const bs = game.state.buildings;
  const ready = bs.find((b) => b.type === 'plot' && b.plot && plotReady(b, now));
  if (ready?.plot) return { icon: ready.plot.crop, text: 'Time to harvest!' };
  for (const b of bs) {
    const def = BUILDING[b.type];
    if (def.cat === 'production' && isBuilt(b, now)) { settleProduction(b, now); if (b.ready?.length) return { icon: b.ready[0], text: 'Something smells done!' }; }
  }
  for (const b of bs) {
    if (BUILDING[b.type].cat !== 'animal' || !b.animals?.length) continue;
    const c = animals.counts(b);
    if (c.ready) return { icon: ANIMAL[BUILDING[b.type].animal!].product, text: 'Goodies to collect!' };
    if (c.hungry && game.count(ANIMAL[BUILDING[b.type].animal!].feed) > 0) return { icon: ANIMAL[BUILDING[b.type].animal!].feed, text: 'The animals are hungry!' };
  }
  if (bs.some((b) => b.type === 'plot' && !b.plot)) return { icon: 'seedling', text: "Let's plant something!" };
  return { icon: pick(['music', 'sun', 'heart', 'smile']), text: pick(['What a day!', 'Farm life is the best!', 'La la la...', 'Everything is growing!', 'Love this place!']) };
}
