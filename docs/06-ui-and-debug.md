# UI 与调试

## 1. 为什么现在有两套 HUD

当前工程同时保留了两套 UI 层：

- `UIScene`
  面向功能完整性的 DOM HUD。
- `WebGLUiScene`
  面向视觉保真的 Three.js HUD overlay。

这样拆不是重复造轮子，而是迁移阶段的策略选择。
原因很直接：

- DOM HUD 更容易先把交互、文案、链接这些功能补完整。
- WebGL HUD 更适合逐步对齐原版视觉语言。
- 在 WebGL 版尚未完全迁完之前，DOM 版可以兜底，避免功能丢失。

## 2. `UIScene`

文件：`src/scenes/UIScene.js`

`UIScene` 是当前工程里“功能完整优先”的那套 HUD。

它负责：

- manifesto 文案
- 首页 section 标签
- 项目卡片列表
- detail 文案与外链
- entry 外链 fallback 控件
- 全局 social links
- 底部交互提示

它的特点是：

- 只保存 UI 关心的最小状态切片
- 不直接拥有 route、scroll 或 scene 模拟逻辑
- 所有行为都通过 `MainController` 绑定回调向上汇报

所以可以把它理解成“当前工程里最稳的功能层 UI”。

## 3. `WebGLUiScene`

文件：`src/scenes/WebGLUiScene.js`

`WebGLUiScene` 是“表现优先”的 HUD scene。
它并不是普通 DOM overlay，而是被 `HomeSceneRenderer` 当成 WebGL overlay scene 合成进首页画面的。

它当前主要负责：

- 左上角 logo
- 音频图标
- cubes scene 的标签和辅助信息
- entry scene 的底部 HUD
- 选中 brackets、箭头提示
- 一些非 DOM 的 overlay 线框和装饰层

它的特点是：

- 读的是 `MainController` 推下来的 presentation state
- 本身不拥有业务逻辑
- 可以在功能还未完全迁移时先只承担视觉表现

## 4. Entry 区域为什么会出现“混合 UI”

Entry 这一段目前采用的是混合策略：

- `WebGLUiScene`
  负责做场内 HUD，尽量靠近原版的观感。
- `UIScene`
  负责保留可点击区域、fallback 行为和功能兜底。

这也是为什么迁移过程中会看到：

- 视觉上像是 WebGL UI
- 但某些交互还保留 DOM hit area

这不是最终形态，而是阶段性过渡方案。

## 5. `MainController` 为什么是 UI 中枢

文件：`src/runtime/MainController.js`

`MainController` 是整个 UI 编排的中枢，因为只有它同时知道：

- 当前 route
- 当前首页 section
- 当前 hovered / active project
- detail overlay 进度
- entry 当前 active link
- 音频状态

所以两套 HUD 都不能直接各自维护完整业务状态，而是都由 `MainController` 统一喂状态。

典型链路是：

1. runtime 状态先在 `MainController` 内变化
2. `MainController` 派生出更小的 UI presentation state
3. 把这份状态分别同步给 `UIScene` 和 `WebGLUiScene`
4. HUD 的点击、hover、切换等行为再通过回调回流到 `MainController`

这样做的好处是，UI 层不会反过来劫持业务逻辑。

## 6. 文字渲染体系

相关文件：

- `src/ui/msdf.js`
- `src/scenes/WebGLUiScene.js`

WebGL HUD 里的文字并不是都走同一种方案。
当前保留了两类文字块：

- `CanvasTextBlock`
  更稳、更容易调试，也更适合做过渡版本。
- `MsdfTextBlock`
  用于更高质量的 signed distance field 文本显示。

保留两套实现的原因很现实：

- canvas 文字更适合快速迭代
- MSDF 更适合最终高保真版本

## 7. 调试面板

文件：`src/debug/AudioDebugGui.js`

虽然名字叫 `AudioDebugGui`，但现在它已经是整个工程的主调试面板。

当前包含这些 folder：

- `Igloo Intro`
- `Cubes Look`
- `Cubes Labels`
- `Entry Scene`
- `Transition FX`

其中 `Entry Scene` 是当前最重要的一组，因为它同时覆盖了：

- 粒子系统
- room 可见度
- entry 底部 HUD
- 透明罩子
- floor 相位

## 8. Entry 相关可调参数

`Entry Scene` 目前暴露的调试项主要包括：

- 粒子大小
- 粒子透明度
- 粒子自旋速度
- 粒子噪声幅度
- 粒子初始 glow
- 粒子模拟速度
- flow force
- orig force
- surface force
- friction
- pointer interaction force
- 透明圆柱罩 alpha
- floor phase speed
- 底部 label 的 Y 偏移
- label spread
- 当前项和旁侧项透明度
- visit 区域偏移与透明度

这意味着后续做 entry 对齐时，很多微调不需要改代码就能先验证方向。

## 9. 这些调试值最后落到哪里

GUI 本身不直接改 shader。
它只是把值转发给真正拥有行为的模块。

主要落点有：

- `IglooScene` 的 intro debug settings
- `CubesScene` 的 look / label debug settings
- `EntryScene` 的粒子与 room debug settings
- `WebGLUiScene` 的 entry HUD debug settings
- `HomeSceneRenderer` 的 transition debug settings

这个模式很重要，因为它让调试值依然服从模块边界，而不是让 GUI 变成逻辑中心。

## 10. 建议的调试顺序

如果要继续调 `EntryScene`，建议顺序是：

1. 先稳住粒子模拟
2. 再调透明罩和 room 层次
3. 再调底部 HUD 的位置和显隐
4. DOM fallback 只拿来保功能，不拿来判断最终视觉

这样可以避免相机、粒子、UI 都没稳时反复打架。

## 11. 当前已知缺口

当前 UI 系统虽然已经可用，但还存在这些迁移缺口：

- 部分 entry 交互仍依赖 DOM hit area
- WebGL HUD 位置和节奏还在继续对齐原版
- 文本位置可能还需要按 scene 单独微调
- DOM fallback 和纯 WebGL 交互的最终边界还没有完全收敛

这些都属于当前迁移阶段的正常现象。
