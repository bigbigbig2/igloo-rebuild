import * as THREE from 'three';

/**
 * SceneBase 是所有 3D 场景的统一基类。
 *
 * 它把首页 section scene 与 detail scene 共享的公共约定收敛到一起：
 * - name: 场景标识
 * - progress: 当前 section 内部进度
 * - active: 当前场景是否处于参与渲染的状态
 * - transitionState: 当前 / 下一 section 切换时的角色信息
 * - camera: 每个 scene 自带一台主相机
 * - root: 统一的内容根节点，子类通常把可视对象挂在这里
 *
 * 这样 HomeSceneStack 和 HomeSceneRenderer 就可以用统一接口驱动所有 scene。
 */
export class SceneBase extends THREE.Scene {
  constructor({
    name,
    background = '#0a1119',
    cameraType = 'perspective'
  }) {
    super();

    this.name = name;
    // progress 一般由 HomeSceneStack 注入，表示场景在本 section 中的局部进度。
    this.progress = 0;
    this.active = false;
    // transitionState 用于描述 section 交接关系。
    // 例如当前 scene 是 current、next 还是 inactive。
    this.transitionState = {
      role: 'inactive',
      sectionKey: name,
      currentKey: null,
      previousKey: null,
      nextKey: null,
      blend: 0,
      enterProgress: 0,
      exitProgress: 0,
      isTransitioning: false
    };
    // 子类通常只操作 root，而不是直接往 scene 顶层不停 add 对象。
    this.root = new THREE.Group();
    this.add(this.root);
    this.background = new THREE.Color(background);

    // 首页大部分场景使用透视相机，少数纯屏幕空间场景会用正交相机。
    if (cameraType === 'orthographic') {
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      this.camera.position.set(0, 0, 10);
    } else {
      this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
      this.camera.position.set(0, 0, 8);
    }
  }

  setActive(active) {
    // active 只表示“此场景是否应参与当前阶段渲染”，
    // 并不等同于是否可见或是否有内容。
    this.active = active;
  }

  setProgress(progress) {
    this.progress = progress;
  }

  setTransitionState(transitionState = {}) {
    // 外部可以只更新部分字段，这里统一做增量合并。
    this.transitionState = {
      ...this.transitionState,
      ...transitionState
    };
  }

  setSize(width, height) {
    // 子类若有额外布局逻辑，可在 super.setSize() 后继续扩展。
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = width / height;
    } else {
      const aspect = width / height;
      this.camera.left = -aspect;
      this.camera.right = aspect;
      this.camera.top = 1;
      this.camera.bottom = -1;
    }

    this.camera.updateProjectionMatrix();
  }

  // 默认空实现，子类按需覆盖。
  update() {}
}
