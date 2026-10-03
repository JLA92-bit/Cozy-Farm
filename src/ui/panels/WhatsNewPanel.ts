import gsap from 'gsap';
import { Panel } from '../Panel';
import { h, icon, button } from '../dom';
import { ui } from '../UI';
import { game } from '../../systems/Game';
import { audio } from '../../systems/Audio';
import { saves } from '../../systems/Save';
import { APP_VERSION, RELEASES, compareVersions, releaseDate, releasesSince, type ChangeLine, type Release } from '../../systems/Version';
import './whatsnew.css';

/** True when this farm has not yet seen the newest release notes. */
export function whatsNewPending(): boolean {
  const s = game.state;
  return !!s && compareVersions(s.lastSeenVersion, APP_VERSION) < 0 && releasesSince(s.lastSeenVersion).length > 0;
}

/** Show it on load only once the farmer exists and the tutorial is done (new players skip it). */
export function shouldShowWhatsNew(): boolean {
  const s = game.state;
  return !!s && s.player.created && s.tutorial.done && whatsNewPending();
}

/** Small "New" dot on the HUD settings gear while there are unseen release notes. */
export function refreshWhatsNewDot(): void {
  const gear = document.querySelector<HTMLElement>('.hud-settings');
  if (!gear) return;
  const show = shouldShowWhatsNew();
  let dot = gear.querySelector<HTMLElement>('.whatsnew-dot');
  if (!show) { dot?.remove(); return; }
  if (!dot) { dot = h('span', { class: 'badge-dot whatsnew-dot outlined pop', 'aria-hidden': 'true' }, 'New'); gear.append(dot); }
  gear.setAttribute('aria-label', "Settings - What's new");
}

function markSeen(): void {
  if (compareVersions(game.state.lastSeenVersion, APP_VERSION) >= 0) return;
  game.state.lastSeenVersion = APP_VERSION;
  saves.save();
  document.querySelector('.hud-settings .whatsnew-dot')?.remove();
  document.querySelector('.hud-settings')?.setAttribute('aria-label', 'Settings');
}

function line(l: ChangeLine): HTMLElement {
  return h('li', { class: 'wn-line' }, h('span', { class: 'wn-line-icon' }, icon(l.icon)), h('span', { class: 'wn-line-text' }, l.text));
}

function releaseCard(r: Release, isNew: boolean): HTMLElement {
  const card = h('section', { class: `wn-release wn-${r.color ?? 'orange'}` },
    h('div', { class: 'wn-release-head' },
      h('div', { class: 'wn-release-badge' }, icon(r.icon ?? 'sparkles')),
      h('div', { class: 'wn-release-titles' },
        h('div', { class: 'wn-release-title outlined' }, r.title),
        h('div', { class: 'wn-release-meta' }, `Version ${r.version} - ${releaseDate(r.date)}`)),
      isNew ? h('span', { class: 'wn-new-pill outlined' }, 'New') : null),
  );
  if (r.dedication) {
    card.append(h('div', { class: 'wn-dedication' }, icon(r.dedication.icon, 'icon wn-heart'), h('span', null, r.dedication.text), icon(r.dedication.icon, 'icon wn-heart')));
  }
  if (r.highlights.length) card.append(h('ul', { class: 'wn-lines' }, ...r.highlights.map(line)));
  for (const s of r.sections ?? []) {
    card.append(
      h('div', { class: 'wn-section-title' }, s.icon ? icon(s.icon) : null, h('span', null, s.title)),
      h('ul', { class: 'wn-lines' }, ...s.items.map(line)),
    );
  }
  return card;
}

/** Floating icons over a little sky-and-hills banner at the top of the page. */
function heroArt(release: Release, count: number): HTMLElement {
  const floats = ['sparkles', 'sunflower', 'heart', 'star', 'tulip', 'glowing_star'];
  return h('div', { class: 'wn-hero' },
    h('div', { class: 'wn-hero-sun' }),
    h('div', { class: 'wn-hero-hill a' }), h('div', { class: 'wn-hero-hill b' }),
    ...floats.map((f, i) => h('span', { class: `wn-float f${i}` }, icon(f))),
    h('div', { class: 'wn-hero-text' },
      h('div', { class: 'wn-hero-kicker outlined' }, count > 1 ? `${count} updates since you last played` : 'Fresh on the farm'),
      h('div', { class: 'wn-hero-title outlined' }, `Cozy Acres ${release.version}`),
      h('div', { class: 'wn-hero-sub outlined' }, release.title)),
  );
}

/**
 * The "What's new" page. On load (`sinceLast`) it lists only the releases the player has not seen;
 * from Settings it lists every release, with the unseen ones tagged New. Closing marks them seen.
 */
export function openWhatsNew(opts: { sinceLast?: boolean; onClose?: () => void } = {}): void {
  const seen = game.state.lastSeenVersion;
  const unseen = releasesSince(seen);
  const list = opts.sinceLast && unseen.length ? unseen : RELEASES;
  const p = new Panel({ title: "What's new", size: 'medium', color: 'pink', icon: 'sparkles' });
  p.panel.classList.add('wn-panel');
  p.body.append(heroArt(list[0], opts.sinceLast ? list.length : unseen.length));
  const cards = list.map((r) => releaseCard(r, compareVersions(r.version, seen) > 0));
  p.body.append(...cards, h('div', { class: 'wn-thanks muted center' }, 'Thanks for farming with us!'));
  p.footer.append(button([icon('seedling'), "Let's play!"], () => p.close(), 'green wide wn-play'));
  p.onClose = () => { markSeen(); opts.onClose?.(); };
  p.open();
  audio.play('reward', { volume: 0.45 });
  // lines of the first release pop in one after another
  const first = [...cards[0].querySelectorAll<HTMLElement>('.wn-dedication, .wn-line')].slice(0, 12);
  gsap.fromTo(first, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'back.out(2)', delay: 0.25, stagger: 0.06, clearProps: 'transform,opacity' });
}

ui.register('whatsnew', () => openWhatsNew());
// the gear dot follows the tutorial: it appears once the tutorial is finished
game.bus.on('tutorial', () => setTimeout(refreshWhatsNewDot, 0));
