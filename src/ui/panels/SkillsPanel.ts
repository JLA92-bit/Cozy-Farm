import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { SKILLS, SKILL_PERK_LEVELS, type SkillDef } from '../../data';
import { game } from '../../systems/Game';
import { skills } from '../../systems/Skills';
import { audio } from '../../systems/Audio';
import './skills.css';

/** A round progress ring with the level inside (always a number, never colour alone). */
function ring(def: SkillDef): HTMLElement {
  const p = skills.progress(def.id);
  const el = h('div', { class: `sk-ring ${def.color}`, style: `--p:${p.pct}`, role: 'img', 'aria-label': `${def.name} level ${p.level}${p.max ? ', top level' : `, ${p.pct} percent to the next level`}` },
    h('div', { class: 'sk-ring-in' }, icon(def.icon, 'sk-ring-icon'), h('span', { class: 'sk-ring-lvl outlined' }, String(p.level))));
  return el;
}

function confirmPerk(def: SkillDef, perkId: string, done: () => void): void {
  const perk = def.perks[String(skills.pendingChoice(def.id))]?.find((x) => x.id === perkId);
  if (!perk) return;
  const c = new Panel({ title: `Choose ${perk.name}?`, icon: perk.icon, color: 'purple', size: 'small' });
  c.body.append(
    h('div', { class: 'center', style: 'font-size:17px;margin:6px 0' }, perk.text),
    h('div', { class: 'muted center' }, 'Your choice stays for good, so pick the one that suits your farm.'));
  c.footer.append(
    button('Not yet', () => c.close(), 'grey'),
    button('Choose', () => { c.close(); if (skills.choose(def.id, perkId)) { audio.play('reward'); done(); } }, 'green'));
  c.open();
}

function perkRow(def: SkillDef, perkLevel: number, refresh: () => void): HTMLElement {
  const lvl = skills.level(def.id);
  const picked = skills.chosen(def.id)[SKILL_PERK_LEVELS.indexOf(perkLevel)];
  const options = def.perks[String(perkLevel)] ?? [];
  if (picked) {
    const p = options.find((x) => x.id === picked);
    return h('div', { class: 'sk-perk chosen' }, icon(p?.icon ?? 'star', 'sk-perk-icon'),
      h('div', { class: 'grow' }, h('div', { class: 'sk-perk-name' }, p?.name ?? picked, h('span', { class: 'sk-tag' }, `Level ${perkLevel}`)), h('div', { class: 'sk-perk-text' }, p?.text ?? '')));
  }
  if (lvl < perkLevel) {
    return h('div', { class: 'sk-perk locked' }, icon('lock', 'sk-perk-icon'),
      h('div', { class: 'grow' }, h('div', { class: 'sk-perk-name' }, `Level ${perkLevel} perk`), h('div', { class: 'sk-perk-text' }, `Choose one of two perks when you reach level ${perkLevel}.`)));
  }
  // waiting for a choice
  const box = h('div', { class: 'sk-choose' }, h('div', { class: 'sk-choose-title' }, `Level ${perkLevel}: choose a perk`));
  for (const o of options) {
    box.append(h('div', { class: 'sk-option' }, icon(o.icon, 'sk-perk-icon'),
      h('div', { class: 'grow' }, h('div', { class: 'sk-perk-name' }, o.name), h('div', { class: 'sk-perk-text' }, o.text)),
      button('Choose', () => confirmPerk(def, o.id, refresh), 'green small')));
  }
  return box;
}

/** The four skills, drawn into `into` (the Me screen's Skills tab and the stand-alone Skills screen). */
export function renderSkills(into: HTMLElement, refresh: () => void = () => {}): void {
  clear(into);
  into.append(h('div', { class: 'sk-intro' }, icon('sparkles', 'sk-intro-icon'),
    h('div', null, h('div', { class: 'sk-intro-title' }, 'Skills'), h('div', { class: 'sk-intro-text' }, 'Each skill grows by itself as you play. Every level helps a little, and at levels 5 and 10 you choose a perk.'))));
  for (const def of SKILLS) {
    const p = skills.progress(def.id);
    const card = h('div', { class: `sk-card ${def.color}` },
      h('div', { class: 'sk-head' }, ring(def),
        h('div', { class: 'grow' },
          h('div', { class: 'sk-name' }, def.name, skills.pendingChoice(def.id) !== null ? h('span', { class: 'sk-new' }, 'Choose a perk') : null),
          h('div', { class: 'sk-sub' }, def.grows),
          h('div', { class: 'sk-sub' }, `Each level: ${def.perLevel.charAt(0).toLowerCase()}${def.perLevel.slice(1)}`),
          h('div', { class: 'progress sk-bar' }, h('div', { class: 'fill', style: `width:${p.pct}%` }),
            h('div', { class: 'label' }, p.max ? 'Top level' : `${p.into.toLocaleString('en-US')} / ${p.need.toLocaleString('en-US')} XP`)))),
      h('div', { class: 'sk-perks' }, ...SKILL_PERK_LEVELS.map((lv) => perkRow(def, lv, refresh))));
    into.append(card);
  }
}

/** The stand-alone Skills screen (also reached from toasts). */
export function openSkills(): void {
  const p = new Panel({ title: 'Skills', icon: 'sparkles', color: 'green' });
  const draw = () => { renderSkills(p.body, draw); game.bus.emit('state:changed', {}); };
  renderSkills(p.body, draw);
  p.open();
}
