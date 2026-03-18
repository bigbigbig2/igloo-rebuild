import { clamp, damp } from '../utils/math.js';

const LOOP_TRACK_KEYS = ['music-bg', 'room-bg', 'shard'];

const TRACK_DEFAULTS = {
  'music-bg': {
    type: 'loop',
    volume: 0.2
  },
  'room-bg': {
    type: 'loop',
    volume: 0.45
  },
  shard: {
    type: 'loop',
    volume: 0.18
  },
  manifesto: {
    type: 'one-shot',
    volume: 0.3
  },
  'click-project': {
    type: 'one-shot',
    volume: 0.5
  },
  'enter-project': {
    type: 'one-shot',
    volume: 0.28
  },
  'leave-project': {
    type: 'one-shot',
    volume: 0.24
  },
  beeps: {
    type: 'one-shot',
    volume: 0.18
  },
  beeps2: {
    type: 'one-shot',
    volume: 0.18
  },
  beeps3: {
    type: 'one-shot',
    volume: 0.18
  },
  'project-text': {
    type: 'one-shot',
    volume: 0.22
  }
};

const MIX_DEFAULTS = {
  autoMix: true,
  fadeSpeed: 4,
  pauseWhenHidden: true,
  detailDucking: 0.2,
  homeMusicMix: 1,
  projectMusicMix: 0.78,
  iglooRoomMix: 1,
  cubesRoomMix: 0.36,
  entryRoomMix: 0.2,
  projectRoomMix: 0.14,
  manualMusicMix: 1,
  manualRoomMix: 0.45
};

function createLoopElement(source) {
  const element = new Audio(source);
  element.preload = 'auto';
  element.loop = true;
  element.playsInline = true;
  element.crossOrigin = 'anonymous';
  element.volume = 0;
  return element;
}

function createOneShotElement(source) {
  const element = new Audio(source);
  element.preload = 'auto';
  element.loop = false;
  element.playsInline = true;
  element.crossOrigin = 'anonymous';
  return element;
}

function removeFromSet(set, value) {
  if (set.has(value)) {
    set.delete(value);
  }
}

export class AudioController {
  constructor({ assets, content } = {}) {
    this.assets = assets;
    this.content = content;
    this.listeners = new Set();
    this.tracks = new Map();
    this.unlocked = false;
    this.unlocking = null;
    this.visibilityHidden = typeof document !== 'undefined' ? document.hidden : false;
    this.state = {
      routeName: 'home',
      activeSectionKey: null,
      hasProject: false,
      detailUiProgress: 0
    };
    this.settings = {
      muted: Boolean(content?.audio?.muted ?? true),
      masterVolume: clamp(content?.audio?.volume ?? 1, 0, 1),
      ...MIX_DEFAULTS,
      musicBaseVolume: TRACK_DEFAULTS['music-bg'].volume,
      roomBaseVolume: TRACK_DEFAULTS['room-bg'].volume,
      manifestoVolume: TRACK_DEFAULTS.manifesto.volume,
      clickProjectVolume: TRACK_DEFAULTS['click-project'].volume
    };
    this.metrics = {
      musicTargetMix: 0,
      musicCurrentMix: 0,
      roomTargetMix: 0,
      roomCurrentMix: 0
    };

    this.handleUserGesture = this.handleUserGesture.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);

    this.initTracks();
    this.attachDomListeners();
    this.applyVolumes();
  }

  initTracks() {
    Object.entries(TRACK_DEFAULTS).forEach(([key, definition]) => {
      const source = this.resolveSource(key);

      if (!source) {
        return;
      }

      this.tracks.set(key, {
        key,
        source,
        type: definition.type,
        baseVolume: definition.volume,
        targetMix: 0,
        currentMix: 0,
        element: definition.type === 'loop' ? createLoopElement(source) : null,
        instances: new Set(),
        started: false,
        playPromise: null
      });
    });
  }

  attachDomListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.handleUserGesture, { passive: true });
      window.addEventListener('keydown', this.handleUserGesture);
      window.addEventListener('touchstart', this.handleUserGesture, { passive: true });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  detachDomListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.handleUserGesture);
      window.removeEventListener('keydown', this.handleUserGesture);
      window.removeEventListener('touchstart', this.handleUserGesture);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  resolveSource(key) {
    const entry = this.assets?.list('audio')?.find((item) => item.key === key) ?? null;
    return entry?.source ?? null;
  }

  handleUserGesture() {
    this.unlock();
  }

  handleVisibilityChange() {
    this.visibilityHidden = Boolean(document?.hidden);

    if (this.settings.pauseWhenHidden) {
      if (this.visibilityHidden) {
        this.pauseLoops();
      } else if (this.unlocked) {
        this.resumeLoops();
      }
    }

    this.applyVolumes();
    this.emitChange();
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => {
      listener(snapshot);
    });
  }

  getSnapshot() {
    return {
      unlocked: this.unlocked,
      muted: this.settings.muted,
      masterVolume: this.settings.masterVolume,
      activeSectionKey: this.state.activeSectionKey,
      routeName: this.state.routeName,
      hasProject: this.state.hasProject,
      detailUiProgress: this.state.detailUiProgress,
      visibilityHidden: this.visibilityHidden,
      metrics: { ...this.metrics }
    };
  }

  get muted() {
    return this.settings.muted;
  }

  get masterVolume() {
    return this.settings.masterVolume;
  }

  setMuted(muted) {
    const nextMuted = Boolean(muted);

    if (nextMuted === this.settings.muted) {
      return;
    }

    this.settings.muted = nextMuted;
    this.content.audio.muted = nextMuted;
    this.applyVolumes();
    this.emitChange();
  }

  toggleMute() {
    this.setMuted(!this.settings.muted);
  }

  setMasterVolume(volume) {
    const nextVolume = clamp(volume, 0, 1);

    if (Math.abs(nextVolume - this.settings.masterVolume) < 1e-4) {
      return;
    }

    this.settings.masterVolume = nextVolume;
    this.content.audio.volume = nextVolume;
    this.applyVolumes();
    this.emitChange();
  }

  setFadeSpeed(value) {
    this.settings.fadeSpeed = clamp(value, 0.1, 12);
    this.emitChange();
  }

  setPauseWhenHidden(enabled) {
    this.settings.pauseWhenHidden = Boolean(enabled);

    if (this.settings.pauseWhenHidden && this.visibilityHidden) {
      this.pauseLoops();
    } else if (this.unlocked) {
      this.resumeLoops();
    }

    this.applyVolumes();
    this.emitChange();
  }

  setAutoMix(enabled) {
    this.settings.autoMix = Boolean(enabled);
    this.emitChange();
  }

  setDetailDucking(value) {
    this.settings.detailDucking = clamp(value, 0, 1);
    this.emitChange();
  }

  setMixSetting(key, value) {
    if (!(key in MIX_DEFAULTS)) {
      return;
    }

    this.settings[key] = clamp(value, 0, 1);
    this.emitChange();
  }

  setTrackBaseVolume(key, value) {
    const track = this.tracks.get(key);

    if (!track) {
      return;
    }

    const nextVolume = clamp(value, 0, 1);
    track.baseVolume = nextVolume;

    if (key === 'music-bg') {
      this.settings.musicBaseVolume = nextVolume;
    } else if (key === 'room-bg') {
      this.settings.roomBaseVolume = nextVolume;
    } else if (key === 'manifesto') {
      this.settings.manifestoVolume = nextVolume;
    } else if (key === 'click-project') {
      this.settings.clickProjectVolume = nextVolume;
    }

    this.applyVolumes();
    this.emitChange();
  }

  setTrackTargetMix(key, value) {
    const track = this.tracks.get(key);

    if (!track) {
      return;
    }

    track.targetMix = clamp(value, 0, 1);

    if (key === 'music-bg') {
      this.metrics.musicTargetMix = track.targetMix;
    } else if (key === 'room-bg') {
      this.metrics.roomTargetMix = track.targetMix;
    }
  }

  async unlock() {
    if (this.unlocked) {
      return true;
    }

    if (this.unlocking) {
      return this.unlocking;
    }

    this.unlocking = Promise.all(LOOP_TRACK_KEYS.map(async (key) => {
      const track = this.tracks.get(key);

      if (!track?.element) {
        return false;
      }

      try {
        track.element.volume = 0;
        await track.element.play();
        track.started = true;
        return true;
      } catch (error) {
        return false;
      }
    })).then((results) => {
      const unlocked = results.some(Boolean);

      if (unlocked) {
        this.unlocked = true;
        this.applyVolumes();
        this.emitChange();
      }

      this.unlocking = null;
      return unlocked;
    });

    return this.unlocking;
  }

  pauseLoops() {
    LOOP_TRACK_KEYS.forEach((key) => {
      const track = this.tracks.get(key);

      if (!track?.element || track.element.paused) {
        return;
      }

      track.element.pause();
      track.started = false;
    });
  }

  resumeLoops() {
    LOOP_TRACK_KEYS.forEach((key) => {
      const track = this.tracks.get(key);

      if (!track?.element || track.targetMix <= 0.001) {
        return;
      }

      this.ensureLoopPlayback(track);
    });
  }

  async ensureLoopPlayback(track) {
    if (!track?.element || !this.unlocked) {
      return false;
    }

    if (!track.element.paused) {
      track.started = true;
      return true;
    }

    if (track.playPromise) {
      return track.playPromise;
    }

    track.playPromise = track.element.play()
      .then(() => {
        track.started = true;
        track.playPromise = null;
        return true;
      })
      .catch(() => {
        track.playPromise = null;
        return false;
      });

    return track.playPromise;
  }

  computeMixTargets() {
    if (!this.settings.autoMix) {
      return {
        musicMix: this.settings.manualMusicMix,
        roomMix: this.settings.manualRoomMix
      };
    }

    const detailProgress = clamp(this.state.detailUiProgress ?? 0, 0, 1);
    let musicMix = 0;
    let roomMix = 0;

    if (this.state.routeName === 'home' || this.state.hasProject) {
      musicMix = this.state.hasProject
        ? this.settings.projectMusicMix
        : this.settings.homeMusicMix;
    }

    if (this.state.hasProject) {
      roomMix = this.settings.projectRoomMix;
    } else if (this.state.routeName === 'home') {
      if (this.state.activeSectionKey === 'igloo') {
        roomMix = this.settings.iglooRoomMix;
      } else if (this.state.activeSectionKey === 'cubes') {
        roomMix = this.settings.cubesRoomMix;
      } else if (this.state.activeSectionKey === 'entry') {
        roomMix = this.settings.entryRoomMix;
      }
    }

    const duck = 1 - detailProgress * this.settings.detailDucking;
    return {
      musicMix: musicMix * duck,
      roomMix: roomMix * duck
    };
  }

  update(delta, nextState = null) {
    if (nextState) {
      this.state = {
        ...this.state,
        ...nextState
      };
    }

    const { musicMix, roomMix } = this.computeMixTargets();
    this.setTrackTargetMix('music-bg', musicMix);
    this.setTrackTargetMix('room-bg', roomMix);

    LOOP_TRACK_KEYS.forEach((key) => {
      const track = this.tracks.get(key);

      if (!track) {
        return;
      }

      track.currentMix = damp(track.currentMix, track.targetMix, this.settings.fadeSpeed, delta);

      if (key === 'music-bg') {
        this.metrics.musicCurrentMix = track.currentMix;
      } else if (key === 'room-bg') {
        this.metrics.roomCurrentMix = track.currentMix;
      }

      if (
        this.unlocked
        && !this.visibilityHidden
        && (!this.settings.pauseWhenHidden || !document.hidden)
        && track.targetMix > 0.001
      ) {
        this.ensureLoopPlayback(track);
      }
    });

    this.applyVolumes();
  }

  getEffectiveMasterVolume() {
    if (this.settings.muted) {
      return 0;
    }

    if (this.settings.pauseWhenHidden && this.visibilityHidden) {
      return 0;
    }

    return this.settings.masterVolume;
  }

  applyVolumes() {
    const master = this.getEffectiveMasterVolume();

    this.tracks.forEach((track) => {
      if (track.type === 'loop' && track.element) {
        track.element.volume = clamp(track.baseVolume * track.currentMix * master, 0, 1);
      }

      if (track.type === 'one-shot') {
        track.instances.forEach((instance) => {
          instance.volume = clamp(track.baseVolume * master, 0, 1);
        });
      }
    });
  }

  async play(key) {
    const track = this.tracks.get(key);

    if (!track) {
      return false;
    }

    if (track.type === 'loop') {
      if (!this.unlocked) {
        await this.unlock();
      }

      return this.ensureLoopPlayback(track);
    }

    const element = createOneShotElement(track.source);
    element.volume = clamp(track.baseVolume * this.getEffectiveMasterVolume(), 0, 1);

    const cleanup = () => {
      element.pause();
      element.src = '';
      removeFromSet(track.instances, element);
    };

    element.addEventListener('ended', cleanup, { once: true });
    element.addEventListener('error', cleanup, { once: true });
    track.instances.add(element);

    try {
      await element.play();
      return true;
    } catch (error) {
      cleanup();
      return false;
    }
  }

  stopLoop(key) {
    const track = this.tracks.get(key);

    if (!track?.element) {
      return;
    }

    track.element.pause();
    track.element.currentTime = 0;
    track.started = false;
  }

  stopAll() {
    LOOP_TRACK_KEYS.forEach((key) => this.stopLoop(key));

    this.tracks.forEach((track) => {
      if (track.type !== 'one-shot') {
        return;
      }

      track.instances.forEach((instance) => {
        instance.pause();
        instance.src = '';
      });
      track.instances.clear();
    });
  }

  resetDefaults() {
    this.settings = {
      ...this.settings,
      ...MIX_DEFAULTS,
      musicBaseVolume: TRACK_DEFAULTS['music-bg'].volume,
      roomBaseVolume: TRACK_DEFAULTS['room-bg'].volume,
      manifestoVolume: TRACK_DEFAULTS.manifesto.volume,
      clickProjectVolume: TRACK_DEFAULTS['click-project'].volume
    };
    this.setTrackBaseVolume('music-bg', this.settings.musicBaseVolume);
    this.setTrackBaseVolume('room-bg', this.settings.roomBaseVolume);
    this.setTrackBaseVolume('manifesto', this.settings.manifestoVolume);
    this.setTrackBaseVolume('click-project', this.settings.clickProjectVolume);
    this.applyVolumes();
    this.emitChange();
  }

  dispose() {
    this.detachDomListeners();
    this.stopAll();

    this.tracks.forEach((track) => {
      track.element?.pause();
      track.element?.removeAttribute('src');
      track.element?.load?.();
    });

    this.tracks.clear();
    this.listeners.clear();
  }
}
