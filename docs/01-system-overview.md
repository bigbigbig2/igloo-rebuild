# 系统总览

## 1. 工程定位

`igloo-rebuild` 不是一个从零设计的新站点，而是一个按照原版运行时形状重建出来的可演进工程。

它的核心策略是：

- 先复原运行时骨架
- 再把原版视觉、时间线、资产、音频逐步迁回
- 尽量避免把迁移逻辑继续堆回一个超大文件

## 2. 顶层模块

当前系统可以分成 8 个逻辑层：

| 层 | 目录 | 作用 |
| --- | --- | --- |
| 启动层 | `src/main.js` | 创建 DOM 外壳、boot loader、初始化控制器 |
| Core 层 | `src/core/` | 渲染器、路由器、事件总线、资产注册表 |
| Runtime 层 | `src/runtime/` | 首页 section 编排、滚动状态、详情过渡、主控制器、音频 |
| Content 层 | `src/content/` | 原始数据、站点内容结构、资产清单 |
| Scene 层 | `src/scenes/` | 首页三段、详情页、DOM HUD、WebGL HUD |
| Entry 子模块 | `src/scenes/entry/` | `EntryScene` 的拆分实现 |
| Effect / Material 层 | `src/effects/`, `src/materials/` | cubes 特效、自定义材质、frost RT |
| Utility 层 | `src/utils/`, `src/ui/` | 几何预处理、插值工具、文字渲染 |

## 3. 关键对象关系

### 3.1 启动链

`main.js`
-> `EventBus`
-> `Router`
-> `Engine`
-> `SiteController`
-> `MainController`

### 3.2 首页链

`MainController`
-> `HomeSceneStack`
-> `ScrollState`
-> `IglooScene / CubesScene / EntryScene`
-> `HomeSceneRenderer`
-> `WebGLUiScene`

### 3.3 详情链

`Router`
-> `RouteSync`
-> `MainController`
-> `DetailTransitionState`
-> `DetailScene`

## 4. 当前运行时模型

### 4.1 路由

系统只有两种业务路由：

- `/`
  首页
- `/portfolio/:project`
  详情页

首页不是多页面切换，而是一条连续滚动轴上的 3 个 section。

### 4.2 首页 section

首页 section 固定为：

- `igloo`
- `cubes`
- `entry`

其中：

- `igloo` 是 manifesto / intro 场景
- `cubes` 是 portfolio 栈
- `entry` 是 portal -> room -> outbound links 场景

### 4.3 详情页

详情页不是独立新页面的 WebGL 初始化，而是首页之上的 overlay 场景。

这意味着：

- 首页 scene 仍然活着
- `DetailScene` 通过 `DetailTransitionState` 接管视觉重心
- `HomeSceneRenderer` 在合成时同时处理 home 和 detail

## 5. Scene 约定

所有 3D 场景都遵守 `SceneBase` 的统一接口：

- `setActive(active)`
- `setProgress(progress)`
- `setTransitionState(state)`
- `setSize(width, height)`
- `update(delta, elapsed)`

这套约定的意义是：

- `HomeSceneStack` 可以统一驱动所有首页场景
- `HomeSceneRenderer` 不需要知道具体 scene 内部实现
- scene 内部可以独立演化，而不破坏外部编排器

## 6. 两套 HUD 的分工

系统同时保留两套 HUD：

### 6.1 `UIScene`

DOM 实现，职责偏功能完整：

- 可访问性
- 链接点击
- 兜底 UI
- 某些尚未迁入 WebGL 的交互命中层

### 6.2 `WebGLUiScene`

WebGL 实现，职责偏视觉还原：

- logo
- manifesto 区块
- cubes 标签线框
- entry 底部 HUD

当前策略不是二选一，而是两套并行：

- DOM HUD 保证可用
- WebGL HUD 逐步接管视觉

## 7. 资产模型

资产由 `AssetRegistry` 统一管理，`assetManifest` 把它们分成 3 组：

- `geometry`
- `texture`
- `audio`

资产来源主要是：

- `public/reference-assets/`
- 原始 dump 中的音频路径
- 本地解码器目录 `public/decoders/`

## 8. 当前最复杂模块

当前最复杂的模块是 `EntryScene`，因为它同时包含：

- portal 前半段时序
- room 后半段时序
- volume 粒子系统
- 底部 UI
- pointer interaction
- 音频联动

因此它已经被拆到 `src/scenes/entry/` 下，而不是继续留在单文件里。

## 9. 当前工程的设计原则

### 9.1 先搭骨架，再追还原

优先保证：

- 运行时稳定
- 模块边界清楚
- 数据流单向清晰

再逐步追：

- shader 细节
- scene 时间线
- 音频行为
- WebGL HUD 还原度

### 9.2 运行时统一编排，视觉内部自治

运行时只负责：

- route
- scroll
- active section
- transition progress

视觉模块自己负责：

- 材质
- 几何
- 动画
- 相机
- 局部 reveal

### 9.3 允许阶段性兜底

典型例子：

- `UIScene` 作为 `WebGLUiScene` 的功能兜底
- `EntryScene` 的某些交互仍保留 DOM hit layer

这是当前迁移过程中的有意设计，不是架构错误。
