# Runtime, Routing and Events

## Source anchors

- 场景注册表：`../www.igloo.inc/assets/App3D-5907d20f.js:44571`
- 主控制器：`../www.igloo.inc/assets/App3D-5907d20f.js:44576`
- 路由定义：`../www.igloo.inc/assets/App3D-5907d20f.js:44814`

## 1. Scene registry

在 `App3D-5907d20f.js:44571`，原站将首页场景注册为：

- `igloo`
- `cubes`
- `entry`

这说明首页天然就是多段场景结构，而不是单一场景换状态。

## 2. Main controller responsibilities

在 `App3D-5907d20f.js:44576` 起的主控制器中，已确认它至少负责：

- 保存全局 scroll 状态
- 保存 auto-center 状态
- 创建 `uiScene`
- 创建多个 `scrollComposers`
- 创建 `detailScene`
- 绑定 `resize`
- 监听 route 请求切场景
- 控制首页与 detail 的进出场动画
- 控制滚轮、键盘、触摸滚动输入
- 控制部分音频事件触发

这与当前 rebuild 中的 `SiteController` 职责接近，但原站的实现明显更偏：

- “多 scene compositor 驱动”

而不是：

- “单 scene setScene 切换”

## 3. Route model

在 `App3D-5907d20f.js:44814` 起的路由定义中，当前已确认：

- `/` → `scene: home`
- `/portfolio/:project` → `scene: project`

route change 之后，不是直接操作 DOM，而是发出：

- `webgl_router_request_switch_scene`

对应源：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44829`

同时主控制器再监听该事件：

- `../www.igloo.inc/assets/App3D-5907d20f.js:44596`

这说明原站 route → scene switch 是标准化事件流，而不是散落在组件内部。

## 4. Core navigation events

最关键的一组运行时事件如下。

### Navigation

- `webgl_router_start`
  - 用于启动 router
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44710`
- `webgl_router_request_switch_scene`
  - 路由系统请求切换到某个逻辑 scene
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44829`
- `webgl_switch_scene`
  - 运行时主动导航；例如点项目后切到 `portfolio/:hash`
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:38655`
- `webgl_router_block_navigation`
  - 在切场景动画期间阻止路由重复切换
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44714`

### Audio

- `webgl_play_audio`
  - 播放 one-shot 或事件音效
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:32291`
- `webgl_set_audio_volume`
  - 动态调整 loop / ambience 音量
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:32291`
- `webgl_audio_mute_toggle`
  - 切换静音
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:30686`
- `webgl_audio_update_mute`
  - 将静音状态广播出去
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:30780`
- `webgl_audio_global_volume`
  - 设置全局音量
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:30686`

### Project / UI state

- `webgl_project_show`
  - project detail UI 显示
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44540`
- `webgl_project_hide`
  - project detail UI 隐藏
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44564`
- `webgl_show_ui_intro`
  - 首页 UI intro 显示触发
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:35321`
- `webgl_hover_logo`
  - logo hover 交互事件
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:42430`
- `webgl_ui_particles_clicked`
  - UI 中与 links / mute 相关的粒子交互点击
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:40499`

### Render lifecycle

- `webgl_render_active`
  - 控制是否激活渲染主循环
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:44710`
- `webgl_prerender`
- `webgl_render`
- `webgl_postrender`
  - 渲染生命周期事件
  - source clue: `../www.igloo.inc/assets/App3D-5907d20f.js:25613`

## 5. What this means for rebuild

当前 rebuild 的事件粒度仍然偏粗，后续建议对齐到以下层次：

- Route events
- Scene transition events
- Audio events
- UI events
- Render lifecycle events

建议不要把这些逻辑继续压回一个巨大的 `SiteController`。更合理的结构是：

- `RouteSync`
- `ScrollController`
- `SceneState`
- `AudioEvents`
- `UIState`

## 6. Phase 2 implication

到了 Phase 2，重构的真正目标不是“把类名改漂亮”，而是：

- 让 route、scene、audio、UI 全都围绕统一事件流协作

这会显著降低后续接回音频和 UI 时的返工成本。
