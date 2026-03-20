import { GUI } from 'dat.gui';

export class AudioDebugGui {
  constructor({ controller }) {
    this.controller = controller;
    this.iglooScene = controller?.sections?.igloo ?? null;
    this.cubesScene = controller?.sections?.cubes ?? null;
    this.entryScene = controller?.sections?.entry ?? null;
    this.homeRenderer = controller?.homeRenderer ?? null;
    this.webglUi = controller?.webglUi ?? null;
    this.controllers = [];

    if (!this.iglooScene) {
      return;
    }

    const iglooDebugValues = this.iglooScene?.getIntroDebugSettings?.() ?? {};
    const cubesDebugValues = this.cubesScene?.getLookDebugSettings?.() ?? {};
    const cubesLabelDebugValues = this.cubesScene?.getLabelDebugSettings?.() ?? {};
    const entryDebugValues = this.entryScene?.getEntryDebugSettings?.() ?? {};
    const entryHudDebugValues = this.webglUi?.getEntryDebugSettings?.() ?? {};
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
      cubesBloomStrength: cubesDebugValues.bloomStrength ?? 0,
      cubesBloomRadius: cubesDebugValues.bloomRadius ?? 0.62,
      cubesBloomThreshold: cubesDebugValues.bloomThreshold ?? 0.72,
      cubesBgDotStrength: cubesDebugValues.bgDotStrength ?? 0.24,
      cubesBgShapeAlpha: cubesDebugValues.backgroundShapeAlphaScale ?? 0.12,
      cubesBlurryTextAlpha: cubesDebugValues.blurryTextOpacityScale ?? 0.22,
      cubesSmokeAlpha: cubesDebugValues.smokeOpacityScale ?? 0.85,
      cubesLabelsScale: cubesLabelDebugValues.textScaleMultiplier ?? 0.5,
      entryParticleSize: entryDebugValues.particleSizeMultiplier ?? 1,
      entryParticleAlpha: entryDebugValues.particleAlphaMultiplier ?? 1,
      entryParticleSpin: entryDebugValues.particleRotationSpeed ?? 1,
      entryParticleNoise: entryDebugValues.particleNoiseMultiplier ?? 1,
      entryParticleGlow: entryDebugValues.particleInitialGlowMultiplier ?? 1,
      entryParticleSimSpeed: entryDebugValues.particleSimulationSpeed ?? 1,
      entryParticleFlow: entryDebugValues.particleFlowForceMultiplier ?? 1,
      entryParticleOrig: entryDebugValues.particleOrigForceMultiplier ?? 1,
      entryParticleSurface: entryDebugValues.particleSurfaceForceMultiplier ?? 1,
      entryParticleFriction: entryDebugValues.particleFriction ?? 0.9,
      entryParticleInteraction: entryDebugValues.particleInteractionForceMultiplier ?? 1,
      entryCylinderAlpha: entryDebugValues.cylinderShellAlphaMultiplier ?? 1,
      entryFloorPhaseSpeed: entryDebugValues.floorPhaseSpeed ?? 1,
      entryLabelYOffset: entryHudDebugValues.labelYOffset ?? 24,
      entryLabelTextLift: entryHudDebugValues.labelTextLift ?? 6,
      entryLabelSpread: entryHudDebugValues.labelSpreadMultiplier ?? 1,
      entryCurrentLabelScale: entryHudDebugValues.currentScaleMultiplier ?? 1.08,
      entryCurrentLabelOpacity: entryHudDebugValues.currentOpacityMultiplier ?? 1.18,
      entrySideLabelOpacity: entryHudDebugValues.sideOpacityMultiplier ?? 2.3,
      entryVisitYOffset: entryHudDebugValues.visitYOffset ?? -46,
      entryVisitOpacity: entryHudDebugValues.visitOpacityMultiplier ?? 0.35,
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
      resetCubesLabels: () => {
        this.cubesScene?.resetLabelDebugSettings?.();
        this.syncValuesFromCubesScene();
        this.refresh();
      },
      resetEntryDebug: () => {
        this.entryScene?.resetEntryDebugSettings?.();
        this.webglUi?.resetEntryDebugSettings?.();
        this.syncValuesFromEntryScene();
        this.syncValuesFromWebglUi();
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
    this.buildCubesLabelsFolder();
    this.buildEntryFolder();
    this.buildTransitionFolder();

    this.syncValuesFromIglooScene();
    this.syncValuesFromCubesScene();
    this.syncValuesFromEntryScene();
    this.syncValuesFromWebglUi();
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

  buildCubesLabelsFolder() {
    if (!this.cubesScene) {
      return;
    }

    const folder = this.gui.addFolder('Cubes Labels');
    this.addController(folder, this.values, 'cubesLabelsScale', 0.5, 4, 0.01).name('Label scale').onChange((value) => {
      this.cubesScene?.setLabelDebugSetting?.('textScaleMultiplier', value);
    });
    this.addController(folder, this.actions, 'resetCubesLabels').name('Reset labels debug');
  }

  buildEntryFolder() {
    if (!this.entryScene && !this.webglUi) {
      return;
    }

    const folder = this.gui.addFolder('Entry Scene');
    this.addController(folder, this.values, 'entryParticleSize', 0.25, 2.5, 0.01).name('Particle size').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleSizeMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleAlpha', 0, 2, 0.01).name('Particle alpha').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleAlphaMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleSpin', 0, 3, 0.01).name('Particle spin').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleRotationSpeed', value);
    });
    this.addController(folder, this.values, 'entryParticleNoise', 0, 2.5, 0.01).name('Noise').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleNoiseMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleGlow', 0, 2.5, 0.01).name('Initial glow').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleInitialGlowMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleSimSpeed', 0.2, 2.5, 0.01).name('Sim speed').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleSimulationSpeed', value);
    });
    this.addController(folder, this.values, 'entryParticleFlow', 0, 3, 0.01).name('Flow force').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleFlowForceMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleOrig', 0, 3, 0.01).name('Orig force').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleOrigForceMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleSurface', 0, 3, 0.01).name('Surface force').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleSurfaceForceMultiplier', value);
    });
    this.addController(folder, this.values, 'entryParticleFriction', 0.6, 0.999, 0.001).name('Friction').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleFriction', value);
    });
    this.addController(folder, this.values, 'entryParticleInteraction', 0, 2.5, 0.01).name('Interact force').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('particleInteractionForceMultiplier', value);
    });
    this.addController(folder, this.values, 'entryCylinderAlpha', 0, 2, 0.01).name('Cylinder alpha').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('cylinderShellAlphaMultiplier', value);
    });
    this.addController(folder, this.values, 'entryFloorPhaseSpeed', 0, 3, 0.01).name('Floor phase').onChange((value) => {
      this.entryScene?.setEntryDebugSetting?.('floorPhaseSpeed', value);
    });
    this.addController(folder, this.values, 'entryLabelYOffset', -20, 80, 1).name('Label Y').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('labelYOffset', value);
    });
    this.addController(folder, this.values, 'entryLabelTextLift', -24, 40, 1).name('Text lift').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('labelTextLift', value);
    });
    this.addController(folder, this.values, 'entryLabelSpread', 0.6, 1.8, 0.01).name('Label spread').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('labelSpreadMultiplier', value);
    });
    this.addController(folder, this.values, 'entryCurrentLabelScale', 0.6, 1.8, 0.01).name('Current scale').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('currentScaleMultiplier', value);
    });
    this.addController(folder, this.values, 'entryCurrentLabelOpacity', 0, 2, 0.01).name('Current opacity').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('currentOpacityMultiplier', value);
    });
    this.addController(folder, this.values, 'entrySideLabelOpacity', 0, 3, 0.01).name('Side opacity').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('sideOpacityMultiplier', value);
    });
    this.addController(folder, this.values, 'entryVisitYOffset', -140, 20, 1).name('Visit Y').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('visitYOffset', value);
    });
    this.addController(folder, this.values, 'entryVisitOpacity', 0, 1.5, 0.01).name('Visit opacity').onChange((value) => {
      this.webglUi?.setEntryDebugSetting?.('visitOpacityMultiplier', value);
    });
    this.addController(folder, this.actions, 'resetEntryDebug').name('Reset entry debug');
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

    const labelSettings = this.cubesScene?.getLabelDebugSettings?.();
    if (labelSettings) {
      this.values.cubesLabelsScale = labelSettings.textScaleMultiplier;
    }
  }

  syncValuesFromHomeRenderer() {
    const settings = this.homeRenderer?.getTransitionDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.homeChromaticStrength = settings.homeChromaticStrength;
    this.values.homeEdgeSoftness = settings.homeEdgeSoftness;
  }

  syncValuesFromEntryScene() {
    const settings = this.entryScene?.getEntryDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.entryParticleSize = settings.particleSizeMultiplier;
    this.values.entryParticleAlpha = settings.particleAlphaMultiplier;
    this.values.entryParticleSpin = settings.particleRotationSpeed;
    this.values.entryParticleNoise = settings.particleNoiseMultiplier;
    this.values.entryParticleGlow = settings.particleInitialGlowMultiplier;
    this.values.entryParticleSimSpeed = settings.particleSimulationSpeed;
    this.values.entryParticleFlow = settings.particleFlowForceMultiplier;
    this.values.entryParticleOrig = settings.particleOrigForceMultiplier;
    this.values.entryParticleSurface = settings.particleSurfaceForceMultiplier;
    this.values.entryParticleFriction = settings.particleFriction;
    this.values.entryParticleInteraction = settings.particleInteractionForceMultiplier;
    this.values.entryCylinderAlpha = settings.cylinderShellAlphaMultiplier;
    this.values.entryFloorPhaseSpeed = settings.floorPhaseSpeed;
  }

  syncValuesFromWebglUi() {
    const settings = this.webglUi?.getEntryDebugSettings?.();

    if (!settings) {
      return;
    }

    this.values.entryLabelYOffset = settings.labelYOffset;
    this.values.entryLabelTextLift = settings.labelTextLift;
    this.values.entryLabelSpread = settings.labelSpreadMultiplier;
    this.values.entryCurrentLabelScale = settings.currentScaleMultiplier;
    this.values.entryCurrentLabelOpacity = settings.currentOpacityMultiplier;
    this.values.entrySideLabelOpacity = settings.sideOpacityMultiplier;
    this.values.entryVisitYOffset = settings.visitYOffset;
    this.values.entryVisitOpacity = settings.visitOpacityMultiplier;
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
