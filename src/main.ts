import './ui/fonts.css';
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { boot } from './scenes/Boot';

boot().catch((e) => {
  console.error(e);
  const tip = document.querySelector('.boot-tip');
  if (tip) tip.textContent = 'Oops! Something went wrong loading the farm. Please reload.';
});

if (import.meta.env.PROD) registerSW({ immediate: true });
