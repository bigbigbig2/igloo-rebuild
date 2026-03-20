# Scene 总览

## 1. Scene 层的整体结构

`src/scenes/` 当前包含 7 个核心文件：

- `SceneBase.js`
- `IglooScene.js`
- `CubesScene.js`
- `EntryScene.js`
- `DetailScene.js`
- `UIScene.js`
- `WebGLUiScene.js`

其中可以分成三类：

| 类型 | 文件 | 说明 |
| --- | --- | --- |
| 3D 场景 | `IglooScene`, `CubesScene`, `EntryScene`, `DetailScene` | 真正参与 Three.js 渲染 |
| UI 场景 | `UIScene`, `WebGLUiScene` | 分别负责 DOM HUD 和 WebGL HUD |
| 基类 | `SceneBase` | 为 3D 场景提供统一接口 |

## 2. `SceneBase`

`SceneBase` 是所有 3D scene 的统一基类。

### 2.1 它统一了什么

- `name`
- `progress`
- `active`
- `transitionState`
- `camera`
- `root`

### 2.2 为什么它重要

首页编排器和渲染器只认统一接口，不认具体实现。

也就是说：

- `HomeSceneStack` 不关心 `IglooScene` 的 shader 细节
- `HomeSceneRenderer` 不关心 `EntryScene` 的几何结构

它们只要求这些 scene 能按统一方式接受：

- progress
- active
- transitionState
- size

## 3. `IglooScene`

### 3.1 角色

首页第一段 manifesto / intro 场景。

### 3.2 主要内容

- 冰屋主体
- 山体和地面
- intro 粒子
- cage / outline / patch
- manifesto 相关 reveal

### 3.3 当前特点

- 已经有一套相对完整的 intro debug settings
- 会输出自己的 color correction state 给 `HomeSceneRenderer`
- 是当前最早完成骨架化的 scene 之一

### 3.4 与外部的连接

- 吃 `progress`
- 提供 `presentationState`
- 提供 `colorCorrectionState`
- 接受 pointer

## 4. `CubesScene`

### 4.1 角色

首页第二段 portfolio 栈场景。

### 4.2 主要内容

- cube stack
- room background
- blurry text
- background shapes
- cube labels
- plexus / frost / transmission

### 4.3 当前特点

- 是首页最复杂的交互 scene 之一
- 既要支持滚动 section 编排
- 又要支持项目 pick、hover、打开 detail

### 4.4 它对 detail 的作用

`DetailScene` 不是凭空打开的，它的视觉 handoff anchor 来自 `CubesScene`。

因此 `CubesScene` 还负责：

- 为详情页提供选中项目的对接锚点
- 在 detail 打开时做 focus 处理

## 5. `EntryScene`

### 5.1 角色

首页第三段 portal -> room -> outbound links 场景。

### 5.2 当前结构

`EntryScene.js` 本身现在更像 orchestrator，
真正的实现拆在：

- `src/scenes/entry/buildScene.js`
- `src/scenes/entry/choreography.js`
- `src/scenes/entry/materials.js`
- `src/scenes/entry/volumeParticles.js`
- `src/scenes/entry/utils.js`
- `src/scenes/entry/constants.js`

### 5.3 主要内容

- portal rings
- forcefield / plasma / smoke / tunnel
- room ring / floor / cylinder shell
- volume 粒子系统
- pointer interaction
- entry UI 状态输出

`EntryScene` 是当前最值得单独阅读的 scene，详见：

- [05-entry-scene.md](./05-entry-scene.md)

## 6. `DetailScene`

### 6.1 角色

项目详情 overlay scene。

### 6.2 主要内容

- 项目主体模型
- 详情背景和 halo
- light shaft / ring / plane / column
- detail 粒子
- detail 文字氛围层

### 6.3 当前特点

- 不是 standalone 页面初始化
- 而是始终作为 home renderer 的 detail overlay 参与合成

### 6.4 数据来源

主要消费：

- `siteContent.projects`
- `AssetRegistry`
- `DetailTransitionState`

## 7. `UIScene`

### 7.1 角色

当前工程的 DOM HUD。

### 7.2 优先级

它的优先级不是“最像原版”，而是：

- 功能完整
- 可访问
- 交互兜底

### 7.3 负责哪些内容

- manifesto DOM 面板
- portfolio project list
- detail 文案
- entry links 的命中层与 fallback UI
- 首页底部交互说明

## 8. `WebGLUiScene`

### 8.1 角色

首页高保真 HUD 的 WebGL 版。

### 8.2 当前负责内容

- 左上 logo
- 左下 sound
- manifesto 文本
- cubes overlay 线框和标题
- entry 底部 HUD

### 8.3 与 `UIScene` 的关系

两者不是替代关系，而是互补关系：

- `UIScene` 兜底功能
- `WebGLUiScene` 渐进接管视觉

## 9. Scene 与 runtime 的接口

### 9.1 首页 scene 的输入

首页 scene 主要从 runtime 接收：

- `progress`
- `transitionState`
- `active`
- pointer
- size

### 9.2 首页 scene 的输出

首页 scene 可能向 runtime / renderer 输出：

- `presentationState`
- `audioState`
- `colorCorrectionState`
- handoff anchor

## 10. 当前维护建议

### 10.1 新功能放哪

如果是运行时编排问题：

- 放 `src/runtime/`

如果是某个 scene 内部视觉问题：

- 放对应 scene 或它的子模块目录

如果是 HUD 命中、文案、fallback：

- 优先看 `UIScene`

如果是 HUD 视觉还原：

- 优先看 `WebGLUiScene`

### 10.2 不建议再让 `EntryScene` 回到超大单文件

当前 `EntryScene` 的拆分是这次重构最重要的结构性成果之一，
后续继续迁移时应该继续沿用。
