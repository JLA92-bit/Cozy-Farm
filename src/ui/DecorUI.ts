import gsap from 'gsap';
import { BUILDING } from '../data';
import { audio, haptics } from '../systems/Audio';
import { hasPerk } from '../systems/Perks';
import { PAINTS, SIGN_MAX, cleanSignText, isFriendlyText, paintHex, setTint, signText } from '../systems/Decor';
import { game } from '../systems/Game';
import type { PlacedBuilding } from '../systems/State';
import { button, h, icon } from './dom';
import { Panel } from './Panel';
import { ui } from './UI';

/**
 * "Pretty farm" controls in a placed decor piece's popup: a row of paint swatches for paintable pieces and a
 * button that opens the Farm Sign's text editor.
 */
export function decorPopupRows(b: PlacedBuilding): HTMLElement[] {
  const def = BUILDING[b.type];
  const rows: HTMLElement[] = [];
  if (def.paint) rows.push(paintRow(b));
  if (def.sign) rows.push(button([icon('memo'), 'Write on it'], () => { ui.world.hidePopup(); openSignEditor(b); }, 'small green'));
  return rows;
}

function paintRow(b: PlacedBuilding): HTMLElement {
  const def = BUILDING[b.type];
  const built = def.paint!.replace(/^=/, '');
  const row = h('div', { class: 'paint-row', role: 'radiogroup', 'aria-label': 'Paint colour' });
  const swatch = (id: string | undefined, hex: string, name: string): HTMLElement => {
    const el = h('button', {
      class: `paint-swatch${id === undefined ? ' built' : ''}`, type: 'button', role: 'radio', title: name, 'aria-label': name,
      style: `--swatch:${hex}`,
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (b.tint === id) return;
      if (!setTint(b, id)) return;
      game.bus.emit('building:changed', { b });
      sync();
      gsap.fromTo(el, { scale: 1.35 }, { scale: 1, duration: 0.35, ease: 'back.out(3)' });
      audio.play('select', { volume: 0.6 });
      haptics.play('tap');
      const at = ui.scene.farm.anchor(b.uid);
      ui.effects.sparkle(at, hex, 10);
    });
    return el;
  };
  // Juniper's colours join the palette at 6 hearts (and stay offered on a piece already painted with one)
  const paints = PAINTS.filter((p) => !p.juniper || hasPerk('juniper_paints') || p.id === b.tint);
  row.append(swatch(undefined, built, 'As built'), ...paints.map((p) => swatch(p.id, p.hex, p.name)));
  const sync = (): void => {
    const on = b.tint ?? '';
    row.querySelectorAll<HTMLElement>('.paint-swatch').forEach((el, i) => {
      const active = (i === 0 ? '' : paints[i - 1].id) === on;
      el.classList.toggle('active', active);
      el.setAttribute('aria-checked', String(active));
    });
  };
  sync();
  return h('div', { class: 'paint-box' }, h('div', { class: 'paint-label' }, icon('paint'), 'Paint'), row);
}

/** Small panel to write the sign's text, with a live wooden preview. */
export function openSignEditor(b: PlacedBuilding): void {
  const p = new Panel({ title: 'Farm Sign', icon: 'memo', size: 'small', color: 'green' });
  const name = game.state.player.name;
  const preview = h('div', { class: 'sign-preview' });
  const count = h('div', { class: 'sign-count muted' });
  const warn = h('div', { class: 'sign-warn', role: 'alert' });
  const input = h('input', {
    class: 'name-input sign-input', maxlength: String(SIGN_MAX), value: cleanSignText(b.text), placeholder: signText({}, name),
    'aria-label': 'Sign text', enterkeyhint: 'done', autocomplete: 'off', spellcheck: 'false',
  }) as HTMLInputElement;
  const update = (): void => {
    const clean = cleanSignText(input.value);
    preview.textContent = clean || signText({}, name);
    preview.classList.toggle('placeholder', !clean);
    count.textContent = `${input.value.length} / ${SIGN_MAX}`;
    warn.textContent = '';
  };
  input.addEventListener('input', update);
  input.addEventListener('pointerdown', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  const save = (): void => {
    const text = cleanSignText(input.value);
    if (text && !isFriendlyText(text)) {
      warn.textContent = "Let's keep it friendly - neighbours can visit your farm.";
      audio.play('error');
      gsap.fromTo(input, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1.6, 0.3)' });
      return;
    }
    if (text) b.text = text; else delete b.text;
    game.bus.emit('building:changed', { b });
    p.close();
    audio.play('select');
    ui.effects.sparkle(ui.scene.farm.anchor(b.uid), '#fff6a0', 14);
  };
  update();
  p.body.append(
    h('div', { class: 'sign-board', style: `--trim:${paintHex(b.tint) ?? '#d9573f'}` }, preview),
    h('div', { class: 'muted center' }, 'Up to 16 letters. Leave it empty to show your farm name.'),
    input, h('div', { class: 'row between' }, warn, count),
  );
  p.footer.append(button('Save', save, 'green'));
  p.open();
  setTimeout(() => input.focus(), 350);
}
