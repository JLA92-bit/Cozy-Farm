import { Panel } from '../Panel';
import { h, icon, itemIcon, button, clear, priceTag, stableRefresh } from '../dom';
import { ui } from '../UI';
import { ANIMAL, BUILDING, ITEMS, UPKEEP } from '../../data';
import { game } from '../../systems/Game';
import { animals, MAX_ANIMAL_HEARTS } from '../../systems/Animals';
import { buildings } from '../../systems/Buildings';
import { audio, haptics } from '../../systems/Audio';
import { animalProduceMs, animalReadyAt, animalState, formatTime, isBuilt } from '../../systems/Timers';
import type { PlacedBuilding } from '../../systems/State';
import { sourceText } from './InventoryPanel';
import { upkeep } from '../../systems/Upkeep';
import { wearRow } from './UpkeepUI';
import { productModel } from '../../world/FarmView';

export function openAnimalHome(b: PlacedBuilding): void {
  const def = BUILDING[b.type];
  const a = ANIMAL[def.animal!];
  const p = new Panel({ title: `${def.name} (Lv ${b.level})`, icon: def.icon, color: 'green', size: 'medium' });
  const render = () => {
    clear(p.body);
    clear(p.footer);
    const cap = buildings.capacity(b);
    const list = b.animals ?? [];
    const now = game.now();
    p.body.append(h('div', { class: 'row between', style: 'margin-bottom:8px' },
      h('div', null, h('b', null, `${list.length}/${cap} ${a.name}s`), h('div', { class: 'muted' }, `Eat ${ITEMS[a.feed].name}, give ${ITEMS[a.product].name} every ${formatTime(animalProduceMs(a))}`)),
      h('span', { class: 'pill' }, itemIcon(a.feed), `${game.count(a.feed)}`)));
    const wr = wearRow(b, render);
    if (wr) p.body.append(wr);
    const grid = h('div', { class: 'grid tight' });
    const hasFeed = game.count(a.feed) > 0;
    const treat = (i: number) => {
      if (!upkeep.hasVet()) { ui.feedback.toast("Needs the Vet's Cottage", game.level >= BUILDING.vet_cottage.level ? 'Build one from the shop' : `Unlocks at level ${BUILDING.vet_cottage.level}`, 'cross'); audio.play('error'); return; }
      if (!upkeep.treat(b, i)) { ui.feedback.toast('Not enough coins', undefined, 'cross'); audio.play('error'); return; }
      ui.effects.hearts(ui.scene.farm.anchor(b.uid));
      ui.feedback.toast('Feeling better!', undefined, 'heart');
      render();
    };
    list.forEach((_, i) => {
      const st = animalState(b, i, now);
      // tapping a card does the obvious thing for that animal's home
      const an = list[i];
      const onclick = st === 'sick' ? () => { treat(i); } : st === 'ready' ? () => { collect(b); render(); } : st === 'hungry' && hasFeed ? () => { feed(b); render(); } : undefined;
      let status: HTMLElement;
      if (st === 'producing') {
        const left = animalReadyAt(b, i) - now;
        const pct = Math.round(100 * (1 - left / (animalProduceMs(a))));
        status = h('div', { class: 'progress animal-progress' }, h('div', { class: 'fill', style: `width:${Math.max(4, Math.min(100, pct))}%` }), h('div', { class: 'label' }, formatTime(left)));
      } else if (st === 'sick') status = h('div', { class: 'card-sub animal-sick' }, `Unwell (${Math.max(1, Math.ceil(UPKEEP.animals.wanderAfterDays - (an.sickDays ?? 0)))} days)`);
      else status = h('div', { class: `card-sub ${st === 'hungry' ? 'animal-hungry' : 'animal-ready'}` }, st === 'hungry' ? 'Hungry' : 'Ready!');
      const badge = st === 'ready' ? itemIcon(a.product) : st === 'hungry' ? itemIcon(a.feed) : null;
      if (badge) badge.classList.add('animal-badge');
      if (badge && st === 'hungry' && !hasFeed) badge.classList.add('dim');
      // 1.10 friendship: a name, hearts and a daily pat
      const hearts = animals.hearts(b, i), canPat = animals.canPat(b, i);
      const heartRow = h('div', { class: 'animal-hearts', role: 'img', 'aria-label': `${hearts} of ${MAX_ANIMAL_HEARTS} hearts` }, ...Array.from({ length: MAX_ANIMAL_HEARTS }, (_, k) => icon('heart', `animal-heart${k < hearts ? ' on' : ''}`)));
      const ageTxt = an.born && upkeep.on ? (upkeep.isElder(an) ? 'Elder' : upkeep.ageDays(an) < 7 ? 'Young' : '') : '';
      const pat = st === 'sick' ? h('button', { class: `btn small ${upkeep.hasVet() && game.coins >= upkeep.treatCost(a.id) ? 'yellow' : 'disabled'} animal-pat`, type: 'button', onclick: (e: Event) => { e.stopPropagation(); treat(i); } }, 'Treat', priceTag(upkeep.treatCost(a.id)))
        : h('button', { class: `btn small ${canPat ? 'pink' : 'disabled'} animal-pat`, type: 'button', 'aria-label': canPat ? `Pat ${animals.nameOf(b, i)}` : `${animals.nameOf(b, i)} has had a pat today`, onclick: (e: Event) => {
        e.stopPropagation();
        if (animals.patOne(b, i) < 0) return;
        ui.effects.hearts(ui.scene.farm.anchor(b.uid));
        audio.play('select', { volume: 0.5 });
        render();
      } }, icon('heart'), canPat ? 'Pat' : 'Patted');
      grid.append(h('div', { class: `card animal-card ${st === 'sick' ? 'sick' : ''} ${st === 'ready' ? 'done' : ''} ${onclick ? 'clickable' : ''}`, onclick }, icon(`model:${a.model}`, 'card-icon'), h('div', { class: 'card-sub animal-name' }, animals.nameOf(b, i)), heartRow, ageTxt ? h('div', { class: 'animal-age' }, ageTxt) : null, status, pat, badge));
    });
    for (let i = list.length; i < cap; i++) {
      grid.append(h('div', { class: 'card clickable', style: 'opacity:.8', onclick: () => buy() }, h('div', { class: 'card-title', style: 'font-size:30px;margin:8px' }, '+'), h('div', { class: 'card-sub' }, 'Buy'), h('div', { class: 'pill' }, priceTag(animals.price(a.id)))));
    }
    p.body.append(grid);
    const away = upkeep.lost().map((l, k) => ({ l, k })).filter(({ l }) => l.animal === a.id);
    if (away.length) {
      const strip = h('div', { class: 'lost-strip' }, h('div', { class: 'lost-title' }, 'Wandered off'));
      for (const { l, k } of away) strip.append(button([`${l.name ?? a.name}`, `${Math.ceil(l.left)}d`, priceTag(upkeep.finderFee(a.id))], () => {
        const r = upkeep.retrieve(k);
        if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot', undefined, 'cross'); audio.play('error'); return; }
        ui.effects.hearts(ui.scene.farm.anchor(b.uid));
        render();
      }, 'small blue'));
      p.body.append(strip);
    }
    if (game.count(a.feed) === 0 && list.some((_, i) => animalState(b, i, now) === 'hungry')) {
      p.body.append(h('div', { class: 'muted center', style: 'margin-top:8px' }, `Out of ${ITEMS[a.feed].name}. ${sourceText(a.feed)}.`));
    }
    const c = animals.counts(b);
    if (c.ready) p.footer.append(button(['Collect', itemIcon(a.product)], () => { collect(b); render(); }, ''));
    if (c.hungry) p.footer.append(button(['Feed all', itemIcon(a.feed)], () => { feed(b); render(); }, game.count(a.feed) ? 'yellow' : 'disabled'));
    if (list.length < cap) p.footer.append(button(['Buy', priceTag(animals.price(a.id))], () => buy(), 'blue'));
    p.footer.append(button('Upgrade', () => { p.close(); ui.buildingPopup(b); }, 'small grey'));
  };
  const buy = () => {
    const r = animals.buy(a.id, b);
    if (!r.ok) { ui.feedback.toast(r.reason ?? 'Cannot buy', undefined, 'cross'); audio.play('error'); return; }
    ui.effects.hearts(ui.scene.farm.anchor(b.uid));
    render();
  };
  render();
  const timer = window.setInterval(() => { if (!p.overlay.isConnected) clearInterval(timer); else stableRefresh([p.body, p.footer], render); }, 1000);
  p.open();
}

function feed(b: PlacedBuilding): number {
  const n = animals.feedAll(b);
  if (n) {
    const at = ui.scene.farm.anchor(b.uid);
    ui.effects.hearts(at);
    ui.effects.leaves(at.clone().setY(0.4), '#f0c75a', 8);
    haptics.buzz(8);
    // show what the meal cost, right over the home
    const a = ANIMAL[BUILDING[b.type].animal!];
    const s = ui.screen(at);
    ui.feedback.floatText(s.x + 36, s.y - 6, `-${n}`, undefined, '#ffd9a0');
    (ui.feedback.floatLayer.lastElementChild as HTMLElement | null)?.prepend(itemIcon(a.feed));
    if (animals.counts(b).hungry && game.count(a.feed) === 0) {
      ui.feedback.toast(`Out of ${ITEMS[a.feed].name}`, `${animals.counts(b).hungry} still hungry. ${sourceText(a.feed)}`, 'cross');
    }
  } else {
    const a = ANIMAL[BUILDING[b.type].animal!];
    ui.feedback.toast(`No ${ITEMS[a.feed].name}`, sourceText(a.feed), 'cross');
    audio.play('error');
  }
  return n;
}

function collect(b: PlacedBuilding): number {
  const at = ui.scene.farm.anchor(b.uid);
  const n = animals.collectAll(b, { x: at.x, y: at.y, z: at.z });
  if (n) {
    ui.effects.sparkle(at, '#fff6a0', 10);
    void ui.effects.pop(at.clone().setY(0.6), productModel(ANIMAL[BUILDING[b.type].animal!].product), 0.4);
    haptics.buzz(12);
    if (ui.scene.env.night > 0.6) game.incStat('night_collects', n);
  }
  return n;
}

ui.onBuildingTap((b) => {
  const def = BUILDING[b.type];
  if (def.cat !== 'animal') return false;
  if (!isBuilt(b, game.now())) { ui.buildingPopup(b); return true; }
  if (!(b.animals ?? []).length) { openAnimalHome(b); return true; }
  const c = animals.counts(b);
  if (c.ready && collect(b)) {
    // collecting and re-feeding in one tap keeps the loop quick
    if (game.count(ANIMAL[def.animal!].feed) > 0) window.setTimeout(() => { if (animals.counts(b).hungry) feed(b); }, 420);
    return true;
  }
  if (c.hungry && game.count(ANIMAL[def.animal!].feed) > 0 && feed(b)) return true;
  // nothing to do: give them a pat and show the home
  animals.pet(b);
  ui.effects.hearts(ui.scene.farm.anchor(b.uid));
  openAnimalHome(b);
  return true;
});
