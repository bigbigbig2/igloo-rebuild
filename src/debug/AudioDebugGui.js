import { GUI } from 'dat.gui';

export class AudioDebugGui {
  constructor({ controller }) {
    this.controller = controller;
    this.iglooScene = controller?.sections?.igloo ?? null;
    this.cubesScene = controller?.sections?.cubes ?? null;
    this.homeRenderer = controller?.homeRenderer ?? null;
    this.controllers = [];

    if (!this.iglooScene) {
      return;
    }

    const iglooDebugValues = this.iglooScene?.getIntroDebugSettings?.() ?? {};
    const cubesDebugValues = this.cubesScene?.getLookDebugSettings?.() ?? {};
    const transitionDebugValues =
      this.homeRenderer?.getTransitionDebugSettings?.() ?? {};

    this.values = {
      terrainRevealMaxDist: iglooDebugValues.terrainRevealMaxDist ?? 32,
      terrainRevealNoiseStrength:
        iglooDebugValues.terrainRevealNoiseStrength ?? 3.5,
      terrainRevealInnerWidth: iglooDebugValues.terrainRevealInnerWidth ?? 3.5,
      terrainRevealOuterWidth: iglooDebugValues.terrainRevealOuterWidth ?? 2.5,
      terrainShockwaveWidth: iglooDebugValues.terrainShockwaveWidth ?? 0.1,
      triangleShockwaveWidth: iglooDebugValues.triangleShockwaveWidth ?? 0.1,
      iglooGlowStrength: iglooDebugValues.iglooGlowStrength ?? 0.4,
      bloomStrengthScale: iglooDebugValues.bloomStrengthScale ?? 0.3,
      frostTint: iglooDebugValues.frostTint ?? '#e0ebff',
      frostTintStrength: iglooDebugValues.frostTintStrength ?? 2,
      mountainMaskStart: iglooDebugValues.mountainMaskStart ?? 32,
      mountainMaskEnd: iglooDebugValues.mountainMaskEnd ?? 36,
      cubesLutIntensity: cubesDebugValues.lutIntensity ?? 1,
      cubesBloomStrength: cubesDebugValues.bloomStrength ?? 0.32,
      cubesBloomRadius: cubesDebugValues.bloomRadius ?? 0.78,
      cubesBloomThreshold: cubesDebugValues.bloomThreshold ?? 0.26,
      cubesBgDotStrength: cubesDebugValues.bgDotStrength ?? 1,
      cubesBgShapeAlpha: cubesDebugValues.backgroundShapeAlphaScale ?? 0.9,
      cubesBlurryTextAlpha: cubesDebugValues.blurryTextOpacityScale ?? 0.9,
      cubesSmokeAlpha: cubesDebugValues.smokeOpacityScale ?? 1,
      homeChromaticStrength:
        transitionDebugValues.homeChromaticStrength ?? 0.58,
      homeEdgeSoftness: transitionDebugValues.homeEdgeSoftness ?? 1
    };

    this.actions = {
      replayIglooIntro: () => {
        this.controller?.replayIglooIntro?.();
      },
      resetIglooIntroDebug: () => {
        this.iglooScene?.resetIntroDebugSettings?.();
        this.syncValuesFromIglooScene();
        this.refresh();
      },
      resetCubesLook: () => {
        this.cubesScene?.resetLookDebugSettings?.();
        this.syncValuesFromCubesScene();
        this.refresh();
      },
      resetTransitionFx: () => {
        this.homeRenderer?.resetTransitionDebugSettings?.();
        this.syncValuesFromHomeRenderer();
        this.refresh();
      }
    };

    this.gui = new GUI({
      name: 'Controls',
      width: 340,
      hideable: true
    });
    this.gui.domElement.style.zIndex = '2000';
    this.gui.close();

    this.buildIglooIntroFolder();
    this.buildCubesLookFolder();
    this.buildTransitionFolder();

    this.syncValuesFromIglooScene();
    this.syncValuesFromCubesScene();
    this.syncValuesFromHomeRenderer();
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

  addColorController(folder, object, key) {
    const controller = folder.addColor(object, key);
    this.controllers.push(controller);
    return controller;
  }

  buildIglooIntroFolder() {
    if (!this.iglooScene) {
      return;
    }

    const folder = this.gui.addFolder('Igloo Intro');
    this.addController(folder, this.actions, 'replayIglooIntro').name('Replay intro');
    this.addController(folder, this.values, 'iglooGlowStrength', 0, 2.5, 0.01).name('Igloo glow').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('iglooGlowStrength', value);
    });
    this.addController(folder, this.values, 'bloomStrengthScale', 0, 2.5, 0.01).name('Bloom gain').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('bloomStrengthScale', value);
    });
    this.addColorController(folder, this.values, 'frostTint').name('Frost tint').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('frostTint', value);
    });
    this.addController(folder, this.values, 'frostTintStrength', 0, 2.5, 0.01).name('Frost strength').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('frostTintStrength', value);
    });
    this.addController(folder, this.values, 'terrainRevealMaxDist', 8, 80, 0.1).name('Reveal max').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('terrainRevealMaxDist', value);
    });
    this.addController(folder, this.values, 'terrainRevealNoiseStrength', 0, 12, 0.01).name('Noise strength').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('terrainRevealNoiseStrength', value);
    });
    this.addController(folder, this.values, 'terrainRevealInnerWidth', 0.1, 16, 0.01).name('Inner width').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('terrainRevealInnerWidth', value);
    });
    this.addController(folder, this.values, 'terrainRevealOuterWidth', 0.1, 16, 0.01).name('Outer width').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('terrainRevealOuterWidth', value);
    });
    this.addController(folder, this.values, 'terrainShockwaveWidth', 0.01, 3, 0.01).name('Terrain wave').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('terrainShockwaveWidth', value);
    });
    this.addController(folder, this.values, 'triangleShockwaveWidth', 0.01, 3, 0.01).name('Triangle wave').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('triangleShockwaveWidth', value);
    });
    this.addController(folder, this.values, 'mountainMaskStart', 0, 80, 0.1).name('Mask start').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('mountainMaskStart', value);
    });
    this.addController(folder, this.values, 'mountainMaskEnd', 0, 96, 0.1).name('Mask end').onChange((value) => {
      this.iglooScene?.setIntroDebugSetting?.('mountainMaskEnd', value);
    });
    this.addController(folder, this.actions, 'resetIglooIntroDebug').name('Reset intro params');
  }

  buildTransitionFolder() {
    if (!this.homeRenderer) {
      return;
    }

    const folder = this.gui.addFolder('Transition FX');
    this.addController(folder, this.values, 'homeChromaticStrength', 0, 1.5, 0.01).name('Home chroma').onChange((value) => {
      this.homeRenderer?.setTransitionDebugSetting?.('homeChromaticStrength', value);
    });
    this.addController(folder, this.values, 'homeEdgeSoftness', 0.3, 2.5, 0.01).name('Home edge').onChange((value) => {
      this.homeRenderer?.setTransitionDebugSetting?.('homeEdgeSoftness', value);
    });
    this.addController(folder, this.actions, 'resetTransitionFx').name('Reset transition fx');
  }

  buildCubesLookFolder() {
    if (!this.cubesScene) {
      return;
    }

    const folder = this.gui.addFolder('Cubes Look');
    this.addController(folder, this.values, 'cubesLutIntensity', 0, 1.5, 0.01).name('LUT').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('lutIntensity', value);
    });
    this.addController(folder, this.values, 'cubesBloomStrength', 0, 1.5, 0.01).name('Bloom').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('bloomStrength', value);
    });
    this.addController(folder, this.values, 'cubesBloomRadius', 0, 1, 0.01).name('Bloom radius').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('bloomRadius', value);
    });
    this.addController(folder, this.values, 'cubesBloomThreshold', 0, 1, 0.01).name('Bloom threshold').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('bloomThreshold', value);
    });
    this.addController(folder, this.values, 'cubesBgDotStrength', 0, 2, 0.01).name('BG dots').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('bgDotStrength', value);
    });
    this.addController(folder, this.values, 'cubesBgShapeAlpha', 0, 2, 0.01).name('BG shapes').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('backgroundShapeAlphaScale', value);
    });
    this.addController(folder, this.values, 'cubesBlurryTextAlpha', 0, 2, 0.01).name('Blurry text').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('blurryTextOpacityScale', value);
    });
    this.addController(folder, this.values, 'cubesSmokeAlpha', 0, 2, 0.01).name('Smoke').onChange((value) => {
      this.cubesScene?.setLookDebugSetting?.('smokeOpacityScale', value);
    });
    this.addController(folder, this.actions, 'resetCubesLook').name('Reset cubes look');
  }

  syncValuesFromIglooScene() {
    const settings = this.iglooScene?.getIntroDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.terrainRevealMaxDist = settings.terrainRevealMaxDist;
    this.values.terrainRevealNoiseStrength = settings.terrainRevealNoiseStrength;
    this.values.terrainRevealInnerWidth = settings.terrainRevealInnerWidth;
    this.values.terrainRevealOuterWidth = settings.terrainRevealOuterWidth;
    this.values.terrainShockwaveWidth = settings.terrainShockwaveWidth;
    this.values.triangleShockwaveWidth = settings.triangleShockwaveWidth;
    this.values.iglooGlowStrength = settings.iglooGlowStrength;
    this.values.bloomStrengthScale = settings.bloomStrengthScale;
    this.values.frostTint = settings.frostTint;
    this.values.frostTintStrength = settings.frostTintStrength;
    this.values.mountainMaskStart = settings.mountainMaskStart;
    this.values.mountainMaskEnd = settings.mountainMaskEnd;
  }

  syncValuesFromCubesScene() {
    const settings = this.cubesScene?.getLookDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.cubesLutIntensity = settings.lutIntensity;
    this.values.cubesBloomStrength = settings.bloomStrength;
    this.values.cubesBloomRadius = settings.bloomRadius;
    this.values.cubesBloomThreshold = settings.bloomThreshold;
    this.values.cubesBgDotStrength = settings.bgDotStrength;
    this.values.cubesBgShapeAlpha = settings.backgroundShapeAlphaScale;
    this.values.cubesBlurryTextAlpha = settings.blurryTextOpacityScale;
    this.values.cubesSmokeAlpha = settings.smokeOpacityScale;
  }

  syncValuesFromHomeRenderer() {
    const settings = this.homeRenderer?.getTransitionDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.homeChromaticStrength = settings.homeChromaticStrength;
    this.values.homeEdgeSoftness = settings.homeEdgeSoftness;
  }

  refresh() {
    this.controllers.forEach((controller) => {
      controller.updateDisplay();
    });
  }

  dispose() {
    this.gui?.destroy();
    this.controllers = [];
  }
}
