import './ui/fonts.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './scenes/Boot';

boot().catch((e) => {
  console.error(e);
  const tip = document.querySelector('.boot-tip');
  if (tip) tip.textContent = 'Oops! The farm could not load.';
  const hint = document.querySelector('.boot-hint');
  if (hint) hint.textContent = 'Check your connection and try again. Your farm is saved safely.';
  const screen = document.getElementById('boot-screen');
  if (screen && !screen.querySelector('.boot-retry')) {
    const retry = document.createElement('button');
    retry.className = 'btn boot-retry';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => location.reload());
    screen.append(retry);
  }
});

if (import.meta.env.PROD) registerSW({ immediate: true });
