import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { buildEntryScene } from './entry/buildScene.js';
import { computePresentationState, updateEntryScene } from './entry/choreography.js';

const DEFAULT_ENTRY_DEBUG_SETTINGS = Object.freeze({
  particleSizeMultiplier: 1,
  particleAlphaMultiplier: 1,
  particleRotationSpeed: 1,
  particleNoiseMultiplier: 1,
  particleInitialGlowMultiplier: 1,
  particleSimulationSpeed: 1,
  particleFlowForceMultiplier: 1,
  particleOrigForceMultiplier: 1,
  particleSurfaceForceMultiplier: 1,
  particleFriction: 0.9,
  particleInteractionForceMultiplier: 1,
  cylinderShellAlphaMultiplier: 1,
  floorPhaseSpeed: 1
});

/**
 * EntryScene 是首页最后一段的 portal / outbound links 场景。
 *
 * Phase 1 重构后的职责尽量收敛为“编排器”：
 * - 本类只保留状态、统一对外接口、scene 级生命周期
 * - 几何 / 材质创建交给 `entry/buildScene`
 * - 时序 / 相机 / reveal 编排交给 `entry/choreography`
 *
 * 这样后续继续迁移原版的 volume particles、交互 UI、音频联动时，
 * 不需要再在一个超大文件里硬塞更多逻辑。
 */
export class EntryScene extends SceneBase {
  constructor({ assets, links = [] }) {
    super({ name: 'entry', background: '#09070e' });

    this.assets = assets;
    this.links = links;
    this.resolution = new THREE.Vector2(1, 1);
    this.portalRings = [];
    this.forcefields = [];
    this.plasmaLayers = [];
    this.smokeTrails = [];
    this.materials = [];
    this.initialScrollAutocenter = 0.2;
    this.finalScrollAutocenter = 0.76;
    this.presentationState = computePresentationState(0, 1);
    this.activeLinkIndex = 0;
    this.autoLinkIndex = 0;
    this.previewLinkIndex = null;
    this.linkInteractionEnabled = false;
    this.audioState = {
      particlesMix: 0,
      interactionEnabled: false,
      interactionForce: 0
    };
    this.pointerNdc = new THREE.Vector2();
    this.pointerActive = false;
    this.pointerRaycaster = new THREE.Raycaster();
    this.pointerPlane = new THREE.Plane();
    this.pointerPlaneNormal = new THREE.Vector3(0, 0, 1);
    this.pointerPlanePoint = new THREE.Vector3(0, -9.785, 0);
    this.pointerIntersection = new THREE.Vector3(0, -9.785, 0);
    this.pointerLocal = new THREE.Vector3();
    this.pointerLocalTarget = new THREE.Vector3();
    this.pointerLocalPrevious = new THREE.Vector3();
    this.pointerLocalDelta = new THREE.Vector3();
    this.pointerVelocity = 0;
    this.pointerInfluence = 0;
    this.postState = {
      ringProximity: 0,
      squareAttr: new THREE.Vector3(0, 0, 1)
    };
    this.floorAdditionalTime = 0;
    this.floorAdditionalTimeTarget = 0;
    this.lastProgress = 0;
    this.direction = 1;
    this.entryDebugSettings = { ...DEFAULT_ENTRY_DEBUG_SETTINGS };

    buildEntryScene(this, { assets, links });
    this.applyParticleDebugSettings();
  }

  computePresentationState(progress = this.progress, enterProgress = 1) {
    return computePresentationState(progress, enterProgress);
  }

  getPresentationState() {
    return {
      ...this.presentationState,
      interactionEnabled: this.linkInteractionEnabled,
      activeLinkIndex: this.activeLinkIndex,
      activeLink: this.links[this.activeLinkIndex] ?? null
    };
  }

  getAudioState() {
    return this.audioState;
  }

  getColorCorrectionState() {
    return {
      profile: 'entry',
      ringProximity: this.postState.ringProximity,
      squareAttr: this.postState.squareAttr,
      bloomStrength: 0.16,
      bloomRadius: 0.6,
      bloomThreshold: 0.72
    };
  }

  getInitialAutoCenterProgress() {
    return this.initialScrollAutocenter;
  }

  getFinalAutoCenterProgress() {
    return this.finalScrollAutocenter;
  }

  getAutoCenterProgress() {
    return this.progress;
  }

  getEntryDebugSettings() {
    return { ...this.entryDebugSettings };
  }

  applyParticleDebugSettings() {
    if (!this.particles?.setDebugSetting) {
      return;
    }

    const particleSettingsMap = {
      particleSimulationSpeed: 'simulationSpeed',
      particleFlowForceMultiplier: 'flowForceMultiplier',
      particleOrigForceMultiplier: 'origForceMultiplier',
      particleSurfaceForceMultiplier: 'surfaceForceMultiplier',
      particleFriction: 'friction',
      particleInteractionForceMultiplier: 'interactionForceMultiplier'
    };

    Object.entries(particleSettingsMap).forEach(([sceneKey, particleKey]) => {
      this.particles.setDebugSetting(particleKey, this.entryDebugSettings[sceneKey]);
    });
  }

  setEntryDebugSetting(key, value) {
    if (!(key in this.entryDebugSettings) || !Number.isFinite(value)) {
      return;
    }

    this.entryDebugSettings[key] = value;
    this.applyParticleDebugSettings();
  }

  resetEntryDebugSettings() {
    this.entryDebugSettings = { ...DEFAULT_ENTRY_DEBUG_SETTINGS };
    this.applyParticleDebugSettings();
  }

  setSize(width, height) {
    super.setSize(width, height);
    this.resolution.set(width, height);
    this.camera.zoom = Math.min(1, (width / Math.max(height, 1)) * 1.5);
    this.camera.updateProjectionMatrix();

    this.materials.forEach((material) => {
      if (material.uniforms?.uResolution) {
        material.uniforms.uResolution.value.copy(this.resolution);
      }
    });
  }

  update(delta, elapsed) {
    updateEntryScene(this, delta, elapsed);
  }

  prepareForRender(renderer) {
    this.particles?.prewarm?.(renderer, this.active ? 10 : 4);
  }

  setPointer(pointer = null) {
    if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
      this.pointerNdc.set(pointer.x, pointer.y);
      this.pointerActive = true;
      return;
    }

    this.pointerActive = false;
  }

  updatePointerInteraction(delta, interactionForce = 0) {
    const safeDelta = THREE.MathUtils.clamp(delta, 1 / 240, 1 / 20);
    const particleField = this.particles;

    if (!particleField?.isVolumeParticleField || !particleField.visible || interactionForce <= 0.001) {
      this.pointerLocalTarget.set(0, 0, 0);
      this.pointerLocal.lerp(this.pointerLocalTarget, 1 - Math.exp(-safeDelta * 8));
      this.pointerLocalDelta.set(0, 0, 0);
      this.pointerVelocity = THREE.MathUtils.lerp(
        this.pointerVelocity,
        0,
        1 - Math.exp(-safeDelta * 8)
      );
      this.pointerInfluence = THREE.MathUtils.lerp(
        this.pointerInfluence,
        0,
        1 - Math.exp(-safeDelta * 8)
      );
      particleField.setInteraction?.({
        point: this.pointerLocal,
        delta: this.pointerLocalDelta,
        force: this.pointerInfluence
      });
      return;
    }

    this.pointerInfluence = THREE.MathUtils.lerp(
      this.pointerInfluence,
      this.pointerActive ? interactionForce : 0,
      1 - Math.exp(-safeDelta * 10)
    );

    if (this.pointerActive) {
      this.pointerRaycaster.setFromCamera(this.pointerNdc, this.camera);
      this.camera.getWorldDirection(this.pointerPlaneNormal);
      particleField.getWorldPosition(this.pointerPlanePoint);
      this.pointerPlane.setFromNormalAndCoplanarPoint(
        this.pointerPlaneNormal,
        this.pointerPlanePoint
      );

      if (!this.pointerRaycaster.ray.intersectPlane(this.pointerPlane, this.pointerIntersection)) {
        this.pointerIntersection.copy(this.pointerPlanePoint);
      }

      this.pointerLocalTarget.copy(this.pointerIntersection);
      particleField.worldToLocal(this.pointerLocalTarget);

      const localLength = this.pointerLocalTarget.length();
      if (localLength > 0.38) {
        this.pointerLocalTarget.multiplyScalar(0.38 / localLength);
      }
    } else {
      this.pointerLocalTarget.set(0, 0, 0);
    }

    this.pointerLocal.lerp(
      this.pointerLocalTarget,
      1 - Math.exp(-safeDelta * (this.pointerActive ? 14 : 8))
    );

    this.pointerLocalDelta.copy(this.pointerLocal).sub(this.pointerLocalPrevious);
    const velocityTarget = THREE.MathUtils.clamp(
      (this.pointerLocalDelta.length() / safeDelta) * 0.8,
      0,
      1
    ) * this.pointerInfluence;

    this.pointerVelocity = THREE.MathUtils.lerp(
      this.pointerVelocity,
      velocityTarget,
      1 - Math.exp(-safeDelta * 12)
    );
    this.pointerLocalPrevious.copy(this.pointerLocal);

    particleField.setInteraction?.({
      point: this.pointerLocal,
      delta: this.pointerLocalDelta,
      force: this.pointerInfluence
    });
  }

  getLinkStepDirection(fromIndex, toIndex) {
    if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex) || this.links.length <= 1) {
      return 0;
    }

    const length = this.links.length;
    const forward = (toIndex - fromIndex + length) % length;
    const backward = (fromIndex - toIndex + length) % length;

    if (forward === 0) {
      return 0;
    }

    return forward <= backward ? 1 : -1;
  }

  nudgeFloorPhase(direction) {
    if (!direction) {
      return;
    }

    this.floorAdditionalTimeTarget += 4 * -direction;
  }

  setActiveLinkIndex(index, { burstNoise = 1 } = {}) {
    if (!Number.isFinite(index) || this.links.length <= 0) {
      return false;
    }

    const nextIndex = THREE.MathUtils.clamp(Math.round(index), 0, this.links.length - 1);
    if (nextIndex === this.activeLinkIndex) {
      return false;
    }

    const previousIndex = this.activeLinkIndex;
    const direction = this.getLinkStepDirection(previousIndex, nextIndex);
    this.activeLinkIndex = nextIndex;
    this.nudgeFloorPhase(direction);
    this.particles?.setVolume?.(nextIndex, { burstNoise });
    return true;
  }

  setAutoLinkIndex(index, { burstNoise = 1 } = {}) {
    if (!Number.isFinite(index) || this.links.length <= 0) {
      return false;
    }

    this.autoLinkIndex = THREE.MathUtils.clamp(Math.round(index), 0, this.links.length - 1);

    if (this.previewLinkIndex != null) {
      return false;
    }

    return this.setActiveLinkIndex(this.autoLinkIndex, { burstNoise });
  }

  previewLink(index, { burstNoise = 1 } = {}) {
    if (!this.linkInteractionEnabled || !Number.isFinite(index) || this.links.length <= 0) {
      return false;
    }

    const nextIndex = THREE.MathUtils.clamp(Math.round(index), 0, this.links.length - 1);
    const previewChanged = this.previewLinkIndex !== nextIndex;
    this.previewLinkIndex = nextIndex;
    const activeChanged = this.setActiveLinkIndex(nextIndex, { burstNoise });
    return previewChanged || activeChanged;
  }

  clearPreviewLink({ burstNoise = 0.35 } = {}) {
    if (this.previewLinkIndex == null) {
      return false;
    }

    this.previewLinkIndex = null;
    return this.setActiveLinkIndex(this.autoLinkIndex, { burstNoise });
  }

  setLinkInteractionEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    const changed = nextEnabled !== this.linkInteractionEnabled;

    if (!nextEnabled && this.previewLinkIndex != null) {
      this.previewLinkIndex = null;
      this.setActiveLinkIndex(this.autoLinkIndex, { burstNoise: 0.3 });
    }

    this.linkInteractionEnabled = nextEnabled;
    return changed;
  }
}
