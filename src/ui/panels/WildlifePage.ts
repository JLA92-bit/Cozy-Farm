import { h, icon, clear } from '../dom';
import { WILDLIFE, WOODS_REGIONS, type WildSpecies } from '../../data';
import { wildlife } from '../../systems/Wildlife';
import { hasTelescope } from '../../systems/Treehouse';
import type { Panel } from '../Panel';

const PLACE: Record<string, string> = { farm: 'the edge of your farm', glade: 'the glade in the Wild Woods' };
const placeName = (p: string): string => PLACE[p] ?? WOODS_REGIONS.find((r) => r.id === p)?.name ?? p;
const hours = (s: WildSpecies): string => {
  if (s.from === 0 && s.to === 24) return 'any time';
  const t = (x: number) => (x % 24 === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`);
  return `${t(s.from)} to ${t(s.to)}`;
};
/** A gentle hint for a species not yet photographed: where, when and in what weather. */
const hint = (s: WildSpecies): string => [
  `Look in ${placeName(s.place)}, ${hours(s)}`,
  s.weather ? ` on ${s.weather.map((w) => (w === 'rain' ? 'rainy' : w === 'mist' ? 'misty' : 'sunny')).join(' or ')} days` : '',
  s.festival ? ' on festival days' : '',
  s.chance < 0.6 ? ' (not every day)' : '',
  '.',
].join('');

/** 1.27 the Wildlife Album page of the Collection Book: every species by set, photographed or with a hint. */
export function renderWildlifeAlbum(p: Panel): void {
  clear(p.body);
  const n = wildlife.count(), of = WILDLIFE.species.length;
  p.body.append(h('div', { class: 'al-head' }, icon('camera', 'al-icon'),
    h('div', null, h('div', { class: 'al-title' }, 'Wildlife Album'),
      h('div', { class: 'muted' }, wildlife.open ? `${n} of ${of} photographed. Tap a wild animal on your farm or in the Wild Woods to take its photo.` : `The album opens at level ${WILDLIFE.level}.`))));
  // 1.27 the treehouse telescope: who is out today (and when)
  if (hasTelescope() && wildlife.open) {
    const out = WILDLIFE.species.filter((s) => wildlife.placeOpen(s.place) && wildlife.outToday(s));
    p.body.append(h('div', { class: 'card' }, h('div', { class: 'title' }, icon('sparkles'), ' Through the telescope today'),
      h('div', { class: 'sub' }, out.length ? out.map((s) => `${wildlife.photographed(s.id) ? s.name : 'something new'} (${placeName(s.place)}, ${hours(s)})`).join('; ') : 'Nobody about today. Try again tomorrow.')));
  }
  for (const set of WILDLIFE.sets) {
    const pr = wildlife.setProgress(set.id), done = !!wildlife.st.sets.includes(set.id);
    p.body.append(h('div', { class: 'section-title' }, icon(set.icon), ` ${set.name}: ${pr.have} of ${pr.of}`, h('span', { class: 'muted' }, done ? '  (set complete)' : `  Full set: ${set.reward.coins} coins, ${set.reward.gems} gems`)));
    for (const s of WILDLIFE.species.filter((x) => x.set === set.id)) {
      const ph = wildlife.st.photos[s.id];
      p.body.append(ph
        ? h('div', { class: 'card cr-entry' }, icon(`wild_${s.id}`, 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, s.name), h('div', { class: 'sub' }, s.about), h('div', { class: 'sub' }, `${placeName(s.place).replace(/^the /, 'The ')}, ${hours(s)}. ${ph.n} ${ph.n === 1 ? 'photo' : 'photos'}.`)))
        : h('div', { class: 'card cr-entry locked' }, icon('lock', 'icon big'),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, '???'), h('div', { class: 'sub' }, hint(s)))));
    }
  }
}
