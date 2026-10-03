import { Howl, Howler } from 'howler';
import { assets, assetUrl } from '../core/Assets';

export interface AudioSettings { music: number; sfx: number }

/**
 * Howler-based audio. SFX are small and preloaded; music streams (html5) and changes between
 * daytime and evening playlists.
 */
class AudioSystem {
  private sfx = new Map<string, Howl>();
  private music: Howl | null = null;
  private musicKey = '';
  private playlist: string[] = [];
  private lastPlay = new Map<string, number>();
  settings: AudioSettings = { music: 0.5, sfx: 0.8 };
  private started = false;
  private evening = false;

  init(settings: AudioSettings): void {
    this.settings = settings;
    for (const [key, path] of Object.entries(assets.manifest.sfx)) {
      this.sfx.set(key, new Howl({ src: [assetUrl(path)], volume: 1, preload: true, pool: 4 }));
    }
    // music starts after the first user gesture (autoplay policy)
    const start = () => {
      this.startMusic();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    document.addEventListener('visibilitychange', () => {
      Howler.mute(document.hidden);
    });
  }

  play(name: string, opts: { volume?: number; rate?: number; throttleMs?: number } = {}): void {
    const s = this.sfx.get(name);
    if (!s || this.settings.sfx <= 0) return;
    const now = performance.now();
    const throttle = opts.throttleMs ?? 45;
    if (now - (this.lastPlay.get(name) ?? 0) < throttle) return;
    this.lastPlay.set(name, now);
    const id = s.play();
    s.volume((opts.volume ?? 1) * this.settings.sfx, id);
    s.rate(opts.rate ?? (0.94 + Math.random() * 0.12), id);
  }

  /** Rising pitch for combos (swipe-harvesting many plots). */
  playCombo(name: string, step: number): void {
    this.play(name, { rate: Math.min(1.9, 0.95 + step * 0.06), throttleMs: 30 });
  }

  setEvening(evening: boolean): void {
    if (evening === this.evening) return;
    this.evening = evening;
    if (this.started) this.nextTrack(true);
  }

  private startMusic(): void {
    if (this.started) return;
    this.started = true;
    this.nextTrack();
  }

  private nextTrack(fade = false): void {
    if (!this.playlist.length) {
      const day = ['barnville', 'ukulele', 'springchicken'];
      this.playlist = this.evening ? ['garden'] : day.sort(() => Math.random() - 0.5);
    }
    const key = this.playlist.shift()!;
    const path = assets.manifest.music[key];
    if (!path) return;
    const old = this.music;
    if (old) {
      if (fade) old.fade(old.volume(), 0, 1500);
      setTimeout(() => old.unload(), fade ? 1600 : 0);
    }
    this.musicKey = key;
    const m = new Howl({ src: [assetUrl(path)], html5: true, volume: 0 });
    m.on('end', () => this.nextTrack());
    m.on('play', () => m.fade(0, this.settings.music * 0.6, 2500));
    if (this.settings.music > 0) m.play();
    this.music = m;
  }

  setMusicVolume(v: number): void {
    this.settings.music = v;
    if (!this.music) return;
    if (v <= 0) this.music.pause();
    else {
      if (!this.music.playing() && this.started) this.music.play();
      this.music.volume(v * 0.6);
    }
  }
  setSfxVolume(v: number): void { this.settings.sfx = v; }
  get currentTrack(): string { return this.musicKey; }
}

export const audio = new AudioSystem();

/** Haptics (navigator.vibrate) with a user toggle. */
export const haptics = {
  enabled: true,
  buzz(pattern: number | number[] = 12): void {
    if (!this.enabled) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  },
};
