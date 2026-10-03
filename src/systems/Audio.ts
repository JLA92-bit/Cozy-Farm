import { Howl, Howler } from 'howler';
import { assets, assetUrl } from '../core/Assets';

export interface AudioSettings { music: number; sfx: number }

export interface PlayOpts {
  volume?: number;
  /** Playback rate. Omit to use the sound's natural pitch variance. */
  rate?: number;
  throttleMs?: number;
  /** Stereo position -1 (left) .. 1 (right), e.g. from the tap's screen x. */
  pan?: number;
}

/**
 * Per-sound mix. `vol` evens out the loudness of the source files, `vary` is the random pitch
 * spread (0 for musical stingers so they stay in tune), `duck` dips the music while a stinger
 * plays, `prio` sounds are never dropped by the voice limiter.
 */
interface Mix { vol: number; vary: number; duck?: number; prio?: boolean }
const DEFAULT_MIX: Mix = { vol: 1, vary: 0.12 };
const MIX: Record<string, Mix> = {
  tap: { vol: 0.8, vary: 0.14 },
  press: { vol: 0.55, vary: 0.1 },
  select: { vol: 0.8, vary: 0.08 },
  snap: { vol: 0.9, vary: 0.2 },
  swipe: { vol: 0.8, vary: 0.1 },
  page: { vol: 0.8, vary: 0.06 },
  open: { vol: 0.9, vary: 0.05 },
  close: { vol: 0.9, vary: 0.05 },
  error: { vol: 0.7, vary: 0.04, prio: true },
  coinTick: { vol: 0.45, vary: 0 },
  coins: { vol: 0.85, vary: 0.08 },
  coins2: { vol: 0.85, vary: 0.06 },
  gem: { vol: 0.9, vary: 0.04, prio: true },
  sparkle: { vol: 0.6, vary: 0.1 },
  whoosh: { vol: 0.55, vary: 0.12 },
  door: { vol: 0.55, vary: 0.08 },
  chop: { vol: 0.9, vary: 0.12, prio: true },
  rock: { vol: 0.9, vary: 0.1, prio: true },
  build: { vol: 0.85, vary: 0.08, prio: true },
  build2: { vol: 0.85, vary: 0.06, prio: true },
  truck: { vol: 0.8, vary: 0, prio: true },
  purchase: { vol: 0.85, vary: 0, prio: true },
  collect: { vol: 0.85, vary: 0.06 },
  unlock: { vol: 0.9, vary: 0, duck: 0.5, prio: true },
  jingle: { vol: 0.8, vary: 0, duck: 0.45, prio: true },
  quest: { vol: 0.85, vary: 0, duck: 0.5, prio: true },
  reward: { vol: 0.9, vary: 0, duck: 0.45, prio: true },
  bonus: { vol: 0.9, vary: 0, duck: 0.45, prio: true },
  achievement: { vol: 0.95, vary: 0, duck: 0.3, prio: true },
  levelup: { vol: 1, vary: 0, duck: 0.2, prio: true },
  chicken: { vol: 0.6, vary: 0.1 },
  cow: { vol: 0.6, vary: 0.08 },
  pig: { vol: 0.6, vary: 0.1 },
  sheep: { vol: 0.6, vary: 0.1 },
  goat: { vol: 0.6, vary: 0.1 },
};

/** Major pentatonic steps (semitones) for combo chains: a little rising melody, never sour. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** Music sits under the sfx: the slider's value is scaled by this. */
const MUSIC_GAIN = 0.55;
/** At most this many non-priority sfx may start within VOICE_WINDOW ms (stops swipe cacophony). */
const VOICE_LIMIT = 7;
const VOICE_WINDOW = 160;

/**
 * Howler-based audio. SFX are small and preloaded; music streams (html5) and changes between
 * daytime and evening playlists, with gentle gaps between tracks and ducking under stingers.
 */
class AudioSystem {
  private sfx = new Map<string, Howl>();
  private panned = new Set<Howl>();
  private music: Howl | null = null;
  private musicKey = '';
  private playlist: string[] = [];
  private lastPlay = new Map<string, number>();
  private recent: number[] = [];
  settings: AudioSettings = { music: 0.5, sfx: 0.8 };
  private started = false;
  private evening = false;
  private duckLevel = 1;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private trackTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

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

  play(name: string, opts: PlayOpts = {}): void {
    // every "nope" also gets a soft double pulse, even with sound turned off
    if (name === 'error') haptics.play('error');
    const s = this.sfx.get(name);
    if (!s || this.settings.sfx <= 0) return;
    const mix = MIX[name] ?? DEFAULT_MIX;
    const now = performance.now();
    const throttle = opts.throttleMs ?? 45;
    if (now - (this.lastPlay.get(name) ?? -1e9) < throttle) return;
    if (!mix.prio) {
      while (this.recent.length && now - this.recent[0] > VOICE_WINDOW) this.recent.shift();
      if (this.recent.length >= VOICE_LIMIT) return;
      this.recent.push(now);
    }
    this.lastPlay.set(name, now);
    const id = s.play();
    s.volume(Math.min(1, (opts.volume ?? 1) * mix.vol * this.settings.sfx), id);
    s.rate(opts.rate ?? (1 + (Math.random() - 0.5) * mix.vary), id);
    // only touch the stereo node when panning is used, and reset it on reused voices
    if (opts.pan !== undefined || this.panned.has(s)) {
      this.panned.add(s);
      try { s.stereo(Math.max(-1, Math.min(1, opts.pan ?? 0)), id); } catch { /* html5 fallback: no panner */ }
    }
    if (mix.duck) this.duck(mix.duck, (s.duration() || 1.5) * 1000);
  }

  /** Rising pentatonic pitch for combos (swipe-harvesting many plots). */
  playCombo(name: string, step: number, pan?: number): void {
    const semis = PENTA[Math.min(step, PENTA.length - 1)];
    this.play(name, { rate: Math.pow(2, semis / 12) * 0.96, throttleMs: 30, pan });
  }

  /** Coins/gems landing in the HUD: a quick rising tick per icon. */
  tick(i: number, n: number, high = false): void {
    const semis = PENTA[Math.min(i, PENTA.length - 1)] + (high ? 12 : 0);
    this.play('coinTick', { rate: Math.pow(2, semis / 12), throttleMs: 28, volume: i === n - 1 ? 1.3 : 1 });
  }

  /** Stereo pan for a screen x position (subtle, the farm is never far away). */
  panFor(x: number): number {
    const w = window.innerWidth || 1;
    return Math.max(-1, Math.min(1, (x / w - 0.5) * 0.7));
  }

  /** Dip the music to `level` for `ms`, then bring it back up softly. */
  duck(level: number, ms: number): void {
    if (!this.music) return;
    const m = this.music;
    const base = this.settings.music * MUSIC_GAIN;
    if (level < this.duckLevel || !this.duckTimer) {
      this.duckLevel = Math.min(this.duckLevel, level);
      if (m.playing()) m.fade(m.volume(), base * this.duckLevel, 180);
    }
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      this.duckTimer = null;
      this.duckLevel = 1;
      if (this.music === m && m.playing()) m.fade(m.volume(), this.settings.music * MUSIC_GAIN, 900);
    }, Math.min(4000, ms));
  }

  setEvening(evening: boolean): void {
    if (evening === this.evening) return;
    this.evening = evening;
    this.playlist = [];
    if (this.started) this.nextTrack(true);
  }

  private startMusic(): void {
    if (this.started) return;
    this.started = true;
    this.nextTrack();
  }

  private nextTrack(fade = false): void {
    if (this.trackTimer) { clearTimeout(this.trackTimer); this.trackTimer = null; }
    if (!this.playlist.length) {
      const day = ['barnville', 'ukulele', 'springchicken'];
      const pool = this.evening ? ['garden'] : day.sort(() => Math.random() - 0.5);
      // never repeat the track that just finished when the playlist refills
      if (pool.length > 1 && pool[0] === this.musicKey) pool.push(pool.shift()!);
      this.playlist = pool;
    }
    const key = this.playlist.shift()!;
    const path = assets.manifest.music[key];
    if (!path) return;
    const old = this.music;
    if (old) {
      if (fade && old.playing()) old.fade(old.volume(), 0, 1500);
      setTimeout(() => old.unload(), fade ? 1600 : 0);
    }
    this.musicKey = key;
    const m = new Howl({ src: [assetUrl(path)], html5: true, volume: 0 });
    // a short breath between songs feels calmer than back-to-back tracks
    m.on('end', () => { if (this.music === m) this.trackTimer = setTimeout(() => this.nextTrack(), 2500); });
    m.on('play', () => {
      this.failures = 0;
      m.fade(m.volume(), this.settings.music * MUSIC_GAIN * this.duckLevel, 2500);
    });
    m.on('loaderror', () => {
      // streaming failed (offline, bad file): try another track a few times, then give up quietly
      if (this.music !== m || ++this.failures > 3) return;
      this.trackTimer = setTimeout(() => this.nextTrack(), 3000);
    });
    m.on('playerror', () => { m.once('unlock', () => { if (this.music === m && this.settings.music > 0) m.play(); }); });
    if (this.settings.music > 0) m.play();
    this.music = m;
  }

  setMusicVolume(v: number): void {
    this.settings.music = v;
    if (!this.music) return;
    if (v <= 0) this.music.pause();
    else {
      if (!this.music.playing() && this.started) this.music.play();
      this.music.volume(v * MUSIC_GAIN * this.duckLevel);
    }
  }
  setSfxVolume(v: number): void { this.settings.sfx = v; }
  get currentTrack(): string { return this.musicKey; }
}

export const audio = new AudioSystem();

/** Named vibration patterns so every interaction of a kind feels the same. */
export type HapticKind = 'tap' | 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'celebrate';
const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 6,
  light: 10,
  medium: 18,
  heavy: 30,
  success: [12, 40, 18],
  error: [22, 45, 22],
  celebrate: [30, 50, 30, 50, 60],
};

/** Haptics (navigator.vibrate) with a user toggle. Single short pulses are rate limited. */
export const haptics = {
  enabled: true,
  supported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  last: 0,
  buzz(pattern: number | number[] = 12): void {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    // rapid swipes would otherwise turn into one long rumble
    if (typeof pattern === 'number' && pattern < 25 && now - this.last < 45) return;
    this.last = now;
    try { navigator.vibrate(pattern); } catch { /* unsupported or blocked */ }
  },
  play(kind: HapticKind): void { this.buzz(PATTERNS[kind]); },
};
