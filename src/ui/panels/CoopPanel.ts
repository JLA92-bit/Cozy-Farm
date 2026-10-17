import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, fmt } from '../dom';
import { ui } from '../UI';
import { COOP, ITEMS, type CoopDef } from '../../data';
import { game } from '../../systems/Game';
import { coop } from '../../systems/Coop';
import { social } from '../../systems/Social';
import { audio } from '../../systems/Audio';
import { coopFraction, coopLeft } from '../../online/Coop';
import type { CoopProject } from '../../online/types';
import './friends.css';

const daysLeft = (p: CoopProject): number => Math.max(0, Math.ceil((p.expiresAt - game.now()) / 864e5));
const needsLine = (d: CoopDef): HTMLElement => h('div', { class: 'cp-needs' }, ...Object.entries(d.needs).map(([k, n]) => h('span', { class: 'cp-need' }, itemIcon(k, 'cp-mini'), `${n}`)));

/**
 * 1.28 Together: Village Projects. Your own project (or the list to start one), your friends' projects to give to,
 * and the plaques from projects you finished together.
 */
export function openCoop(): void {
  const p = new Panel({ title: 'Village Projects', icon: 'hug', color: 'pink', size: 'large', wallet: true });
  let busy = false;
  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    busy = true;
    try { await fn(); audio.play('reward'); } catch (e) { ui.feedback.toast('Not just now', (e as Error).message, 'info'); audio.play('error'); }
    busy = false;
    render();
  };

  const projectCard = (pr: CoopProject): HTMLElement => {
    const d = coop.def(pr.kind)!;
    const pct = Math.round(coopFraction(pr) * 100), left = coopLeft(pr), mine = pr.host.id === coop.mine()?.host.id && pr.status === 'open';
    const rows = Object.entries(pr.needs).map(([item, need]) => {
      const l = left[item] ?? 0, have = game.count(item), give = Math.min(l, have, COOP.maxGive);
      return h('div', { class: 'cp-row' }, itemIcon(item, 'cp-icon'),
        h('div', { class: 'grow' }, h('div', { class: 'cp-name' }, ITEMS[item]?.name ?? item), h('div', { class: 'muted' }, l ? `${need - l} of ${need} given. You have ${fmt(have)}.` : `All ${need} given.`)),
        pr.status === 'open' && l > 0 ? button(give > 0 ? `Give ${give}` : 'Give', () => void act(async () => {
          const used = await coop.give(pr, item, give);
          ui.feedback.toast(`Gave ${used} ${ITEMS[item]?.name ?? item}`, `To ${pr.host.name}'s ${d.name}.`, d.icon);
        }), `small ${give > 0 ? 'green' : 'disabled'}`) : icon('check'));
    });
    const status = pr.status === 'done' ? 'Finished! Everyone who gave gets the reward.' : pr.status === 'open' ? `${pct}% there. ${daysLeft(pr)} days left.` : 'Closed before it was finished: everyone got their goods back.';
    return h('div', { class: 'card cp-card' },
      h('div', { class: 'title' }, icon(d.icon), ` ${d.name}`, h('span', { class: 'muted' }, `  hosted by ${pr.host.name}`)),
      h('div', { class: 'sub' }, status),
      h('div', { class: 'progress' }, h('div', { class: 'fill', style: `width:${pct}%` }), h('div', { class: 'label' }, `${pct}%`)),
      ...rows,
      pr.givers.length ? h('div', { class: 'muted cp-givers' }, `Helping: ${pr.givers.map((g) => `${g.me ? 'you' : g.name} (${g.qty})`).join(', ')}`) : null,
      mine ? button('Cancel project', () => void act(() => coop.cancel(pr)), 'small red') : null);
  };

  const render = () => {
    clear(p.body);
    if (!coop.available) {
      p.body.append(h('div', { class: 'empty-state' }, icon('lock'), h('div', null, game.level < COOP.level ? `Village Projects open at level ${COOP.level}.` : 'Village Projects are resting for now.')));
      return;
    }
    p.body.append(h('div', { class: 'sq-intro-text' }, `Build something together with your friends. Everyone who gives gets the decoration and a plaque with all your names. If a project runs out of time (${COOP.days} days), everyone gets their goods back.`));
    if (social.practice) p.body.append(h('div', { class: 'social-note' }, icon('info'), h('div', null, h('b', null, 'Practice mode. '), 'Demo neighbours on your friends list join in now and then, and one of them hosts a project too.')));
    if (coop.error) p.body.append(h('div', { class: 'muted' }, coop.error));
    const mine = coop.mine();
    p.body.append(h('div', { class: 'section-title' }, 'Your project'));
    if (mine) p.body.append(projectCard(mine));
    else {
      if (!social.state.friends.length) p.body.append(h('div', { class: 'muted' }, 'Add friends first: only friends can see and join your project.'));
      for (const d of COOP.projects) {
        const ok = game.level >= d.level;
        p.body.append(h('div', { class: `card cp-card${ok ? '' : ' locked'}` },
          h('div', { class: 'title' }, icon(ok ? d.icon : 'lock'), ` ${d.name}`), h('div', { class: 'sub' }, d.about), needsLine(d),
          ok ? button([icon('hug'), 'Host with my friends'], () => void act(async () => { await coop.host(d.id); ui.feedback.toast(`${d.name} started!`, 'Your friends can see it now and give goods to it.', d.icon); }), 'small green')
            : h('div', { class: 'muted' }, `Opens at level ${d.level}.`)));
      }
    }
    const fr = coop.friends();
    p.body.append(h('div', { class: 'section-title' }, "Friends' projects"));
    if (!fr.length) p.body.append(h('div', { class: 'muted' }, coop.loaded ? 'None right now. When a friend hosts one and invites you, it shows here.' : 'Looking...'));
    for (const pr of fr) p.body.append(projectCard(pr));
    const plaques = coop.plaques();
    if (plaques.length) {
      p.body.append(h('div', { class: 'section-title' }, 'Your plaques'));
      for (const pl of [...plaques].reverse()) {
        const d = coop.def(pl.kind);
        p.body.append(h('div', { class: 'card cp-card' }, h('div', { class: 'title' }, icon(d?.icon ?? 'hug'), ` ${d?.name ?? pl.kind}`),
          h('div', { class: 'sub' }, `Built together by ${pl.names.join(', ')}.`), h('div', { class: 'muted' }, new Date(pl.at).toLocaleDateString())));
      }
    }
  };
  const off = coop.onChange(() => { if (!busy) render(); });
  p.onClose = () => off();
  render();
  p.open();
  void coop.poll();
}

ui.register('coop', () => openCoop());

// start polling once co-op is available (like Ask a friend: from the tick, once the farm is loaded)
let started = false, checkAt = 0;
ui.onTick((now) => {
  if (started || now - checkAt < 2000) return;
  checkAt = now;
  if (game.state && coop.available) { started = true; coop.start(); }
});
