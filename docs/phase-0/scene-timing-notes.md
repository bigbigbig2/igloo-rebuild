# Scene Timing Notes

## Source anchors

- Scroll render / auto-center：`../www.igloo.inc/assets/App3D-5907d20f.js:44620`
- Detail centering：`../www.igloo.inc/assets/App3D-5907d20f.js:44701`
- Scene navigation：`../www.igloo.inc/assets/App3D-5907d20f.js:44712`

## 1. Home scroll model

原站首页不是简单“当前 section index + 目标 index”的模式，而是：

- `targetY2` 作为输入目标
- `targetY1` 作为平滑中间层
- `y` 作为最终滚动值
- `velocity` 作为滚动速度

参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44622`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44624`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44626`

这说明原站滚动本质上是连续值驱动，而不是离散页签切换。

## 2. Scene visibility and composition

在 scroll 渲染逻辑中，controller 会：

- 计算每个 scene 的 `__top` / `__bottom`
- 判断当前有哪些 scene 处于可见区间
- 把当前 scene 与下一 scene 渲染到不同 buffer
- 把结果交给主材质进行混合

参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44626`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44637`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44649`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44681`

这与当前 rebuild 的“只渲染一个 active scene”是最关键的架构差异之一。

## 3. Auto-center behavior

在用户停止滚动后，原站会检查当前 section 是否需要自动居中。

参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44650`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44668`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44678`

推论：

- 首页 section 不是完全自由滚动，而是带有“吸附到关键位置”的交互设计。
- 这也是原站滚动手感的重要来源。

## 4. Detail enter flow

进入 `/portfolio/:project` 时，主控制器会：

1. 找到 `Be.cubes` 中对应的项目
2. 标记 `isDetailOpen = true`
3. 禁用 scroll 输入
4. 根据当前 cubes scene 的 progress 计算 detail 居中时间
5. 驱动主合成材质的 `uDetailProgress` / `uDetailProgress2`
6. 触发 cubes detail 动画与 detail scene 动画
7. 播放 `click-project`，随后延时播放 `enter-project`

关键参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44734`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44736`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44750`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44763`

## 5. Detail leave flow

从 detail 返回首页时，主控制器会：

1. 重置 detail progress uniform
2. 触发 cubes scene 的 detailAnimationOut
3. 触发 detailScene 的 playOutAnimation
4. 播放 `leave-project`
5. 延迟一段时间后重新启用滚动

关键参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44720`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44730`

## 6. First navigation special case

首次进入首页或首次直达 detail，并不是和普通导航一样的逻辑。

关键参考：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44714`
- `../www.igloo.inc/assets/App3D-5907d20f.js:44736`

推论：

- rebuild 后续应明确区分：
  - cold start
  - home → detail
  - detail → home
  - refresh on detail route

否则很容易在进入动画和状态同步上出现补丁式代码。

## 7. Phase 2 and Phase 3 implication

如果后续要重构运行时，建议先把下面 4 个状态抽出来：

- `scrollState`
- `sceneVisibilityState`
- `detailTransitionState`
- `navigationModeState`

这样 Phase 2 可以把结构搭对，Phase 3 再把首页到详情页闭环跑顺。
