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
  constructor({ assets }) {
    super({ name: 'entry', background: '#d4dae4' });

    this.assets = assets;
    this.resolution = new THREE.Vector2(1, 1);
    this.portalRings = [];
    this.forcefields = [];
    this.plasmaLayers = [];
    this.smokeTrails = [];
    this.materials = [];
    this.initialScrollAutocenter = 0.2;
    this.finalScrollAutocenter = 0.76;
    this.presentationState = computePresentationState(0, 1);
    this.postState = {
      ringProximity: 0,
      squareAttr: new THREE.Vector3(0, 0, 1)
    };
    this.lastProgress = 0;
    this.direction = 1;

    buildEntryScene(this, { assets });
  }

  computePresentationState(progress = this.progress, enterProgress = 1) {
    return computePresentationState(progress, enterProgress);
  }

  getPresentationState() {
    return { ...this.presentationState };
  }

  getColorCorrectionState() {
    return {
      profile: 'entry',
      ringProximity: this.postState.ringProximity,
      squareAttr: this.postState.squareAttr,
      bloomStrength: 0.9,
      bloomRadius: 0.85,
      bloomThreshold: 0
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
}
