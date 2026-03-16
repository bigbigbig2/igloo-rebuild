# Assets and Audio Map

## 1. Dump size snapshot

基于 `../www.igloo.inc/assets/` 当前统计：

- `22` 个 `.drc`
- `49` 个 `.ktx2`
- `18` 个 `.ogg`
- `1` 个 `.exr`
- `1` 个字体 `.json`
- `2` 个 `.wasm`
- `8` 个 `.js`

按顶层目录统计：

- `audio`: `18`
- `fonts`: `2`
- `geometries`: `22`
- `images`: `49`
- `libs`: `4`

这说明 dump 已经足够支撑高保真迁移，当前 rebuild 只接了其中一个小子集。

## 2. Representative asset roles

### Runtime / loaders

- `assets/index-2d900c2d.js`
  - 站点入口。
- `assets/App3D-5907d20f.js`
  - 主运行时逻辑。
- `assets/libs/draco/*`
  - Draco decoder。
- `assets/libs/basis/*`
  - Basis / KTX2 transcoder。

### Igloo / home intro cluster

Representative anchors:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32608`
  - `igloo/igloo_scene.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:32853`
  - `igloo/ground_glow.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:33655`
  - `intro_particles.drc`
- `../www.igloo.inc/assets/App3D-5907d20f.js:34433`
  - `igloo/igloo_exploded_color.ktx2`

Interpretation:

- Igloo section 不是单一几何体，而是一组环境、地面 glow、粒子、爆裂/分层贴图共同组成的 scene cluster。

### Cubes / portfolio cluster

Representative anchors:

- `../www.igloo.inc/assets/App3D-5907d20f.js:35379`
  - `cubes/cube_scene.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:35460`
  - `cubes/dot_pattern.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:35557`
  - `blurrytext.drc`
- `../www.igloo.inc/assets/App3D-5907d20f.js:35568`
  - `cubes/blurrytext_atlas.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:39114`
  - `cubes/background_shapes.drc`

Interpretation:

- Cubes section 不只是 3 个主 cube。
- 它还包含：
  - 背景形体
  - 模糊文字层
  - dot pattern / scene LUT 贴图
  - 项目对象本体

Migration note:

- 当前 rebuild 的 `CubesScene` 只复用了最基础的 cube 资源，距离原站结构还差多个辅助层。

### Entry / tunnel / particles cluster

Representative anchors:

- `../www.igloo.inc/assets/App3D-5907d20f.js:39595`
  - `shattered_ring2.drc`
- `../www.igloo.inc/assets/App3D-5907d20f.js:41006`
  - `smoke_trail.drc`
- `../www.igloo.inc/assets/App3D-5907d20f.js:41357`
  - `shattered_ring_smoke.drc`
- `../www.igloo.inc/assets/App3D-5907d20f.js:41633`
  - `ceilingsmoke.drc`

Interpretation:

- Entry scene 是通道、烟雾、环体、容器粒子等多层叠加，不是单纯一个 ring + floor。

### UI assets

Representative anchors:

- `../www.igloo.inc/assets/App3D-5907d20f.js:42347`
  - `ui/logo-datatexture.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:42790`
  - `ui/sound-datatexture.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:43426`
  - `ui/arrow-datatexture.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:40414`
  - `ui/visit-datatexture.ktx2`
- `../www.igloo.inc/assets/App3D-5907d20f.js:34654`
  - `../fonts/IBMPlexMono-Medium-datatexture.ktx2`

Interpretation:

- UI 基本确认是 WebGL 文本 / icon 系统，不是 DOM overlay 原生控件。

### VDB / volume-linked assets

Source anchors:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32178`
- `../www.igloo.inc/assets/App3D-5907d20f.js:32183`
- `../www.igloo.inc/assets/App3D-5907d20f.js:32188`

Known values:

- `peachesbody_64`
- `x_64`
- `medium_32`

Interpretation:

- 首页 links 与某类 volume / particle / 体积可视化资源相关联。

## 3. Audio table

Audio controller source anchor:

- `../www.igloo.inc/assets/App3D-5907d20f.js:32194`

Confirmed audio registry:

- `music-bg` → `music-highq.ogg`
- `room-bg` → `room.ogg`
- `wind` → `wind.ogg`
- `igloo` → `igloo.ogg`
- `beeps` → `beeps.ogg`
- `beeps2` → `beeps2.ogg`
- `beeps3` → `beeps3.ogg`
- `click-project` → `click-project.ogg`
- `enter-project` → `enter-project.ogg`
- `leave-project` → `leave-project.ogg`
- `shard` → `shard.ogg`
- `project-text` → `project-text.ogg`
- `portals` → `circles.ogg`
- `particles` → `particles.ogg`
- `logo` → `logo.ogg`
- `ui-long` → `ui-long.ogg`
- `ui-short` → `ui-short.ogg`
- `manifesto` → `manifesto.ogg`

## 4. Audio role guess by behavior

基于事件触发点，当前可以把音频粗分为：

- Global ambience
  - `music-bg`
  - `room-bg`
- Scene ambience
  - `wind`
  - `igloo`
  - `shard`
  - `portals`
  - `particles`
- Portfolio flow
  - `click-project`
  - `enter-project`
  - `leave-project`
  - `project-text`
- UI / interaction
  - `logo`
  - `ui-long`
  - `ui-short`
  - `beeps*`
- Copy / narrative emphasis
  - `manifesto`

## 5. Migration priority

如果只按 Phase 0 的资料包结论来决定后续资产迁移优先级，建议如下：

1. 先迁移 `Be.cubes` 对应的 cube / innerobject / detail 资源
2. 再迁移 `Cubes` 的背景层与 blurry text 层
3. 再补 `Igloo` 的 glow / particles / mountain 类资源
4. 再补 `Entry` 的烟雾和 tunnel 粒子资源
5. 最后做 WebGL UI 与 volume-linked links

原因是第一步就能直接服务于首页到详情页的最小闭环。
