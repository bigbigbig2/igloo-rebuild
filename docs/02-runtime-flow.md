# 运行时流程

这份文档描述“应用是怎么跑起来的”，重点覆盖：

- 启动阶段
- 资源预加载
- 首页滚动编排
- route 到 detail 的切换
- 每帧更新与渲染
- 输入与音频链路

## 1. 启动流程

### 1.1 `src/main.js`

`main.js` 做 6 件事：

1. 引入全局样式 `style.css`
2. 创建 app shell：
   - canvas 容器
   - DOM overlay 容器
   - boot loader
3. 创建基础单例：
   - `EventBus`
   - `Router`
   - `Engine`
   - `SiteController`
4. 绑定资产预加载提示文字
5. 调用 `controller.init()`
6. 初始化成功后：
   - 创建 `AudioDebugGui`
   - 隐藏 boot loader
   - 启动 router

## 2. 控制器初始化

### 2.1 `SiteController`

`src/controllers/SiteController.js` 只是一个别名导出：

- `SiteController = MainController`

真正的逻辑都在 `src/runtime/MainController.js`。

### 2.2 `MainController.init()`

初始化顺序大致是：

1. `AssetRegistry.init(renderer)`
2. `AssetRegistry.preload(['geometry', 'texture'])`
3. 创建首页 3 个 section scene：
   - `IglooScene`
   - `CubesScene`
   - `EntryScene`
4. 注入给 `HomeSceneStack`
5. 创建 `HomeSceneRenderer`
6. 创建 `WebGLUiScene`
7. 创建 `DetailScene`
8. 首次同步 home state、audio state、UI state

## 3. 首页滚动链

首页滚动不直接由浏览器滚动容器驱动，而是由一套独立状态链驱动。

### 3.1 `ScrollState`

职责：

- 保存 `current / target / velocity`
- 支持平滑阻尼滚动
- 支持自动吸附动画
- 支持循环 wrap

当前首页已经启用了 `wrap: true`，所以滚到 `entry` 尾部可以继续回到第一个 scene。

### 3.2 `HomeSceneStack`

职责：

- 根据 `sections` 生成整条首页滚动轴的 metric
- 把滚动值映射到：
  - 当前 section
  - 当前 local progress
  - 下一个 section
  - 两者之间的 blend
- 把这些结果写回每个 scene：
  - `setActive`
  - `setProgress`
  - `setTransitionState`

### 3.3 `MainController.syncHomeScene()`

这个方法是首页编排核心：

1. 从 `ScrollState.current` 取得当前位置
2. 调用 `HomeSceneStack.sync()`
3. 拿到：
   - 当前 scene
   - next scene
   - blend
   - 当前 section key
4. 把这些喂给 `HomeSceneRenderer`
5. 同步 UI

## 4. 每帧更新链

### 4.1 `Engine.loop()`

每帧顺序：

1. 从 `THREE.Clock` 计算 `delta / elapsed`
2. 组装 `frameState`
3. `bus.emit('tick', frameState)`
4. 调用当前 `view.update(delta, elapsed, frameState)`
5. 调用当前 `view.render(renderer, frameState)`
6. `bus.emit('after-render', frameState)`
7. `requestAnimationFrame(loop)`

### 4.2 当前 view 是什么

首页状态下：

- `Engine.view = HomeSceneRenderer`

所以引擎不会直接 `renderer.render(scene, camera)` 首页 scene，
而是交给 `HomeSceneRenderer` 完成离屏渲染和合成。

## 5. 首页渲染链

### 5.1 `HomeSceneRenderer.update()`

它会按当前 render state 更新：

- current scene
- next scene
- detail scene
- cubes scene
- overlay scene (`WebGLUiScene`)

### 5.2 `HomeSceneRenderer.render()`

典型流程：

1. 离屏渲染 current scene 到 `renderTargetA`
2. 离屏渲染 next scene 到 `renderTargetB`
3. 离屏渲染 detail scene 到 `renderTargetDetail`
4. 离屏渲染 cubes scene 到 `renderTargetCubes`
5. 根据 scene profile 做颜色校正 / entry post
6. 在 composite pass 中混合 home transition 和 detail overlay
7. 视情况叠加 bloom
8. 最后叠加 `WebGLUiScene`

### 5.3 Scene profile

目前有三种主要 profile：

- `igloo`
  使用 3D LUT 校色
- `cubes`
  使用 cubes LUT
- `entry`
  使用独立的 portal post shader

## 6. Route 与 detail 切换

### 6.1 `Router`

负责最小路由匹配：

- `/`
- `/portfolio/:project`

### 6.2 `RouteSync`

把底层 router 包装成更适合业务消费的接口：

- `goHome()`
- `goProject(hash)`
- `replaceHome()`
- `onChange(listener)`

### 6.3 `DetailTransitionState`

维护一条总进度 `progress`，并从中派生 4 条子进度：

- `overlayProgress`
- `focusProgress`
- `sceneProgress`
- `uiProgress`

这样不同层可以共享同一条 detail 过渡，但起效时间不同。

### 6.4 `MainController.onRouteChange()`

进入 project 时：

1. 根据 hash 找项目
2. 记录首页 scroll snapshot
3. 如果当前不在 `cubes`，先跳到 `cubes`
4. `detailScene.setProject(project)`
5. `detailTransition.open()`

返回首页时：

1. 播放离开音效
2. 恢复之前记录的首页 scroll
3. `detailTransition.close()`

## 7. 输入链

### 7.1 Wheel / Keyboard

首页下：

- `wheel` 调用 `scrollState.nudge(...)`
- `ArrowUp / ArrowDown / PageUp / PageDown` 同样推动滚动

### 7.2 Pointer

pointer 事件会同时分发给多个 scene：

- `IglooScene`
  hover 响应
- `CubesScene`
  项目 pick / hover
- `EntryScene`
  volume 粒子交互

### 7.3 DOM HUD 交互

`UIScene.bind()` 把 DOM HUD 的行为回注到 `MainController`：

- home / prev / next
- project click
- entry preview / select / visit / cycle

## 8. UI 同步链

### 8.1 `MainController.syncUi()`

统一生成一份 `uiState`，再同时喂给：

- `UIScene`
- `WebGLUiScene`

其中：

- `UIScene` 偏功能
- `WebGLUiScene` 偏视觉

### 8.2 为什么要双写

原因是当前阶段仍在迁移中：

- WebGL HUD 还原度更高
- DOM HUD 功能更完整

主控制器负责保证它们始终消费同一份状态。

## 9. 音频链

### 9.1 `AudioController`

职责：

- 维护 loop / one-shot 音轨
- 处理 muted / master volume
- 跟随首页 section / detail 状态自动混音
- 暴露 `setTrackTargetMix()` 给具体 scene

### 9.2 目前的主要音轨

- `music-bg`
- `room-bg`
- `shard`
- `particles`
- UI / detail / project one-shot

### 9.3 scene 对音频的影响

- `CubesScene` 输出 shard mix
- `EntryScene` 输出 particles mix
- `MainController` 每帧把这些 mix 推给 `AudioController`

## 10. 一条完整链路示例

以“首页滚到 entry 并点击底部 link”为例：

1. 用户滚轮输入
2. `ScrollState.target` 改变
3. `Engine.loop()` 驱动 `ScrollState.step()`
4. `HomeSceneStack.sync()` 把滚动值映射成 `entry` section progress
5. `EntryScene.update()` 根据 progress 更新 portal / room / particles
6. `HomeSceneRenderer.render()` 合成 entry 与 HUD
7. 用户点击底部 link
8. `UIScene` 或 `WebGLUiScene` 命中层回调到 `MainController`
9. `MainController.activateEntryLink()` 更新 `EntryScene.activeLinkIndex`
10. `EntryVolumeParticles.setVolume()` 切换 volume 形体
11. `AudioController` 播放 UI 声音并更新 particles mix

## 11. 维护时最常见的入口点

想改启动逻辑：

- `src/main.js`

想改滚动 / section 编排：

- `src/runtime/ScrollState.js`
- `src/runtime/HomeSceneStack.js`
- `src/runtime/MainController.js`

想改首页合成：

- `src/runtime/HomeSceneRenderer.js`

想改 route / detail 打开关闭：

- `src/runtime/RouteSync.js`
- `src/runtime/DetailTransitionState.js`
- `src/runtime/MainController.js`
