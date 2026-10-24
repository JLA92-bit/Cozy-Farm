/**
 * Toasts go just under whatever place banner is showing (visits, the square, the woods, the mine). A fixed offset
 * left them covering the banner's lower rows on phones, where the banner grows to two or three rows. Sets
 * `--banner-bottom` on the UI root (layout px, so the banner's drop-in animation does not count).
 */
export function watchBannerSpace(root: HTMLElement): void {
  let cur: HTMLElement | null = null;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => soon()) : null;
  const update = (): void => {
    // the first banner on screen (a hidden one, like the home's while you are out, has no height)
    const b = [...root.querySelectorAll<HTMLElement>('.visit-banner')].find((el) => el.offsetHeight > 0) ?? null;
    if (b !== cur) { if (cur) ro?.unobserve(cur); cur = b; if (b) ro?.observe(b); }
    if (b) root.style.setProperty('--banner-bottom', `${b.offsetTop + b.offsetHeight + 8}px`);
    else root.style.removeProperty('--banner-bottom');
  };
  // banners come and go anywhere under the root (visits keep theirs in a layer), and the root's class shows or hides
  // them: at most one lookup a frame
  let queued = false;
  const soon = (): void => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; update(); }); };
  const mo = new MutationObserver(soon);
  mo.observe(root, { childList: true, subtree: true });
  mo.observe(root, { attributes: true, attributeFilter: ['class'] });
  update();
}
