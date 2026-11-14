import { h, button } from '../dom';
import { audio } from '../../systems/Audio';
import { settings, saveSettings } from '../../systems/Settings';
import { applyAccess, textSize, TEXT_NAME, TEXT_SCALE, TEXT_SIZES } from '../../systems/Access';

/** Shared rows for Settings and Accessibility and layout. */
export function row(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'setting-row' }, h('label', null, label), control);
}

export function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = h('div', { class: `toggle ${on ? 'on' : ''}`, role: 'switch', tabindex: '0', 'aria-checked': String(on) });
  const flip = (): void => { on = !on; t.classList.toggle('on', on); t.setAttribute('aria-checked', String(on)); onChange(on); audio.play('select'); };
  t.addEventListener('click', flip);
  t.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  return t;
}

/** A row of choices, one picked (Text size, Reduce motion). */
export function choices<T extends string>(opts: [T, string][], current: T, onPick: (v: T) => void, label: string): HTMLElement {
  const seg = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  for (const [v, name] of opts) {
    const b = h('button', { class: v === current ? 'active' : '', type: 'button', role: 'radio', 'aria-checked': String(v === current) }, name);
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
      onPick(v); audio.play('select');
    });
    seg.append(b);
  }
  return seg;
}

/** Text size: smaller and bigger buttons round the size (Normal 100% to Biggest 200%); the panel grows as you go. */
export function textStepper(): HTMLElement {
  const val = h('div', { class: 'text-step-val', 'aria-live': 'polite' });
  const down = button('A-', () => step(-1), 'blue', { 'aria-label': 'Smaller text' });
  const up = button('A+', () => step(1), 'blue', { 'aria-label': 'Bigger text' });
  const show = (): void => {
    const t = textSize(); const i = TEXT_SIZES.indexOf(t);
    val.replaceChildren(TEXT_NAME[t], h('small', null, `${Math.round(TEXT_SCALE[t] * 100)}%`));
    down.disabled = i <= 0; up.disabled = i >= TEXT_SIZES.length - 1;
  };
  const step = (d: number): void => {
    const i = TEXT_SIZES.indexOf(textSize()) + d;
    if (i < 0 || i >= TEXT_SIZES.length) return;
    settings.textSize = TEXT_SIZES[i]; saveSettings(settings); applyAccess(); show(); audio.play('select');
  };
  show();
  return h('div', { class: 'text-step', role: 'group', 'aria-label': 'Text size' }, down, val, up);
}
