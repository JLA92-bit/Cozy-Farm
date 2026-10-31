import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, stableRefresh } from '../dom';
import { ui } from '../UI';
import { BUILDING, RECIPE } from '../../data';
import { game } from '../../systems/Game';
import { buildings } from '../../systems/Buildings';
import { formatTime, isBuilt, settleProduction } from '../../systems/Timers';
import { openProduction } from './ProductionPanel';
import type { PlacedBuilding } from '../../systems/State';

/**
 * 1.34.3 Workshops at a glance: every workshop on the farm with its queue, idle ones first,
 * so a big farm doesn't mean walking the map to find the one that stopped.
 */
type Row = { b: PlacedBuilding; ready: number; queued: number; slots: number; doneIn: number; label: string };

function rows(): Row[] {
  const now = game.now();
  const seen = new Map<string, number>();
  const out: Row[] = [];
  for (const b of game.state.buildings) {
    const def = BUILDING[b.type];
    if (def?.cat !== 'production' || !isBuilt(b, now)) continue;
    settleProduction(b, now);
    const k = (seen.get(b.type) ?? 0) + 1;
    seen.set(b.type, k);
    const q = (b.queue ?? []).filter((x) => x.end > now);
    const total = game.buildingsOf(b.type).length;
    out.push({ b, ready: b.ready?.length ?? 0, queued: q.length, slots: buildings.slots(b), doneIn: q.length ? Math.max(...q.map((x) => x.end)) - now : 0, label: total > 1 ? `${def.name} ${k}` : def.name });
  }
  // ready first, then idle, then the ones that finish soonest
  const rank = (r: Row) => (r.ready ? 0 : r.queued === 0 ? 1 : r.queued < r.slots ? 2 : 3);
  return out.sort((a, c) => rank(a) - rank(c) || a.doneIn - c.doneIn);
}

export function openWorkshops(): void {
  const p = new Panel({ title: 'Workshops', icon: 'hammer', color: 'blue', size: 'medium' });
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const list = rows();
    if (!list.length) { p.body.append(h('div', { class: 'empty-state' }, icon('hammer'), h('div', null, 'No workshops yet. Build one from the shop!'))); return; }
    const ready = list.filter((r) => r.ready).length, idle = list.filter((r) => !r.ready && !r.queued).length;
    p.body.append(h('div', { class: 'muted', style: 'margin-bottom:8px' }, `${list.length} workshops · ${ready} ready · ${idle} idle. Tap one to open it.`));
    for (const r of list) {
      const def = BUILDING[r.b.type];
      const status = r.ready ? h('span', { class: 'pill enough' }, `${r.ready} ready`)
        : r.queued ? h('span', { class: 'pill' }, icon('timer', 'icon tiny'), formatTime(r.doneIn))
          : h('span', { class: 'pill cant' }, 'Idle');
      const first = (r.b.queue ?? []).find((x) => x.end > game.now());
      p.body.append(h('div', { class: `list-item clickable ws-row ${r.ready ? 'ws-ready' : !r.queued ? 'ws-idle' : ''}`, onclick: () => { p.close(); openProduction(r.b); } },
        icon(def.icon ?? 'hammer', 'icon big'),
        h('div', { class: 'grow' }, h('div', { class: 'title' }, r.label), h('div', { class: 'sub' }, `Queue ${r.queued}/${r.slots}`, first ? ' · ' : '', first && RECIPE[first.recipe] ? itemIcon(RECIPE[first.recipe].item, 'icon tiny') : null)),
        status));
    }
    if (ready) p.footer.append(button('Collect all', () => { ui.open('collect_all'); render(); }, 'yellow'));
  };
  render();
  const timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

ui.register('workshops', () => openWorkshops());
