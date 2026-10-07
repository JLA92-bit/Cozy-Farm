/**
 * 1.8 mailbox: letters from villagers ('rosa'...), the developer ('team') and the game ('game'). Shared core;
 * the 1.8 mail agent builds the mailbox screen and the daily rhythm on it. Letters can carry coins, gems and
 * items, collected once with claim().
 */
import { game } from './Game';
import { saves } from './Save';
import { ITEMS } from '../data';
import type { Letter } from './State';
import { logEvent } from '../online/Events';

const KEEP = 200;

export class MailSystem {
  get letters(): Letter[] { return game.state.mail.letters; }
  unread(): number { return this.letters.filter((l) => !l.read || (!!l.attach && !l.claimed)).length; }
  /** Deliver a letter. Returns it. */
  send(from: string, title: string, body: string, attach?: Letter['attach']): Letter {
    const m = game.state.mail;
    const l: Letter = { id: m.nextId++, at: game.now(), from, title: title.slice(0, 80), body: body.slice(0, 2000), attach, read: false, claimed: !attach };
    m.letters.push(l);
    if (m.letters.length > KEEP) m.letters.splice(0, m.letters.length - KEEP);
    game.bus.emit('mail', { id: l.id });
    saves.save();
    return l;
  }
  markRead(id: number): void { const l = this.letters.find((x) => x.id === id); if (l && !l.read) { l.read = true; saves.save(); logEvent('mail_open', { from: l.from }); } }
  /** Collect what a letter carries, once. Returns what was added, or null. */
  claim(id: number): Letter['attach'] | null {
    const l = this.letters.find((x) => x.id === id);
    if (!l || l.claimed || !l.attach) return null;
    l.claimed = true;
    l.read = true;
    const a = l.attach;
    if (a.coins) game.addCoins(a.coins);
    if (a.gems) game.addGems(a.gems);
    for (const [k, n] of Object.entries(a.items ?? {})) if (ITEMS[k] && n > 0) game.addItem(k, n);
    saves.save();
    logEvent('mail_collect', { from: l.from, coins: a.coins ?? 0, gems: a.gems ?? 0, items: Object.keys(a.items ?? {}).length });
    return a;
  }
}

export const mail = new MailSystem();
