# Igloo Rebuild 工程架构说明

## 1. 项目定位

`igloo-rebuild` 不是一个普通的营销站点重写工程，而是一个面向 `www.igloo.inc` 线上产物的 clean-room reconstruction workspace。

它的核心目标不是“先把页面画出来”，而是先把原站中高度耦合的运行时逻辑拆成可维护、可理解、可逐步替换的模块化工程。当前版本已经具备比较清晰的运行时骨架：

- 一个统一的 WebGL 引擎层
- 一个中心化的主控制器
- 一套按 section 组织的场景系统
- 一套滚动驱动的首页编排模型
- 一套 route 驱动的 detail overlay 模型
- 两套 UI 实现：DOM HUD 与 WebGL HUD
- 一套内容适配层与资源清单系统

从架构上看，这个工程更接近“单页 3D runtime 应用”，而不是“页面 + 若干 Three.js 特效”。

## 2. 技术栈与总体分层

当前技术栈非常克制：

- 构建工具：Vite
- 语言：Plain JavaScript（ES Module）
- 图形引擎：Three.js
- 调试：`dat.gui`

代码组织大致可以分成 7 层：

```text
src/
  main.js                    启动入口
  core/                      通用基础设施：引擎、路由、事件、资源注册表
  runtime/                   运行时状态机与主控制器
  scenes/                    各 section / detail / UI 场景
  content/                   内容源、适配器、资源清单
  materials/                 自定义材质
  effects/                   场景内效果模块
  ui/                        WebGL UI 的文字/图集能力
  utils/                     数学和几何处理工具
```

对应职责如下：

- `core/` 解决“系统怎么跑起来”
- `runtime/` 解决“当前应该展示什么、怎么切换”
- `scenes/` 解决“某一段内容如何表现”
- `content/` 解决“数据和资源从哪里来、如何被消费”
- `materials/` / `effects/` / `ui/` 解决具体表现实现

## 3. 启动流程

工程的真实启动链路比较清晰，可以概括为：

```text
src/main.js
  -> 创建 DOM shell（canvas 容器 / UI 容器 / boot loader）
  -> 初始化 EventBus / Router / Engine
  -> 创建 SiteController（实际导出的是 MainController）
  -> 监听资源预加载进度，更新 boot loader
  -> controller.init()
       -> AssetRegistry 初始化与预加载
       -> 创建各个 scene
       -> 创建 HomeSceneRenderer / WebGLUiScene / DetailScene
       -> 建立首页与详情页的运行时状态
  -> router.start()
  -> Engine 持续 tick + render
```

这里有两个关键点：

1. `src/controllers/SiteController.js` 只是对 `src/runtime/MainController.js` 的别名导出。
2. `Engine` 不只接受 Three.js `Scene`，也可以接受自定义 `view` 对象，所以首页实际挂进去的是 `HomeSceneRenderer` 这种“组合渲染器”，而不是单一场景。

## 4. 核心基础设施

### 4.1 EventBus

`src/core/EventBus.js` 是一个非常轻量的事件总线，负责：

- 发布 `tick`
- 发布 `resize`
- 发布资源加载事件，如 `assets:progress`

它让 `Engine`、`MainController` 和 UI/调试工具之间可以低耦合通信。

### 4.2 Router

`src/core/Router.js` 提供了一个极简前端路由器，当前只关心两类路径：

- `/`
- `/portfolio/:project`

它负责：

- path 模板编译
- 参数提取
- `pushState` / `replaceState`
- `popstate` 监听

这个路由器本身很薄，真正的业务语义由 `RouteSync` 和 `MainController` 接手。

### 4.3 Engine

`src/core/Engine.js` 是运行时底盘，职责包括：

- 创建 `THREE.WebGLRenderer`
- 管理 resize 与像素比
- 驱动主循环
- 广播 `tick` / `after-render`
- 将当前视图委托给 `view.update()` 与 `view.render()`

它的重要设计点在于“view 抽象”：

- 如果当前 view 是普通场景，就直接 `renderer.render(scene, camera)`
- 如果当前 view 自己实现了 `render()`，就把渲染权交给它

这使得首页可以接入离屏渲染、后处理和多场景混合，而不需要让 `Engine` 本身变复杂。

### 4.4 AssetRegistry

`src/core/AssetRegistry.js` 统一管理资源生命周期，当前支持三类资源：

- `geometry`：Draco 几何
- `texture`：KTX2 纹理、EXR 环境贴图
- `audio`：音频资源路径

它负责：

- 初始化 Draco / KTX2 / EXR loader
- 根据 manifest 进行预加载
- 缓存与并发去重
- 失败记录
- 通过 EventBus 广播进度

资源加载策略是“显式 manifest + runtime cache”，这比把资源路径散落在各个场景里更利于维护和替换。

## 5. 运行时主控层

### 5.1 MainController 的角色

`src/runtime/MainController.js` 是整个工程的中枢。它不直接负责画面细节，而是统一协调：

- 资源预加载
- 首页 section 状态
- 路由状态
- 滚动状态
- 详情页开合状态
- UI 同步
- 音频状态
- 指针交互

可以把它理解为“应用状态机 + 场景调度器”。

它持有的关键子模块包括：

- `RouteSync`
- `HomeSceneStack`
- `ScrollState`
- `DetailTransitionState`
- `AudioController`
- `UIScene`
- `WebGLUiScene`
- `HomeSceneRenderer`
- `DetailScene`

### 5.2 RouteSync

`src/runtime/RouteSync.js` 是对底层 `Router` 的一层业务封装，提供：

- `goHome()`
- `goProject(hash)`
- `replaceHome()`
- 当前路由快照
- 变更订阅

这样控制器就不需要直接关心路径字符串拼接。

### 5.3 ScrollState

`src/runtime/ScrollState.js` 把首页滚动抽象成一个“连续标量状态”，维护：

- `current`
- `target`
- `velocity`
- `min/max`

滚轮和键盘输入并不会直接跳动场景，而是只修改 `target`，再通过 `damp` 渐近到 `current`。这样整个首页 section 切换是平滑的，可供动画和合成 shader 使用。

### 5.4 HomeSceneStack

`src/runtime/HomeSceneStack.js` 负责把首页 section 配置转成统一的滚动坐标系。

每个 section 都有：

- `key`
- `label`
- `height`
- 推导出的 `start/end`

它的核心工作是：

- 根据滚动值定位当前 section
- 计算当前 section 的局部进度
- 计算下一 section 的混合窗口
- 把 `role / progress / enterProgress / exitProgress / blend` 分发给各 scene

这意味着每个 scene 不必自己做 section 编排判断，只需要消费统一的 transition state。

### 5.5 DetailTransitionState

`src/runtime/DetailTransitionState.js` 把“进入详情页”拆成多段进度：

- `overlayProgress`
- `focusProgress`
- `sceneProgress`
- `uiProgress`

这样首页 focus、detail scene 出场、HUD 展示不会共用一根粗糙的进度条，而是能做更细的分层控制。

## 6. 场景系统设计

### 6.1 SceneBase：统一接口

`src/scenes/SceneBase.js` 是所有 Three.js 场景的共同基类。它统一了以下约定：

- `setActive(active)`
- `setProgress(progress)`
- `setTransitionState(state)`
- `setSize(width, height)`
- `update(delta, elapsed)`

它还内置了：

- `root` 组节点
- 默认相机
- 统一的 `progress / active / transitionState`

这让所有 section scene 都能被 `HomeSceneStack` 和 `HomeSceneRenderer` 用统一方式调度。

### 6.2 IglooScene

`src/scenes/IglooScene.js` 负责首页第一段“Manifesto / 冰屋”部分。

主要特征：

- 体量最大，包含大量 shader 和时间轴逻辑
- 管理 igloo shell、地面、山体、雪、烟雾、outline、cage、intro particles
- 内置一套 intro 动画与相机轨迹
- 暴露 `getPresentationState()` 给 UI 使用
- 暴露 color correction / bloom 状态给 renderer 使用
- 支持 pointer hover 影响冰屋表面动画

这一层本质上已经是一个独立的小型演出系统。

### 6.3 CubesScene

`src/scenes/CubesScene.js` 负责首页第二段“Portfolio Stack”。

主要特征：

- 按项目生成 cube stack
- 支持 hover、raycast、点击进入详情
- 使用 `CubeTransmissionMaterial` 做透射材质
- 使用 `MouseFrostMap` 做基于指针的霜冻反馈
- 维护项目 focus / hover / detail handoff
- 暴露 `getDetailAnchor()` 供 detail scene 做镜头接续
- 暴露 `getOverlayPresentation()` 供 WebGL HUD 画框线和文案锚点

这个 scene 的职责不是简单“展示三维模型”，而是承担首页到详情页之间最关键的交互桥梁。

### 6.4 EntryScene

`src/scenes/EntryScene.js` 负责首页第三段“Portal / Outbound Links”。

主要特征：

- 多层 ring、forcefield、plasma、smoke、particles
- 维护一个按 section progress 驱动的完整时序
- 暴露 `getPresentationState()` 给 HUD 使用
- 暴露 `getColorCorrectionState()` 给 renderer 触发 entry 专属后处理

可以理解为首页流程的收束段和出口段。

### 6.5 DetailScene

`src/scenes/DetailScene.js` 负责项目详情层。

主要特征：

- 根据当前 project 动态切换几何、贴图和 staging preset
- 从 `CubesScene` 提供的 anchor 接入，实现首页对象到 detail 对象的 handoff
- 自带背景层、halo、light shaft、light plane、light column、particles、text cylinder
- 所有 detail 视觉都由 `transitionProgress` 统一驱动

它不是独立页面，而是一个被 `HomeSceneRenderer` 叠加进来的 overlay scene。

### 6.6 UIScene 与 WebGLUiScene

当前工程保留了两套 UI：

- `src/scenes/UIScene.js`
  - DOM HUD
  - 负责按钮、项目列表、详情文案、Entry links
  - 也是当前最完整的内容回退层

- `src/scenes/WebGLUiScene.js`
  - WebGL HUD
  - 使用 MSDF 字体与图集
  - 当前主要负责 logo、sound indicator、manifesto 区块、cubes overlay 框线和标题

这是一个非常现实的双轨策略：

- DOM HUD 保证功能完整和调试效率
- WebGL HUD 逐步接管更接近原站风格的部分

## 7. 首页渲染与合成原理

### 7.1 为什么不是直接 render 当前 scene

首页不是“滚到哪就切到哪个场景”，而是一个带有过渡合成的 section stack。

所以实际渲染不是：

```text
currentScene -> screen
```

而是更接近：

```text
sceneA/current
sceneB/next
detailScene
cubesScene
overlayScene(WebGL UI)
  -> post / composite / bloom
  -> screen
```

### 7.2 HomeSceneRenderer 的职责

`src/runtime/HomeSceneRenderer.js` 是首页真实的渲染编排器。

它负责：

- 维护多个离屏 `RenderTarget`
- 分别渲染 current scene / next scene / detail scene / cubes scene
- 做场景级 color correction
- 做首页 section 过渡 shader 混合
- 做 detail overlay 混合
- 对特定 section 应用 LUT、entry post、bloom
- 最后再叠加 `WebGLUiScene`

它之所以单独存在，是因为首页的“切换逻辑”和“场景内部动画逻辑”是两件不同的事：

- scene 关心自己怎么动
- renderer 关心多个 scene 怎么合到一张图上

### 7.3 典型渲染流程

单帧渲染过程大致如下：

1. `MainController` 根据滚动与路由计算 `renderState`
2. `HomeSceneRenderer.update()` 更新当前 scene、next scene、detail scene 和 cubes scene
3. `prepareForRender()` 允许某些 scene 先做离屏准备
4. 分别把多个 scene 渲染到不同 render target
5. 对当前或下一 scene 应用颜色校正
6. 在 composite shader 中根据 `blend`、`detailProgress`、蓝噪声、scroll data、frost data 做全屏合成
7. 按需要做 bloom
8. 最后叠加 WebGL UI

这套结构是当前工程最核心的“运行时价值”之一，因为它把原始 bundle 中纠缠在一起的 section 合成逻辑拆成了可维护模块。

## 8. 内容层与数据流

### 8.1 内容来源

内容层当前走的是：

```text
rawBe -> adaptBeToSiteContent -> siteContent
```

对应文件：

- `src/content/raw/be.js`
- `src/content/adapters/beToSiteContent.js`
- `src/content/siteContent.js`

### 8.2 设计意图

这层适配器的作用不是简单重命名字段，而是把原始 dump 数据变成运行时更稳定的“消费模型”。

例如它会产出：

- `sections`
- `projects`
- `links`
- `social`
- `audio`

其中 `projects` 会被进一步归一成 scene 更容易消费的字段，如：

- cube surface 资源 key
- detail geometry / texture key
- accent 色
- detail summary / social / links

这样场景层不需要直接理解原始 `Be` 结构。

## 9. 资源组织方式

`src/content/assetManifest.js` 是资源组织中心，按功能分组：

- `geometry`
- `texture`
- `audio`

每个 entry 通常包含：

- `section`
- `key`
- `source`
- 可选的 loader 配置

例如：

- Draco attribute 映射
- KTX2 colorSpace / wrap / filter / repeat
- EXR 作为环境贴图

这种 manifest 驱动方式有几个好处：

- 场景层只依赖语义 key，不硬编码资源路径
- 资源替换更集中
- 资源预加载与失败统计更容易做
- 便于区分“内容模型”和“资源模型”

## 10. 交互与状态流

### 10.1 首页滚动

首页滚动的基本流程是：

```text
wheel / keyboard
  -> ScrollState.target 变化
  -> ScrollState.step() 平滑逼近
  -> HomeSceneStack.sync()
  -> MainController.syncHomeScene()
  -> HomeSceneRenderer.setRenderState()
  -> UIScene / WebGLUiScene 同步
```

此外 `MainController` 还实现了：

- scroll idle 后自动居中
- section 切换后的自动吸附
- 进入 detail 前的首页滚动快照保存

### 10.2 项目详情切换

项目点击后的逻辑是：

```text
pointer hit cubes
  -> openProject(hash)
  -> routeSync.goProject(hash)
  -> onRouteChange(project)
  -> currentProject 设定
  -> CubesScene 对焦
  -> DetailScene.setProject()
  -> DetailTransitionState.open()
  -> HomeSceneRenderer 开始混合 detail
  -> UIScene 延迟展示详情文案
```

返回首页时则反向执行，并恢复进入详情前的首页 scroll snapshot。

### 10.3 指针交互

交互并不是全局开启的，而是由 `MainController.isCubesInteractive()` 决定：

- 必须处于首页
- 必须当前 section 是 `cubes`
- detail 不能正在开合

这样可以避免不同 section 的 hover / click 逻辑互相干扰。

## 11. 音频实现原理

`src/runtime/AudioController.js` 使用的是“状态驱动混音”思路，而不是“场景里随手 new Audio”。

它负责：

- 初始化 loop / one-shot track
- 用户手势解锁音频
- 页面隐藏时暂停
- 根据 route、section、detail progress 自动计算 mix
- 对 loop 轨做平滑淡入淡出
- 对 one-shot 轨做即时触发

当前默认关注的轨道包括：

- `music-bg`
- `room-bg`
- `manifesto`
- `click-project`

它的关键价值在于把音频也纳入了统一状态机，而不是做成散乱副作用。

## 12. UI 策略

当前 UI 并不是最终态，但策略是合理的：

- `UIScene` 保证功能和内容完整
- `WebGLUiScene` 承担更高保真视觉
- `MainController.syncUi()` 同时驱动两者

这意味着未来可以逐步把 DOM HUD 上的能力迁到 WebGL HUD，而不需要一次性重写所有 UI。

这也是整个工程“先对齐结构，再对齐表现”的体现。

## 13. 当前架构的几个关键设计原则

### 13.1 中心化调度

所有重要状态都汇总在 `MainController`，而不是散落在 scene 内部。这样 route、scroll、detail、audio、UI 可以保持一致。

### 13.2 场景职责单一

scene 只负责“这一段怎么表现”，section 编排和渲染合成不交给 scene 自己处理。

### 13.3 内容驱动

section 配置、项目数据、资源键值都在内容层集中整理，scene 尽量消费结构化数据而不是依赖硬编码。

### 13.4 渲染编排与场景实现分离

`HomeSceneRenderer` 负责“怎么合成”，各 scene 负责“各自怎么更新”。这让复杂过渡不会污染具体场景代码。

### 13.5 渐进式还原

DOM HUD、WebGL HUD、placeholder/fallback geometry、staging preset 并存，说明这个工程不是一次性追求 1:1，而是允许逐步接近原站。

## 14. 如何继续扩展这个工程

如果后续要继续扩展，建议遵循当前架构的自然方向：

### 14.1 新增首页 section

一般需要同时修改：

- `content` 中的 `sections`
- 新建一个 scene
- 在 `MainController.init()` 注册 scene
- 在 `HomeSceneRenderer` 中让它参与首页渲染
- 视需要补 UI presentation 输出

### 14.2 新增项目

优先改内容层：

- `rawBe`
- `beToSiteContent`
- 对应资源 key 与 `assetManifest`

只要内容模型齐全，`CubesScene` 与 `DetailScene` 会尽可能复用现有机制消费它。

### 14.3 新增视觉效果

优先判断它属于哪一层：

- scene 内部特效：放进对应 `Scene`
- 通用材质：放进 `materials/`
- 交互效果：放进 `effects/`
- 全屏过渡：放进 `HomeSceneRenderer`

不要把新的全局逻辑直接堆回 `MainController`。

## 15. 总结

`igloo-rebuild` 当前的真实架构可以概括成一句话：

> 一个以 `MainController` 为中心、以 `HomeSceneRenderer` 为合成核心、以 `SceneBase` 为统一接口、以 `siteContent + assetManifest` 为数据基础的 3D 单页运行时工程。

它已经不是“把 dump 拆开看看”的阶段，而是进入了“可继续演进的运行时框架”阶段。后续无论是继续补原站表现、重做 WebGL UI、替换 shader，还是把更多 dump 逻辑迁入模块，都已经有了比较稳的落点。
