# 源码索引

这份文档是整个 `src/` 目录的快速索引。
每个条目只回答一个问题：这个文件主要负责什么。

## 1. 应用入口与总控制器

`src/main.js`
- 应用启动入口。
- 创建 engine、controller，并在启动阶段挂载调试面板。

`src/controllers/SiteController.js`
- `MainController` 的别名或转发层。
- 主要用于保持外部入口命名稳定。

## 2. 核心基础设施

`src/core/Engine.js`
- 统一管理 Three.js renderer、尺寸更新、pixel ratio 和主帧循环。

`src/core/EventBus.js`
- 轻量事件总线，用于模块间解耦通信。

`src/core/Router.js`
- 最小路由器。
- 负责首页与 detail 路由切换。

`src/core/AssetRegistry.js`
- 统一资源注册、加载、缓存与查询入口。
- 管理几何、纹理、环境贴图等资源。

## 3. 运行时编排层

`src/runtime/MainController.js`
- 运行时总调度器。
- 统一编排资源、scene、HUD、路由、滚动、detail 过渡和音频。
- 当前已把一部分输入、路由、UI 同步职责下沉给 `coordinators/`。

`src/runtime/ScrollState.js`
- 存储首页滚动的 current、target、velocity 等状态。

`src/runtime/RouteSync.js`
- 在 `Router` 之上包一层更贴近业务的导航接口。

`src/runtime/HomeSceneStack.js`
- 把首页 section 编排成一条连续滚动轴。
- 负责计算 section-local progress。

`src/runtime/HomeSceneRenderer.js`
- 合成首页多个 scene、过渡特效和 overlay scene。

`src/runtime/DetailTransitionState.js`
- 管理首页进入 detail、以及从 detail 返回首页时的分段过渡进度。
- 当前由 GSAP 驱动离散开合补间。

`src/runtime/AudioController.js`
- 管理播放、静音和运行时音频混音状态。
- 当前底层播放已切到 Howler，保留运行时混音接口不变。

`src/runtime/coordinators/HomeScrollCoordinator.js`
- 承接首页滚动输入、自动居中与键盘/滚轮交互。

`src/runtime/coordinators/PointerCoordinator.js`
- 承接 pointer 命中、hover project 与点击 project 的逻辑。

`src/runtime/coordinators/RouteCoordinator.js`
- 承接首页与 detail 路由切换、项目打开与返回首页的协同逻辑。

`src/runtime/coordinators/UiSyncCoordinator.js`
- 统一构建 `uiState`，并同步给 `UIScene` 与 `WebGLUiScene`。

`src/runtime/coordinators/EntryInteractionCoordinator.js`
- 承接 entry section 的预览、选中、访问和轮换外链逻辑。

`src/runtime/coordinators/HomeSceneCoordinator.js`
- 承接首页 scene 状态同步与 `HomeSceneRenderer` render state 注入。

`src/runtime/coordinators/FrameCoordinator.js`
- 承接每帧 runtime 编排，包括 detail handoff、音频更新和 detail 收尾。

## 4. 内容层

`src/content/siteContent.js`
- 对外暴露标准化后的内容对象。

`src/content/assetManifest.js`
- 资源清单声明。
- 负责按类型和用途组织资源引用。

`src/content/raw/be.js`
- 从原站提取并重建出的原始内容数据块。

`src/content/adapters/beToSiteContent.js`
- 把原始数据适配成当前工程统一使用的内容结构。

## 5. 顶层 Scene

`src/scenes/SceneBase.js`
- 所有 3D scene 的共同基类。
- 统一相机、尺寸、progress、active 等基础接口。

`src/scenes/IglooScene.js`
- 首页第一个主 scene。
- 负责 intro 环境、地形 reveal、山体、igloo 主体和相关表现状态。

`src/scenes/CubesScene.js`
- 首页第二个主 scene。
- 负责项目堆栈、标签、背景氛围层和 cubes 展示状态。

`src/scenes/EntryScene.js`
- 首页第三个主 scene。
- 负责 portal 到 room 的切换、entry 粒子、entry 交互与 link 展示状态。

`src/scenes/DetailScene.js`
- 路由驱动的详情 overlay scene。
- 用于首页主滚动之外的项目详情展示。

`src/scenes/UIScene.js`
- DOM HUD 层。
- 负责功能完整的 UI 与 fallback 交互。

`src/scenes/WebGLUiScene.js`
- WebGL HUD overlay scene。
- 负责更高保真的 HUD 表现与场内标签。

## 6. Entry Scene 子模块

`src/scenes/entry/buildScene.js`
- 搭建 `EntryScene` 的对象树、几何体、材质与挂载关系。

`src/scenes/entry/choreography.js`
- 管理 entry 的时间线、相机轨迹、reveal 节奏和 room 切换逻辑。

`src/scenes/entry/constants.js`
- 存放 entry 相关共享常量与时间配置。

`src/scenes/entry/materials.js`
- 负责 entry scene 使用的材质与 shader factory。

`src/scenes/entry/utils.js`
- 负责 entry 场景内部的几何辅助、piece 分组和数据预处理工具。

`src/scenes/entry/volumeParticles.js`
- entry 专用粒子系统。
- 负责 volume 驱动的模拟与渲染。

## 7. 效果与材质

`src/effects/CubePlexus.js`
- cubes scene 中 plexus 风格效果层的构建与更新。

`src/effects/CubeSceneLabels.js`
- cubes scene 标签的布局、时间控制与相关辅助逻辑。

`src/effects/MouseFrostMap.js`
- 生成 igloo 相关霜冻交互贴图或 frost map。

`src/materials/CubeTransmissionMaterial.js`
- cubes scene 使用的自定义 transmission 风格材质。

## 8. UI 与通用工具

`src/ui/msdf.js`
- WebGL HUD 文字渲染辅助。
- 包括 MSDF 文字块和 canvas 文字块。

`src/utils/geometry.js`
- 通用几何工具函数。

`src/utils/math.js`
- 通用数学工具函数。
- 包含 clamp、lerp、easing 等基础方法。

`src/style.css`
- DOM HUD、页面壳层和非 WebGL 样式的全局 CSS。

## 9. 按问题快速定位文件

如果你只是想快速找文件，可以按这个思路：

- “应用怎么启动” -> `main.js`、`MainController.js`
- “首页多个 scene 怎么混合” -> `HomeSceneStack.js`、`HomeSceneRenderer.js`
- “route 和 detail 逻辑在哪” -> `Router.js`、`RouteSync.js`、`DetailTransitionState.js`
- “内容是从哪里来的” -> `raw/be.js`、`beToSiteContent.js`、`siteContent.js`
- “某个视觉 scene 在哪里” -> `src/scenes/`
- “entry 为什么最复杂” -> `src/scenes/entry/`
- “为什么 UI 有两套” -> `UIScene.js`、`WebGLUiScene.js`
- “哪里能直接调视觉参数” -> `AudioDebugGui.js`

## 10. 维护规则

以后只要 `src/` 下新增文件，就在这里补一条职责说明。
