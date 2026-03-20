# public 资源目录说明

这份文档专门解释当前工程的 `public/` 目录：

- 为什么这里会出现 `ktx2`、`drc`、`exr` 这类格式
- `public/` 下面每个子目录分别做什么
- 当前工程到底实际用了哪些静态资源
- 哪些资源已经被重建工程接管，哪些还只是过渡状态

## 1. 为什么不是普通 png、jpg、glb

当前 `public/` 里的很多资源不是“创作源文件”，而是“网页上线时更适合交付给浏览器的运行时资源”。

也就是说，这里保存的不是最方便人工编辑的格式，而是更偏生产环境的格式。

典型原因有：

- 下载体积更小
- 浏览器端加载更快
- GPU 纹理占用更友好
- 某些资源本来就是数据纹理或 volume 数据，不是普通图片
- 某些模型带有自定义 attribute，不只是常规 position/normal/uv

当前工程的加载器链路也直接说明了这一点：

- `DRACOLoader`
  用来解码 Draco 几何
- `KTX2Loader`
  用来加载 KTX2 压缩纹理
- `EXRLoader`
  用来加载 HDR 环境图

对应代码在：

- `src/core/AssetRegistry.js`

## 2. 当前几种主要资源格式

### 2.1 `drc`

`drc` 是 Draco 压缩后的几何格式。

在当前工程里，它的意义基本等同于：

- “压缩过的模型几何”

浏览器运行时会通过 Draco decoder 把它还原成 Three.js 可用的 `BufferGeometry`。

这类文件通常出现在：

- `public/reference-assets/geometries/`

### 2.2 `ktx2`

`ktx2` 是 KTX2 纹理容器。

在当前工程里，它并不只是“压缩版 png”，而可能承担多种角色：

- 常规 2D 颜色纹理
- normal / roughness 等材质纹理
- noise 纹理
- data texture
- 3D LUT
- 3D volume 数据
- UI datatexture
- 字体 atlas

因此看到大量 `ktx2` 是正常的，这恰恰说明这套资源更接近原站上线时的交付形态。

### 2.3 `exr`

`exr` 是 HDR 图像格式。

当前工程里主要用它来做：

- 环境贴图

比如：

- `public/reference-assets/images/cubes_env.exr`

### 2.4 `ogg`

`ogg` 是压缩音频格式。

当前工程里的背景音、UI 音效、entry 粒子音效等都使用它。

### 2.5 `json`

`json` 在 `public/` 里主要不是业务数据，而是辅助资源数据。

当前最典型的是：

- 字体 metrics

例如：

- `public/reference-assets/fonts/IBMPlexMono-Medium.json`

## 3. `public/` 目录总览

当前 `public/` 只有两大类内容：

- `decoders/`
- `reference-assets/`

## 4. `public/decoders/`

目录：

- `public/decoders/basis/`
- `public/decoders/draco/`

这部分不是视觉内容资源，而是资源解码依赖。

### 4.1 `basis/`

用途：

- 给 `KTX2Loader` 提供 Basis transcoder

当前文件：

- `basis_transcoder.js`
- `basis_transcoder.wasm`

如果没有这部分，浏览器端就无法正确转码很多 `.ktx2` 纹理。

### 4.2 `draco/`

用途：

- 给 `DRACOLoader` 提供 Draco decoder

当前文件：

- `draco_decoder.wasm`
- `draco_wasm_wrapper.js`

如果没有这部分，`.drc` 几何就无法被解码成 Three.js 可用的几何体。

## 5. `public/reference-assets/`

这部分才是当前工程真正使用的参考资源库。

它下面主要有这些目录：

- `audio/`
- `fonts/`
- `geometries/`
- `images/`
- `ui/`

## 6. `public/reference-assets/geometries/`

这里主要存放 `.drc` 几何资源，也就是压缩后的模型几何。

当前内容大致分为几类：

### 6.1 igloo 相关

例如：

- `igloo.drc`
- `mountain.drc`
- `ground.drc`
- `intro_particles.drc`
- `igloo/igloo_outline.drc`
- `igloo/igloo_cage.drc`
- `igloo/patch.drc`

### 6.2 cubes 相关

例如：

- `cubes/cube1.drc`
- `cubes/cube2.drc`
- `cubes/cube3.drc`
- `cubes/background_shapes.drc`
- `blurrytext.drc`

### 6.3 entry 相关

例如：

- `floor.drc`
- `shattered_ring.drc`
- `shattered_ring2.drc`
- `smoke_trail.drc`
- `shattered_ring_smoke.drc`
- `ceilingsmoke.drc`

### 6.4 detail 相关

例如：

- `pudgy.drc`
- `overpass_logo.drc`
- `abstractlogo.drc`
- `blurrytext_cylinder.drc`

### 6.5 需要注意的点

有些几何不只是普通网格。
例如 `igloo-shell` 在资源清单里就声明了额外 attribute：

- `centr`
- `rand`
- `emission`
- `batchId`

这意味着它本来就是为了特定 shader/动画逻辑准备的“带数据几何”，不是普通导出的 glTF 替代品。

## 7. `public/reference-assets/images/`

这是当前最复杂、内容也最多的目录。

它下面既有普通材质贴图，也有运行时数据纹理。

### 7.1 `images/igloo/`

主要是 igloo scene 的贴图：

- 冰屋颜色
- 地面颜色
- 地面 glow
- 山体颜色
- 三角 tiling 贴图
- igloo scene LUT

### 7.2 `images/cubes/`

主要是 cubes scene 的贴图：

- cube 法线
- cube 粗糙度
- logo 内层颜色
- blurry text atlas
- dot pattern
- cube scene LUT

### 7.3 `images/detail/`

主要是 detail scene 用的数据与氛围纹理：

- `perlin-datatexture.ktx2`
- `caustics.ktx2`
- `bokeh.ktx2`

### 7.4 `images/runtime/`

这部分不是某个单独 scene 的“美术贴图”，而是运行时共享数据：

- `scroll-datatexture.ktx2`
- `frost-datatexture.ktx2`

它们更偏“驱动逻辑的数据纹理”。

### 7.5 `images/noises/`

这里是通用噪声纹理，例如：

- 蓝噪声

### 7.6 `images/volumes/`

这里是 `EntryScene` 后半段最重要的一类资源。

例如：

- `peachesbody_64.ktx2`
- `x_64.ktx2`
- `medium_32.ktx2`

它们不是普通 2D 图，而是供粒子系统采样的 3D volume 数据。

所以你看到 entry 粒子系统在这边用的不是 png，而是 volume `ktx2`，这是正常的。

### 7.7 根目录下一些通用贴图

例如：

- `clouds_noise.ktx2`
- `wind_noise.ktx2`
- `floor_color.ktx2`
- `shattered_ring_color.ktx2`
- `shattered_ring_ao.ktx2`

这些通常被多个模块共享，或者虽然属于 entry / cubes / igloo，但被放在更上层位置。

## 8. `public/reference-assets/ui/`

这部分不是给 DOM `<img>` 用的普通 UI 图，而是给 WebGL HUD 使用的小型 datatexture。

当前包括：

- `logo-datatexture.ktx2`
- `sound-datatexture.ktx2`
- `arrow-datatexture.ktx2`
- `visit-datatexture.ktx2`

这些资源当前主要由 `WebGLUiScene` 消费。

## 9. `public/reference-assets/fonts/`

这里放的是 WebGL 文本相关资源。

当前有两类文件：

- `IBMPlexMono-Medium-datatexture.ktx2`
  字体 atlas
- `IBMPlexMono-Medium.json`
  字体 metrics

两者配合使用：

- atlas 给 shader/材质采样
- json 给排版、字形尺寸和字符映射提供数据

## 10. `public/reference-assets/audio/`

这里放的是当前已经被重建工程本地化接管的一部分音频资源。

目前包括：

- `particles.ogg`
- `ui-long.ogg`
- `ui-short.ogg`

它们分别主要服务于：

- entry 粒子段
- UI 长反馈
- UI 短反馈

## 11. 当前工程实际怎么使用这些资源

资源的主要入口是：

- `src/content/assetManifest.js`

它把资源分成 3 组：

- `geometry`
- `texture`
- `audio`

然后由：

- `src/core/AssetRegistry.js`

统一负责加载和缓存。

### 11.1 geometry

当前工程通过 manifest 明确注册了大量 `.drc` 文件，覆盖：

- `igloo`
- `cubes`
- `entry`
- `detail`

### 11.2 texture

当前 manifest 注册的静态图像资源主要包括：

- igloo 场景贴图
- cubes 场景贴图
- detail 噪声与氛围纹理
- runtime 数据纹理
- entry floor / ring / volume 资源
- UI datatexture
- 字体 atlas
- 1 张 EXR 环境图

### 11.3 audio

当前 manifest 中的音频来源分成两类：

- 已经在 `public/reference-assets/audio/` 下的本地音频
- 仍然直接指向 dump 目录外部路径的原始音频

这说明当前重建工程对音频资源的接管还是“部分完成”的状态。

## 12. 当前哪些资源是不走 `AssetRegistry` 的

不是所有 `public/` 文件都走 manifest。

当前最明显的例子是：

- 字体 metrics JSON

它不是通过 `AssetRegistry` 加载，而是由 `WebGLUiScene` 通过 `loadFontMetrics()` 直接 `fetch`。

所以你会看到：

- atlas 在 manifest 里
- metrics json 不在 manifest 里

这是当前实现的实际情况。

## 13. 当前资源状态的一句话判断

如果把当前 `public/` 资源状态概括成一句话，就是：

这不是“原始美术素材库”，而是“偏生产交付态的运行时资源库”，其中一部分已经完全纳入当前重建工程，一部分仍处于过渡接管状态。

## 14. 当前维护建议

### 14.1 新增资源时

建议顺序：

1. 先把文件放进 `public/reference-assets/` 的合适目录
2. 再在 `assetManifest.js` 里注册
3. 最后由 scene 或 runtime 通过 `assets.get()` 使用

### 14.2 不建议直接在 scene 里硬写路径

原因：

- 绕开缓存
- 绕开 preload
- 绕开统一统计
- 后续不利于文档维护

### 14.3 哪些情况可以直接从 `public/` 读

目前更合理的直接读取场景主要是：

- 少量 JSON 辅助数据
- manifest 尚未接管的临时文件

如果是常规贴图、几何、音频，最好还是统一走 manifest 和 `AssetRegistry`。
