import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { settings, saveSettings } from '../../systems/Settings';
import { audio } from '../../systems/Audio';
import {
  applyAccess, applyPreset, accessDefault, hudSize, btnSize, HUD_SIZES, HUD_NAME, BTN_SIZES, BTN_NAME, type AccessPreset,
} from '../../systems/Access';
import { row, toggle, choices, textStepper } from './SettingRows';

/**
 * 1.48.1 Settings > Accessibility and layout: quick setups, then text, buttons, layout, seeing, and motion and taps.
 * Every choice shows at once (this screen changes with it) and is kept on the device (systems/Access.ts).
 */
export function openAccess(): void {
  const p = new Panel({ title: 'Accessibility', icon: 'eye', color: 'blue', size: 'medium' });
  const set = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]): void => { settings[k] = v; saveSettings(settings); applyAccess(); };
  const note = (t: string): HTMLElement => h('div', { class: 'muted setting-note' }, t);
  const title = (ic: string, t: string): HTMLElement => h('div', { class: 'section-title' }, icon(ic, 'cp-mini'), ` ${t}`);
  const preset = (pr: AccessPreset, ic: string, label: string, cls: string, toast: [string, string]): HTMLElement =>
    button([icon(ic), label], () => {
      applyPreset(pr); saveSettings(settings); audio.play('select');
      ui.feedback.toast(toast[0], toast[1], ic);
      render();
    }, `small ${cls}`);

  const render = (): void => {
    const top = p.body.scrollTop;
    clear(p.body);
    p.body.append(
      h('div', { class: 'sq-intro-text' }, 'Make Cozy Acres easier to see, read and tap. Changes show straight away and stay on this device.'),
      title('sparkles', 'Quick setups'),
      h('div', { class: 'chip-row access-presets' },
        preset('see', 'eye', 'Easier to see', 'blue', ['Easier to see', 'Bigger, bolder text, stronger colours and full-screen screens.']),
        preset('tap', 'hand', 'Easier to tap', 'green', ['Easier to tap', 'Bigger buttons, slower confirms and full-screen screens.']),
        accessDefault() ? null : preset('reset', 'cross', 'Reset all', 'grey', ['Back to normal', 'Every accessibility and layout choice is back as it started.'])),
      note('A quick setup changes a few choices below; you can still change any of them yourself.'),

      title('books', 'Text'),
      row('Text size', textStepper()),
      row('Font', choices([['game', 'Game'], ['plain', 'Plain']], settings.font ?? 'game', (v) => set('font', v), 'Font')),
      row('Line spacing', choices([['normal', 'Normal'], ['roomy', 'Roomy']], settings.spacing ?? 'normal', (v) => set('spacing', v), 'Line spacing')),
      row('Bold text', toggle(!!settings.bold, (v) => set('bold', v))),
      note('Plain uses your phone\'s own simple letters, which some players find easier to read. Roomy puts more space between lines and words.'),

      title('hammer', 'Buttons'),
      row('Bars and buttons', choices(HUD_SIZES.map((v) => [v, HUD_NAME[v]] as [typeof v, string]), hudSize(), (v) => set('hudSize', v), 'Bars and buttons size')),
      row('Buttons in screens', choices(BTN_SIZES.map((v) => [v, BTN_NAME[v]] as [typeof v, string]), btnSize(), (v) => set('btnSize', v), 'Buttons in screens size')),
      row('Button words', choices([['on', 'Show'], ['off', 'Hide']], settings.labels ?? 'on', (v) => set('labels', v), 'Words under the buttons')),
      note('Bars and buttons is the top bar, side shortcuts and the buttons along the bottom. Buttons in screens is every other button, tab and switch, like the ones on this screen. On a phone held sideways the bars stop at Large so the farm still shows.'),

      title('farmer', 'Layout'),
      row('Shortcuts', choices([['right', 'Right hand'], ['left', 'Left hand']], settings.hand ?? 'right', (v) => set('hand', v), 'Which hand the shortcuts are by')),
      row('Screens', choices([['fit', 'Fit'], ['full', 'Full screen']], settings.panels ?? 'fit', (v) => set('panels', v), 'Screen size')),
      note('Left hand puts the side shortcuts on the left, the goal card on the right and the Shop button under your left thumb. Full screen gives every screen the whole phone, which helps with big text.'),

      title('light_bulb', 'Seeing'),
      row('High contrast', toggle(!!settings.contrast, (v) => set('contrast', v))),
      note('Darker words, solid backgrounds behind the numbers at the top, and faded rows easier to read.'),

      title('hourglass', 'Motion and taps'),
      row('Reduce motion', choices([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], settings.motion ?? 'auto', (v) => set('motion', v), 'Reduce motion')),
      row('Screen shake', toggle(settings.shake, (v) => { set('shake', v); if (v) ui.scene.rig.shake(0.15, 0.3); })),
      row('Taps', choices([['normal', 'Normal'], ['slow', 'Slower']], settings.taps ?? 'normal', (v) => set('taps', v), 'Tap speed')),
      note('Auto follows your phone. Slower gives you 10 seconds to tap again on buttons that ask twice (spending gems, skipping an order), and ignores a second tap that comes very quickly after the first.'),
    );
    p.body.scrollTop = top;
  };
  render();
  p.open();
}

ui.register('access', () => openAccess());
