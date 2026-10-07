/**
 * 1.8 "Village Friends" welcome for players who farmed before 1.8, the one-time head start, and the short intro
 * new farms get at level 3. This file holds the rules and the saved progress (SaveData.welcome18); the cards
 * are in src/ui/panels/Welcome18Panel.ts.
 *
 * - Head start (once, `headStart`): friendship from past orders, min(300, round(orders * 15 / 6)) points with
 *   every villager (up to 3 hearts each), added quietly with reason 'headstart' so heart milestones can queue
 *   their rewards calmly, plus the Founding Farmer sign in building storage.
 * - Full welcome (`done` false): Hazel's letter, meet the villagers, four "what's new" cards, the first gift to
 *   Rosa (200 coins), and "your farm in 1.8". Resumes at `step` after "Later" or a reload.
 * - Short intro (`short`, new farms only): Hazel's letter, meet the villagers and the first gift, at level 3.
 */
import { game } from './Game';
import { saves } from './Save';
import { mail } from './Mail';
import { village } from './Village';
import { VILLAGER, VILLAGERS, ITEMS } from '../data';
import { logEvent } from '../online/Events';
import type { Letter } from './State';

export type W18Step = 'letter' | 'villagers' | 'news_village' | 'news_quality' | 'news_mail' | 'news_help' | 'gift' | 'summary';
export type W18Variant = 'full' | 'short';

export const W18_STEPS: Record<W18Variant, W18Step[]> = {
  full: ['letter', 'villagers', 'news_village', 'news_quality', 'news_mail', 'news_help', 'gift', 'summary'],
  short: ['letter', 'villagers', 'gift'],
};

/** Numbers of the welcome (kept here so the cards and the rules agree). */
export const W18 = {
  /** coins for the first gift to Rosa */
  giftCoins: 200,
  giftVillager: 'rosa',
  /** Hazel's basket when the barn has nothing Rosa likes */
  basket: { strawberry: 3 } as Record<string, number>,
  headStartPerOrder: 15 / 6,
  headStartMax: 300,
  /** new farms meet the villagers once the first-day tutorial is well behind them */
  shortLevel: 3,
  sign: 'founding_sign',
};

/** Hazel's welcome letter (full welcome) and her hello to a new farmer (short intro). */
export function hazelLetter(variant: W18Variant, name: string): { title: string; body: string } {
  const who = name.trim() || 'farmer';
  if (variant === 'short') {
    return {
      title: 'The village is waking up...',
      body: `Dear ${who},\n\nWord travels fast down the lane: there is a new farmer in the valley, and a busy one at that!\n\nThe village is waking up for the season, and we would love to meet you. Pop by the Village whenever you like, say hello, and if you have something nice from your farm, we do love a little gift.\n\nI run the village shop, so you will see a lot of me.\n\nWarmly,\nHazel`,
    };
  }
  return {
    title: 'The village is waking up...',
    body: `Dear ${who},\n\nThe village is waking up, and it is all thanks to you. All those orders you filled have not gone unnoticed: Rosa, Old Tom, Juniper, Pip, Bram and I feel like old friends already.\n\nFrom today you can visit us in the Village, bring us little gifts and watch our friendship grow. Some of your harvests will come out silver or gold now, and letters like this one will arrive in your new mailbox.\n\nEverything on your farm is just as you left it. We even made you a little sign to say thank you for being here from the start.\n\nCome and say hello!\nHazel, from the village shop`,
  };
}

class Welcome18System {
  /** true while the welcome cards (or the first-gift helper) are on screen */
  running = false;
  /** Settings > Replay: the same cards again, but no rewards, letters or saved progress */
  replay = false;

  private get w() { return game.state.welcome18; }

  /** Which welcome this farm still has to see, if any (never before the farmer exists and the tutorial is done). */
  pending(): W18Variant | null {
    const s = game.state;
    if (!s?.player.created || !s.tutorial.done) return null;
    if (!this.w.done) return 'full';
    if (this.w.short && s.player.level >= W18.shortLevel) return 'short';
    return null;
  }

  /** The saved step for a variant, kept inside its list. */
  stepIndex(variant: W18Variant): number {
    return Math.max(0, Math.min(W18_STEPS[variant].length - 1, this.w.step));
  }

  /** A brand-new farm (no save yet): the full welcome is skipped, the short one waits for level 3. */
  markNewFarm(): void {
    if (this.w.done) this.w.short = true;
  }

  /** Friendship points the head start gives each villager. */
  headStartPoints(): number {
    return Math.min(W18.headStartMax, Math.round(game.stat('orders_completed') * W18.headStartPerOrder));
  }

  /**
   * Once per farm from before 1.8: friendship from past orders and the Founding Farmer sign. Points go through
   * village.addPoints with reason 'headstart' (one 'village:points' event per villager), so milestone code can
   * tell them apart from friendship earned in play. Returns what was given, or null if it was given before.
   */
  applyHeadStart(): { points: number; hearts: number } | null {
    const w = this.w;
    if (w.headStart) return null;
    w.headStart = true;
    const points = this.headStartPoints();
    if (points > 0) for (const v of VILLAGERS) if (village.points(v.id) < points) village.addPoints(v.id, points - village.points(v.id), 'headstart');
    game.state.storage[W18.sign] = Math.max(1, game.state.storage[W18.sign] ?? 0);
    saves.save();
    const hearts = village.hearts(VILLAGERS[0].id);
    logEvent('headstart', { orders: game.stat('orders_completed'), points, hearts });
    return { points, hearts };
  }

  /** Hazel's letter in the mailbox (sent once; in a replay the one already sent, or a fresh copy that is not stored). */
  letter(variant: W18Variant): Letter {
    const w = this.w;
    const sent = w.letter !== undefined ? game.state.mail.letters.find((l) => l.id === w.letter) : undefined;
    if (sent) return sent;
    const { title, body } = hazelLetter(variant, game.state.player.name);
    if (this.replay) return { id: 0, at: game.now(), from: 'hazel', title, body, read: true, claimed: true };
    const l = mail.send('hazel', title, body);
    w.letter = l.id;
    saves.save();
    return l;
  }

  /** Items in the barn Rosa loves or likes, loved first, with how many there are. */
  giftOptions(id = W18.giftVillager): { item: string; taste: 'love' | 'like'; n: number }[] {
    const out: { item: string; taste: 'love' | 'like'; n: number }[] = [];
    for (const [item, n] of Object.entries(game.state.inventory)) {
      if (n <= 0 || !ITEMS[item]) continue;
      const t = village.taste(id, item);
      if (t === 'love' || t === 'like') out.push({ item, taste: t, n });
    }
    return out.sort((a, b) => (a.taste === b.taste ? b.n - a.n : a.taste === 'love' ? -1 : 1));
  }

  /** Hazel's basket of strawberries, once, when there is nothing Rosa would enjoy. Returns true when given now. */
  ensureBasket(): boolean {
    if (this.replay || this.w.basket || this.giftOptions().length) return false;
    for (const [item, n] of Object.entries(W18.basket)) if (ITEMS[item]) game.addItem(item, n);
    this.w.basket = true;
    saves.save();
    logEvent('welcome_basket');
    return true;
  }

  /** Rosa already had a gift from this farm today (the first-gift step counts it as done). */
  giftedToday(): boolean { return !village.canGift(W18.giftVillager); }

  /** Move to a step (saved, so a reload resumes there). */
  setStep(variant: W18Variant, i: number): void {
    if (this.replay) return;
    this.w.step = Math.max(0, Math.min(W18_STEPS[variant].length - 1, i));
    saves.save();
    logEvent('welcome_step', { step: W18_STEPS[variant][this.w.step], n: this.w.step, variant });
  }

  /** The first gift reached Rosa: 200 coins, once per welcome. Returns the coins given (0 in a replay). */
  rewardGift(variant: W18Variant): number {
    if (this.replay) return 0;
    const steps = W18_STEPS[variant];
    const gi = steps.indexOf('gift');
    // the reward belongs to leaving the gift step forwards; a reload after it can never pay twice
    if (this.w.step !== gi) return 0;
    this.w.step = Math.min(steps.length - 1, gi + 1);
    game.addCoins(W18.giftCoins);
    saves.save();
    logEvent('welcome_gift', { variant });
    return W18.giftCoins;
  }

  /** All done: the welcome never comes back by itself (Settings can replay it). */
  finish(variant: W18Variant): void {
    if (this.replay) return;
    const w = this.w;
    w.done = true;
    delete w.short;
    w.step = W18_STEPS[variant].length;
    saves.save();
    logEvent('welcome_done', { variant });
  }

  later(variant: W18Variant): void {
    if (!this.replay) logEvent('welcome_later', { step: W18_STEPS[variant][this.stepIndex(variant)], variant });
  }

  /** Short names for the six villagers ("Rosa, Old Tom, ... and Bram"). */
  names(): string {
    const n = VILLAGERS.map((v) => VILLAGER[v.id].name);
    return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  }
}

export const welcome18 = new Welcome18System();
