import { GUI } from 'dat.gui';

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export class AudioDebugGui {
  constructor({ controller }) {
    this.controller = controller;
    this.audio = controller?.audio ?? null;
    this.controllers = [];

    if (!this.audio) {
      return;
    }

    this.values = {
      unlocked: this.audio.unlocked,
      muted: this.audio.muted,
      masterVolume: this.audio.masterVolume,
      fadeSpeed: this.audio.settings.fadeSpeed,
      detailDucking: this.audio.settings.detailDucking,
      autoMix: this.audio.settings.autoMix,
      pauseWhenHidden: this.audio.settings.pauseWhenHidden,
      musicBaseVolume: this.audio.settings.musicBaseVolume,
      homeMusicMix: this.audio.settings.homeMusicMix,
      projectMusicMix: this.audio.settings.projectMusicMix,
      roomBaseVolume: this.audio.settings.roomBaseVolume,
      iglooRoomMix: this.audio.settings.iglooRoomMix,
      cubesRoomMix: this.audio.settings.cubesRoomMix,
      entryRoomMix: this.audio.settings.entryRoomMix,
      projectRoomMix: this.audio.settings.projectRoomMix,
      manualMusicMix: this.audio.settings.manualMusicMix,
      manualRoomMix: this.audio.settings.manualRoomMix,
      manifestoVolume: this.audio.settings.manifestoVolume,
      clickProjectVolume: this.audio.settings.clickProjectVolume,
      routeName: this.audio.state.routeName,
      activeSectionKey: this.audio.state.activeSectionKey ?? 'none',
      hasProject: this.audio.state.hasProject,
      detailUiProgress: this.audio.state.detailUiProgress,
      visibilityHidden: this.audio.visibilityHidden,
      musicTargetMix: this.audio.metrics.musicTargetMix,
      musicCurrentMix: this.audio.metrics.musicCurrentMix,
      roomTargetMix: this.audio.metrics.roomTargetMix,
      roomCurrentMix: this.audio.metrics.roomCurrentMix
    };
    this.actions = {
      unlock: () => {
        this.audio.unlock();
      },
      playManifesto: () => {
        this.audio.play('manifesto');
      },
      playClickProject: () => {
        this.audio.play('click-project');
      },
      stopAll: () => {
        this.audio.stopAll();
      },
      resetDefaults: () => {
        this.audio.resetDefaults();
      }
    };

    this.gui = new GUI({
      name: 'Audio Debug',
      width: 340,
      hideable: true
    });
    this.gui.domElement.style.zIndex = '2000';
    this.gui.close();

    this.buildGlobalFolder();
    this.buildLoopFolder();
    this.buildOneShotFolder();
    this.buildDebugFolder();

    this.unsubscribe = this.audio.onChange(() => {
      this.syncValuesFromAudio();
      this.refresh();
    });

    this.syncValuesFromAudio();
    this.refresh();
  }

  addController(folder, object, key, min = null, max = null, step = null) {
    let controller = null;

    if (typeof min === 'number' && typeof max === 'number') {
      controller = folder.add(object, key, min, max);
    } else {
      controller = folder.add(object, key);
    }

    if (typeof step === 'number') {
      controller.step(step);
    }

    this.controllers.push(controller);
    return controller;
  }

  buildGlobalFolder() {
    const folder = this.gui.addFolder('Global');
    this.addController(folder, this.actions, 'unlock').name('Unlock loops');
    this.addController(folder, this.values, 'muted').name('Muted').onChange((value) => {
      this.controller.setAudioMuted(value);
    });
    this.addController(folder, this.values, 'masterVolume', 0, 1, 0.01).name('Master volume').onChange((value) => {
      this.audio.setMasterVolume(value);
    });
    this.addController(folder, this.values, 'fadeSpeed', 0.1, 12, 0.1).name('Fade speed').onChange((value) => {
      this.audio.setFadeSpeed(value);
    });
    this.addController(folder, this.values, 'detailDucking', 0, 1, 0.01).name('Detail ducking').onChange((value) => {
      this.audio.setDetailDucking(value);
    });
    this.addController(folder, this.values, 'autoMix').name('Auto mix').onChange((value) => {
      this.audio.setAutoMix(value);
    });
    this.addController(folder, this.values, 'pauseWhenHidden').name('Pause when hidden').onChange((value) => {
      this.audio.setPauseWhenHidden(value);
    });
  }

  buildLoopFolder() {
    const folder = this.gui.addFolder('Loops');
    this.addController(folder, this.values, 'musicBaseVolume', 0, 1, 0.01).name('Music base').onChange((value) => {
      this.audio.setTrackBaseVolume('music-bg', value);
    });
    this.addController(folder, this.values, 'homeMusicMix', 0, 1, 0.01).name('Home music mix').onChange((value) => {
      this.audio.setMixSetting('homeMusicMix', value);
    });
    this.addController(folder, this.values, 'projectMusicMix', 0, 1, 0.01).name('Project music mix').onChange((value) => {
      this.audio.setMixSetting('projectMusicMix', value);
    });
    this.addController(folder, this.values, 'roomBaseVolume', 0, 1, 0.01).name('Room base').onChange((value) => {
      this.audio.setTrackBaseVolume('room-bg', value);
    });
    this.addController(folder, this.values, 'iglooRoomMix', 0, 1, 0.01).name('Igloo room mix').onChange((value) => {
      this.audio.setMixSetting('iglooRoomMix', value);
    });
    this.addController(folder, this.values, 'cubesRoomMix', 0, 1, 0.01).name('Cubes room mix').onChange((value) => {
      this.audio.setMixSetting('cubesRoomMix', value);
    });
    this.addController(folder, this.values, 'entryRoomMix', 0, 1, 0.01).name('Entry room mix').onChange((value) => {
      this.audio.setMixSetting('entryRoomMix', value);
    });
    this.addController(folder, this.values, 'projectRoomMix', 0, 1, 0.01).name('Project room mix').onChange((value) => {
      this.audio.setMixSetting('projectRoomMix', value);
    });
    this.addController(folder, this.values, 'manualMusicMix', 0, 1, 0.01).name('Manual music mix').onChange((value) => {
      this.audio.setMixSetting('manualMusicMix', value);
    });
    this.addController(folder, this.values, 'manualRoomMix', 0, 1, 0.01).name('Manual room mix').onChange((value) => {
      this.audio.setMixSetting('manualRoomMix', value);
    });
  }

  buildOneShotFolder() {
    const folder = this.gui.addFolder('One-shots');
    this.addController(folder, this.values, 'manifestoVolume', 0, 1, 0.01).name('Manifesto volume').onChange((value) => {
      this.audio.setTrackBaseVolume('manifesto', value);
    });
    this.addController(folder, this.values, 'clickProjectVolume', 0, 1, 0.01).name('Click volume').onChange((value) => {
      this.audio.setTrackBaseVolume('click-project', value);
    });
    this.addController(folder, this.actions, 'playManifesto').name('Play manifesto');
    this.addController(folder, this.actions, 'playClickProject').name('Play click-project');
    this.addController(folder, this.actions, 'stopAll').name('Stop all audio');
    this.addController(folder, this.actions, 'resetDefaults').name('Reset defaults');
  }

  buildDebugFolder() {
    const folder = this.gui.addFolder('Debug');
    this.addController(folder, this.values, 'unlocked').name('Unlocked').listen();
    this.addController(folder, this.values, 'routeName').name('Route').listen();
    this.addController(folder, this.values, 'activeSectionKey').name('Section').listen();
    this.addController(folder, this.values, 'hasProject').name('Has project').listen();
    this.addController(folder, this.values, 'detailUiProgress', 0, 1, 0.001).name('Detail progress').listen();
    this.addController(folder, this.values, 'visibilityHidden').name('Hidden').listen();
    this.addController(folder, this.values, 'musicTargetMix', 0, 1, 0.001).name('Music target').listen();
    this.addController(folder, this.values, 'musicCurrentMix', 0, 1, 0.001).name('Music current').listen();
    this.addController(folder, this.values, 'roomTargetMix', 0, 1, 0.001).name('Room target').listen();
    this.addController(folder, this.values, 'roomCurrentMix', 0, 1, 0.001).name('Room current').listen();
  }

  syncValuesFromAudio() {
    this.values.unlocked = this.audio.unlocked;
    this.values.muted = this.audio.muted;
    this.values.masterVolume = this.audio.masterVolume;
    this.values.fadeSpeed = this.audio.settings.fadeSpeed;
    this.values.detailDucking = this.audio.settings.detailDucking;
    this.values.autoMix = this.audio.settings.autoMix;
    this.values.pauseWhenHidden = this.audio.settings.pauseWhenHidden;
    this.values.musicBaseVolume = clamp01(this.audio.settings.musicBaseVolume);
    this.values.homeMusicMix = clamp01(this.audio.settings.homeMusicMix);
    this.values.projectMusicMix = clamp01(this.audio.settings.projectMusicMix);
    this.values.roomBaseVolume = clamp01(this.audio.settings.roomBaseVolume);
    this.values.iglooRoomMix = clamp01(this.audio.settings.iglooRoomMix);
    this.values.cubesRoomMix = clamp01(this.audio.settings.cubesRoomMix);
    this.values.entryRoomMix = clamp01(this.audio.settings.entryRoomMix);
    this.values.projectRoomMix = clamp01(this.audio.settings.projectRoomMix);
    this.values.manualMusicMix = clamp01(this.audio.settings.manualMusicMix);
    this.values.manualRoomMix = clamp01(this.audio.settings.manualRoomMix);
    this.values.manifestoVolume = clamp01(this.audio.settings.manifestoVolume);
    this.values.clickProjectVolume = clamp01(this.audio.settings.clickProjectVolume);
    this.values.routeName = this.audio.state.routeName ?? 'none';
    this.values.activeSectionKey = this.audio.state.activeSectionKey ?? 'none';
    this.values.hasProject = Boolean(this.audio.state.hasProject);
    this.values.detailUiProgress = clamp01(this.audio.state.detailUiProgress ?? 0);
    this.values.visibilityHidden = Boolean(this.audio.visibilityHidden);
    this.values.musicTargetMix = clamp01(this.audio.metrics.musicTargetMix);
    this.values.musicCurrentMix = clamp01(this.audio.metrics.musicCurrentMix);
    this.values.roomTargetMix = clamp01(this.audio.metrics.roomTargetMix);
    this.values.roomCurrentMix = clamp01(this.audio.metrics.roomCurrentMix);
  }

  refresh() {
    this.controllers.forEach((controller) => {
      controller.updateDisplay();
    });
  }

  dispose() {
    this.unsubscribe?.();
    this.gui?.destroy();
    this.controllers = [];
  }
}
