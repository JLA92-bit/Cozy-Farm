import { ui } from './UI';
import { Panel } from './Panel';
import { BUILDING } from '../data';
import { game } from '../systems/Game';
import { fieldStatus, moreRoomHint, nextCapRaise } from '../systems/Caps';

/** Don't nag: the "how to get more fields" tip shows at most this often. */
const HINT_GAP_MS = 6 * 60_000;
let lastHint = 0;

/** A toast that does something when tapped (it still closes itself like any toast). */
function actionToast(title: string, sub: string, iconKey: string, onTap: () => void): void {
  ui.feedback.toast(title, sub, iconKey, 'tappable');
  const key = `tappable|${title}|${sub}`;
  const el = [...ui.feedback.toastStack.children].find((t) => (t as HTMLElement).dataset.key === key) as HTMLElement | undefined;
  if (el && !el.dataset.action) {
    el.dataset.action = '1';
    el.addEventListener('click', () => { if (!Panel.isOpen) onTap(); });
  }
}

/** Open the Shop on the Farm tab (Fields), or the Farmhouse when fields are full. */
export function goGetFields(): void {
  if (fieldStatus().free) ui.open('shop', 'farm');
  else ui.open('farmhouse');
}

/**
 * Every field is busy: tell the player where more fields come from.
 * `force` skips the cool-down (used right after buying the last allowed field).
 */
export function fieldsHint(force = false): void {
  if (!game.state.tutorial.done) return;
  const now = Date.now();
  if (!force && now - lastHint < HINT_GAP_MS) return;
  const st = fieldStatus();
  if (st.free) {
    if (game.coins < st.price) return;
    lastHint = now;
    actionToast('Want more crops?', `Add a field from the Shop (${st.owned} / ${st.cap}) - tap here`, 'seedling', goGetFields);
    return;
  }
  const raise = nextCapRaise('plot');
  if (!raise) return;
  lastHint = now;
  const hint = moreRoomHint(BUILDING.plot);
  actionToast(force ? 'That was your last field for now' : 'All your fields are busy', `${hint.sub} - tap here`, 'house', goGetFields);
}
