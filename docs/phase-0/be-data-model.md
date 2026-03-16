# `Be` Data Model

## Source anchor

- `../www.igloo.inc/assets/App3D-5907d20f.js:32050`

`Be` 是原站运行时最重要的数据块之一，至少承担了以下职责：

- 全局 UI 常量
- 首页文案
- 社交链接
- Portfolio 项目配置
- 首页底部外链数据
- 全局音量与静音初始状态

## Top-level shape

根据 `App3D-5907d20f.js:32050` 到 `App3D-5907d20f.js:32193`，当前已确认的顶层字段如下：

- 布局与断点
  - `gridSize`
  - `gridSizeLow`
  - `gridSizeMobile`
  - `topMargin`
  - `topMarginLow`
  - `topMarginMobile`
  - `breakpointW`
  - `breakpointH`
  - `breakPointMobile`
- UI 颜色
  - `colorLogo`
  - `colorTitle`
  - `colorText`
  - `colorProjectTitle`
  - `colorProjectText`
- 文案
  - `manifesto`
  - `copyright`
  - `rights`
  - `scroll`
  - `follow`
  - `click`
  - `clickDisabled`
  - `close`
- 内容实体
  - `social`
  - `cubes`
  - `links`
- 音频默认值
  - `volume`
  - `muted`

## Fields worth migrating first

### `manifesto`

Source:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32065`

Structure:

- `title`
- `text`

Migration note:

- 应直接替换当前 `src/content/siteContent.js` 中的临时 manifesto 文案。

### `social`

Source:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32077`

Structure:

- 数组项字段：`name`, `link`

Current meaning:

- 顶部主品牌的社交入口。

Migration note:

- 不应再手写成 debug link，而应保留为原站对外社交数据。

### `cubes`

Source:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32084`

Structure:

- 数组项字段：
  - `title`
  - `hash`
  - `date`
  - `temp`
  - `obj`
  - `innerobject`
  - `interior`
- `interior` 子字段：
  - `enabled`
  - `title`
  - `content`
  - `socialTitle`
  - `social`
  - `linkTitle`
  - `links`
  - `obj`
  - `objScale`

Project mapping:

- `Pudgy Penguins`
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:32085`
  - `hash`: `pudgy-penguins`
  - `obj`: `cube3`
  - `innerobject`: `pudgy`
- `Overpass`
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:32120`
  - `hash`: `overpass`
  - `obj`: `cube1`
  - `innerobject`: `overpass_logo`
- `Abstract`
  - source: `../www.igloo.inc/assets/App3D-5907d20f.js:32146`
  - `hash`: `abstract`
  - `obj`: `cube2`
  - `innerobject`: `abstractlogo`

Migration notes:

- 当前 `siteContent.projects` 应优先改为从 `Be.cubes` 适配生成。
- `hash` 直接对应路由 `/portfolio/:project`。
- `obj` 对应首页 cubes section 的外层对象。
- `innerobject` / `interior.obj` 对应 detail scene 中显示的内部对象。
- `interior.objScale` 是 detail scene 的重要几何缩放线索，应避免丢失。

### `links`

Source:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32175`

Structure:

- 数组项字段：`title`, `url`, `vdb`, `scale`

Current meaning:

- 这组数据更像首页某个交互区块的外链入口，而不是顶部 social 的复用。
- `vdb` 显示这些链接不是简单 DOM 列表，而是会驱动体积/粒子/图形表现。

Known values:

- `LinkedIn` → `peachesbody_64`
- `X / Twitter` → `x_64`
- `Medium` → `medium_32`

Migration note:

- 这组数据应单独保留，不建议合并进 `social`。

### `volume` / `muted`

Source:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32191`

Migration note:

- 后续 `AudioManager` 的默认配置应该从这里读取，而不是在 rebuild 中再次硬编码。

## Recommended adapter shape

后续在 rebuild 中不建议直接到处消费原始 `Be`，更稳妥的方式是：

- `rawBe`: 尽量保留原字段名
- `siteContent`: 转成当前工程可消费结构
- `sceneConfig`: 为场景层输出几何名、纹理名、对象缩放等运行时配置

建议拆成：

- `src/content/raw/be.js`
- `src/content/adapters/beToSiteContent.js`
- `src/content/adapters/beToSceneConfig.js`

## Phase 1 implication

如果 Phase 1 只做一件事，优先顺序应是：

1. 提取 `manifesto`
2. 提取 `cubes`
3. 提取 `links`
4. 提取 `volume/muted`

这样可以最小成本把当前 placeholder 内容层替换成真实数据层。
