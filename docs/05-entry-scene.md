# EntryScene 拆解

`EntryScene` 是当前工程里结构最复杂、迁移压力最大的模块。

它不仅是首页最后一段 scene，还是多个系统的交汇点：

- section 时间线
- 相机轨迹
- portal / room 两段视觉
- 3D volume 粒子
- pointer interaction
- audio mix
- DOM / WebGL 双 HUD

## 1. 现在的模块拆分

`src/scenes/EntryScene.js`
本身只保留 scene 级状态和对外接口。

真正实现拆分如下：

| 文件 | 作用 |
| --- | --- |
| `entry/buildScene.js` | 创建几何、材质、对象树，装配所有节点 |
| `entry/choreography.js` | 根据 `progress` 驱动时间线、相机、reveal、音频状态 |
| `entry/materials.js` | 各种 portal / room / smoke / floor / cylinder 材质工厂 |
| `entry/volumeParticles.js` | `Entry` 后半段核心粒子系统 |
| `entry/utils.js` | Entry 专用几何辅助、piece 分组等 |
| `entry/constants.js` | time/pulse 常量 |

## 2. `EntryScene.js` 的职责

### 2.1 它自己保留的状态

- links 列表
- active / auto / preview link index
- pointer 交互状态
- post 状态
- floor 额外相位
- audioState
- presentationState
- debug settings

### 2.2 它对外暴露的接口

典型接口包括：

- `getPresentationState()`
- `getAudioState()`
- `getColorCorrectionState()`
- `setPointer()`
- `setActiveLinkIndex()`
- `setAutoLinkIndex()`
- `previewLink()`
- `clearPreviewLink()`
- `setLinkInteractionEnabled()`
- `getEntryDebugSettings()`

### 2.3 它不再做的事情

它不再直接把所有 mesh 创建、shader 拼接、时间线动画都写在一个文件里。

这点非常重要，因为这正是后续继续迁移原版 `Entry` 时能保持可维护性的前提。

## 3. Scene 时间线分层

当前 `Entry` 可以理解成两个连续阶段。

### 3.1 Portal 阶段

主要对象：

- rings
- forcefields
- plasma layers
- smoke trails
- tunnel
- snow particles

主要感觉：

- 入口门
- 穿梭
- portal pulse

### 3.2 Room 阶段

主要对象：

- floor
- room ring
- portal forcefield
- text cylinder
- cylinder shell
- ambient particles
- volume particles

主要感觉：

- 进入房间
- 底部 HUD 可交互
- 粒子容器成为视觉核心

## 4. `computePresentationState()`

这个函数在 `entry/choreography.js` 里，是 `EntryScene` 对 HUD 和外部系统输出的统一状态摘要。

它当前会产出这些关键字段：

- `panelProgress`
- `linksProgress`
- `roomRingProgress`
- `portalCoreProgress`
- `interactionPulse`

这些字段分别被以下模块消费：

- `UIScene`
- `WebGLUiScene`
- `AudioController`
- `MainController`

## 5. 相机系统

相机时间线同样在 `entry/choreography.js` 中维护。

### 5.1 当前做法

通过一套 track 数据驱动：

- position
- target
- up rotation
- FOV
- 少量位移扰动

### 5.2 为什么独立出来

因为 `Entry` 的“像不像原版”，很大程度不是 shader 决定的，而是：

- 什么时候翻转
- 什么时候穿门
- 什么时候落入 room
- 什么时候把视线交给粒子

这些都属于镜头编排问题，而不是单纯材质问题。

## 6. Volume 粒子系统

### 6.1 当前定位

这部分已经不是最早的静态点云占位版本，
而是一套真正的 `ping-pong compute` 路线。

### 6.2 文件

- `src/scenes/entry/volumeParticles.js`

### 6.3 当前结构

主要包含：

- display shader
- reset pass
- compute pass
- `tTexture1 / tTexture2` 双缓冲状态纹理
- `tOrig` 原始目标分布纹理
- `tVolume` 3D volume 纹理

### 6.4 当前输入

- volume 纹理列表
- volume scale
- particle count
- pointer interaction 数据
- simulation state

### 6.5 当前输出

- Three.js `Points`
- 粒子的显示材质与可见性
- 对 link 切换的响应

### 6.6 当前 link 对应的 volume

现在 link shape 主要由这些 volume 支持：

- `peachesbody_64`
- `x_64`
- `medium_32`

### 6.7 当前限制

虽然已经进入 compute 路线，但它仍处于“重建版的原型还原”阶段，不是原版 1:1 搬运。

后续如果继续对齐原版，最值得继续压的是：

- surface force 细节
- shadow / emissive 的读取方式
- container 限制形状
- fluid interaction 贴近原版

## 7. Entry UI

### 7.1 DOM 层

`UIScene` 仍然保留 entry 的点击命中和 fallback 结构。

它更偏：

- 可点
- 可访问
- 兜底

### 7.2 WebGL 层

`WebGLUiScene` 现在已经接入：

- 左右箭头
- 中间选中 bracket
- 底部 link 标签
- visit 纹理按钮

但它还不是彻底脱离 DOM 的最终版，当前仍与 DOM 命中层并行。

## 8. Audio 联动

`EntryScene` 通过 `getAudioState()` 向 `MainController` 输出：

- `particlesMix`
- `interactionEnabled`
- `interactionForce`

然后由 `MainController` 把它推给 `AudioController`：

- 设置 `particles` loop mix
- 触发 UI 声音

## 9. Debug 设置

当前 `Entry` 已经接入两层 debug。

### 9.1 Scene / 粒子层

在 `EntryScene.js` 中维护：

- `particleSizeMultiplier`
- `particleAlphaMultiplier`
- `particleRotationSpeed`
- `particleNoiseMultiplier`
- `particleInitialGlowMultiplier`
- `particleSimulationSpeed`
- `particleFlowForceMultiplier`
- `particleOrigForceMultiplier`
- `particleSurfaceForceMultiplier`
- `particleFriction`
- `particleInteractionForceMultiplier`
- `cylinderShellAlphaMultiplier`
- `floorPhaseSpeed`

### 9.2 HUD 层

在 `WebGLUiScene.js` 中维护：

- `labelYOffset`
- `labelTextLift`
- `labelSpreadMultiplier`
- `currentScaleMultiplier`
- `sideScaleMultiplier`
- `currentOpacityMultiplier`
- `sideOpacityMultiplier`
- `visitYOffset`
- `visitOpacityMultiplier`
- `arrowOpacityMultiplier`
- `frameOpacityMultiplier`

### 9.3 GUI 入口

这些参数统一暴露到了：

- `src/debug/AudioDebugGui.js`

现在虽然类名还叫 `AudioDebugGui`，但它已经是整套首页调参面板。

## 10. 当前迁移状态

### 10.1 已完成

- `EntryScene` 从超大单文件重构成多模块
- portal / room 主体骨架
- 相机时序主线
- 透明圆柱壳与 floor 链路
- volume 粒子切 shape
- pointer interaction 基础版
- 底部 HUD 的 WebGL 接管第一版
- entry debug 参数接入 GUI

### 10.2 仍在进行中

- 与原版更接近的 volume particle 表面稳定性
- WebGL HUD 的最终命中和布局对齐
- room 空间细节与材质打磨
- 某些原版细微 pulse / post 行为

## 11. 后续维护建议

### 11.1 改时间线

优先改：

- `entry/choreography.js`

### 11.2 改几何和节点

优先改：

- `entry/buildScene.js`

### 11.3 改 shader / 视觉

优先改：

- `entry/materials.js`
- `entry/volumeParticles.js`

### 11.4 改交互表现

通常会同时涉及：

- `EntryScene.js`
- `MainController.js`
- `UIScene.js`
- `WebGLUiScene.js`

## 12. 一句话总结

`EntryScene` 不是一个普通 scene，而是当前工程里最接近“子系统”的模块。

后续只要继续沿着“scene orchestrator + entry 子模块”的结构推进，迁移难度是可控的；
如果再把逻辑重新揉回单文件，后续每一次还原都会重新变得很痛苦。
