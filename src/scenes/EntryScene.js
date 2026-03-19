import * as THREE from 'three';
import { SceneBase } from './SceneBase.js';
import { buildEntryScene } from './entry/buildScene.js';
import { computePresentationState, updateEntryScene } from './entry/choreography.js';

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
    this.postState = {
      ringProximity: 0,
      squareAttr: new THREE.Vector3(0, 0, 1)
    };
    this.lastProgress = 0;
    this.direction = 1;

    buildEntryScene(this, { assets, links });
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

  setActiveLinkIndex(index, { burstNoise = 1 } = {}) {
    if (!Number.isFinite(index) || this.links.length <= 0) {
      return false;
    }

    const nextIndex = THREE.MathUtils.clamp(Math.round(index), 0, this.links.length - 1);
    if (nextIndex === this.activeLinkIndex) {
      return false;
    }

    this.activeLinkIndex = nextIndex;
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
