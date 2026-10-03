import { Panel } from '../Panel';
import { h, icon, button, clear } from '../dom';
import { ui } from '../UI';
import { settings, saveSettings } from '../../systems/Settings';
import { audio, haptics } from '../../systems/Audio';
import { saves } from '../../systems/Save';
import { game } from '../../systems/Game';
import type { Quality } from '../../core/Renderer';
import type { SaveData } from '../../systems/State';
import credits from '../../../CREDITS.md?raw';

function row(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'setting-row' }, h('label', null, label), control);
}

function slider(value: number, onInput: (v: number) => void): HTMLInputElement {
  const s = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)) }) as HTMLInputElement;
  s.addEventListener('input', () => onInput(Number(s.value) / 100));
  s.addEventListener('pointerdown', (e) => e.stopPropagation());
  return s;
}

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const t = h('div', { class: `toggle ${on ? 'on' : ''}`, role: 'switch' });
  t.addEventListener('click', () => { on = !on; t.classList.toggle('on', on); onChange(on); audio.play('select'); });
  return t;
}

export function openSettings(): void {
  const p = new Panel({ title: 'Settings', icon: 'gear', color: 'blue', size: 'medium' });
  p.body.append(
    row('Music', slider(settings.music, (v) => { settings.music = v; audio.setMusicVolume(v); saveSettings(settings); })),
    row('Sound effects', slider(settings.sfx, (v) => { settings.sfx = v; audio.setSfxVolume(v); saveSettings(settings); audio.play('tap'); })),
    row('Vibration', toggle(settings.haptics, (v) => { settings.haptics = v; haptics.enabled = v; saveSettings(settings); if (v) haptics.buzz(30); })),
    row('Graphics', (() => {
      const seg = h('div', { class: 'segmented' });
      for (const q of ['low', 'medium', 'high'] as Quality[]) {
        const b = h('button', { class: settings.quality === q ? 'active' : '' }, q[0].toUpperCase() + q.slice(1));
        b.addEventListener('click', () => {
          settings.quality = q;
          saveSettings(settings);
          seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
          const needReload = ui.scene.renderer.setQuality(q);
          ui.scene.env.setShadowMapSize(ui.scene.renderer.profile.shadowMapSize);
          ui.scene.loop.maxFps = ui.scene.renderer.profile.maxFps >= 60 ? 0 : ui.scene.renderer.profile.maxFps;
          if (needReload) { saves.save(); location.reload(); }
        });
        seg.append(b);
      }
      return seg;
    })()),
    row('Show FPS', toggle(settings.showFps, (v) => { settings.showFps = v; saveSettings(settings); ui.setFps(v); })),
    row('Farmer name', h('span', { class: 'muted' }, game.state.player.name)),
  );
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = ''; // so picking the same file again still fires 'change'
    if (!f) return;
    const r = await saves.readFile(f);
    if ('error' in r) { ui.feedback.toast('Import failed', r.error, 'cross'); return; }
    confirmImport(r.data);
  });
  p.body.append(fileInput, h('div', { class: 'section-title' }, 'Your farm'), h('div', { class: 'chip-row', style: 'justify-content:flex-start' },
    button([icon('package'), 'Export save'], () => { saves.exportFile(); ui.feedback.toast('Save exported', 'Keep the file somewhere safe', 'package'); }, 'small blue'),
    button([icon('unlock'), 'Import save'], () => fileInput.click(), 'small blue'),
    button([icon('books'), 'Credits'], () => openCredits(), 'small purple'),
    button([icon('cross'), 'Reset farm'], () => confirmReset(), 'small red'),
  ), h('div', { class: 'muted', style: 'margin-top:10px' }, 'Your farm saves automatically every 30 seconds and whenever you leave. No real-money purchases, ever.'));
  p.open();
}

function confirmImport(data: SaveData): void {
  const p = new Panel({ title: 'Load this farm?', size: 'small', color: 'blue', icon: 'unlock' });
  const pl = data.player;
  p.body.append(
    h('div', { class: 'center', style: 'margin-bottom:8px' }, `${pl.name}'s farm - level ${pl.level}, ${pl.coins.toLocaleString()} coins, ${data.buildings.length} buildings.`),
    h('div', { class: 'center muted' }, 'Your current farm is kept as a backup.'),
  );
  p.footer.append(button('Cancel', () => p.close(), 'grey'), button('Load farm', () => {
    const err = saves.applyImport(data);
    if (err) { p.close(); ui.feedback.toast('Import failed', err, 'cross'); }
  }, 'blue'));
  p.open();
}

function confirmReset(): void {
  const p = new Panel({ title: 'Start over?', size: 'small', color: 'pink', icon: 'cross' });
  p.body.append(h('div', { class: 'center' }, 'This erases your farm, coins and progress. Export a save first if you might want it back.'));
  p.footer.append(button('Keep my farm', () => p.close(), 'green'), button('Erase', () => saves.reset(), 'red'));
  p.open();
}

/** Minimal markdown renderer for CREDITS.md (headings, tables, lists, links, paragraphs). */
function renderMarkdown(md: string): HTMLElement {
  const root = h('div', { class: 'credits' });
  const inline = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(https?:\/\/[^\s|)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const lines = md.split('\n');
  let list: HTMLElement | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      const cells = l.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^-+$/.test(c)) || lines[i + 1]?.match(/^\|\s*-/)) continue;
      const li = h('li', { html: `<b>${inline(cells[0])}</b> by ${inline(cells[1])}. ${inline(cells[3])}. <i>${inline(cells[4] ?? '')}</i><br>${inline(cells[2])}` });
      if (!list) { list = h('ul'); root.append(list); }
      list.append(li);
      continue;
    }
    list = null;
    if (l.startsWith('## ')) root.append(h('h3', null, l.slice(3)));
    else if (l.startsWith('# ')) continue;
    else if (l.startsWith('- ')) { const ul = root.lastElementChild?.tagName === 'UL' ? root.lastElementChild as HTMLElement : root.appendChild(h('ul')); ul.append(h('li', { html: inline(l.slice(2)) })); }
    else if (l.trim()) {
      const last = root.lastElementChild;
      if (last?.tagName === 'P' && lines[i - 1]?.trim()) last.innerHTML += ` ${inline(l)}`;
      else root.append(h('p', { html: inline(l) }));
    }
  }
  return root;
}

export function openCredits(): void {
  const p = new Panel({ title: 'Credits', icon: 'books', color: 'purple' });
  p.body.append(h('p', { class: 'center' }, 'Cozy Acres is made with love and these wonderful free assets:'), renderMarkdown(credits));
  p.open();
}

export function openGems(): void {
  const p = new Panel({ title: 'Gems', icon: 'gem', color: 'blue', size: 'small' });
  clear(p.body);
  p.body.append(h('div', { class: 'center', style: 'margin-bottom:8px' }, `You have ${game.gems} gems. Gems are only earned by playing, never bought.`),
    h('div', { class: 'list' }, ...[['glowing_star', 'Level ups (5 every 5 levels)'], ['trophy', 'Awards'], ['calendar', 'Daily rewards'], ['pick', 'Rocks and old trees'], ['clipboard', 'Some orders'], ['gift', 'Mystery crates'], ['cart', 'The travelling merchant']].map(([ic, t]) => h('div', { class: 'list-item' }, icon(ic, 'icon big'), h('div', { class: 'title' }, t)))),
    h('div', { class: 'muted center', style: 'margin-top:8px' }, 'Use gems to finish timers instantly or add stall slots.'));
  p.open();
}

ui.register('settings', () => openSettings());
ui.register('credits', () => openCredits());
ui.register('gems', () => openGems());
