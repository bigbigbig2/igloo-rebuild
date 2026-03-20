# 内容与资源

## 1. Content 层的职责

`src/content/` 这一层负责两件事：

1. 把从原站 dump 出来的业务数据整理成当前工程可消费的结构
2. 把当前重建工程真正会加载的几何、纹理、音频整理成 manifest

## 2. 数据来源链

### 2.1 原始数据

原始业务数据在：

- `src/content/raw/be.js`

这份数据是当前重建版的站点内容来源，包含：

- manifesto
- social
- cubes 项目列表
- entry 外链列表
- 音频默认开关

### 2.2 适配层

适配函数在：

- `src/content/adapters/beToSiteContent.js`

它把 `rawBe` 转换成当前工程的统一内容模型：

- `brand`
- `manifesto`
- `sections`
- `projects`
- `links`
- `audio`

### 2.3 最终内容对象

站点最终消费的是：

- `src/content/siteContent.js`

也就是：

`rawBe`
-> `adaptBeToSiteContent(rawBe)`
-> `siteContent`

## 3. `siteContent` 的结构

### 3.1 `sections`

首页 section 定义来自这里：

- `igloo`
- `cubes`
- `entry`

每个 section 至少有：

- `key`
- `label`
- `height`

其中 `height` 很关键，它决定了 `HomeSceneStack` 中这段 section 在首页滚动轴上的长度。

### 3.2 `projects`

`projects` 主要供以下模块消费：

- `CubesScene`
  生成 cube stack 和项目 pick 数据
- `DetailScene`
  打开单个项目详情
- `UIScene`
  渲染 project list 与 detail panel
- `WebGLUiScene`
  读取 cubes overlay 的标题元数据

### 3.3 `links`

`links` 主要供以下模块消费：

- `EntryScene`
  决定 active link、volume 粒子切换
- `UIScene`
  DOM 版 entry link 面板
- `WebGLUiScene`
  底部 entry HUD 文案

每个 link 当前至少包含：

- `label`
- `url`
- `vdb`
- `scale`

## 4. Asset Manifest

资产清单在：

- `src/content/assetManifest.js`

它目前把资产分成 3 组：

| Group | 用途 |
| --- | --- |
| `geometry` | Draco 几何 |
| `texture` | KTX2 纹理、3D LUT、EXR 环境贴图 |
| `audio` | OGG 音频 |

## 5. 资产分组约定

### 5.1 Geometry

geometry 主要按 scene 分段：

- `igloo`
- `cubes`
- `entry`
- `detail`

典型 key：

- `igloo-shell`
- `cube1`
- `floor`
- `ring`
- `pudgy`

### 5.2 Texture

texture 同样按 section 和 runtime/UI 角色分段：

- `igloo`
- `runtime`
- `cubes`
- `ui`
- `entry`
- `detail`

典型类型：

- 常规 2D KTX2
- `lut-3d`
- `exr-env`

### 5.3 Audio

audio 分组更偏业务语义：

- `global`
- `igloo`
- `cubes`
- `detail`
- `entry`
- `ui`

## 6. AssetRegistry 约定

资产由：

- `src/core/AssetRegistry.js`

统一加载。

### 6.1 初始化职责

`AssetRegistry.init(renderer)` 会初始化：

- `PMREMGenerator`
- `DRACOLoader`
- `KTX2Loader`
- `EXRLoader`

### 6.2 支持的加载能力

#### Geometry

- Draco 解码
- 支持自定义 attribute 映射

#### Texture

- KTX2 纹理
- 3D LUT 纹理
- EXR 环境贴图

#### Audio

音频清单本身不由 `AssetRegistry` 解码成 `AudioBuffer`，
而是由 `AudioController` 通过 manifest 中的 source 创建原生 `Audio` 元素。

## 7. 命名习惯

### 7.1 Scene / Section 命名

资产 key 通常带 scene 语义：

- `igloo-*`
- `entry-*`
- `detail-*`

### 7.2 UI 资源

UI 纹理统一在 `ui` section 下：

- `ui-logo`
- `ui-sound`
- `ui-arrow`
- `ui-visit`
- `ui-font-mono`

### 7.3 Entry Volume

`EntryScene` 的 volume 粒子使用：

- `entry-volume-peachesbody_64`
- `entry-volume-x_64`
- `entry-volume-medium_32`

这些资源不是普通 2D sprite，而是供 3D volume 采样的纹理数据。

## 8. 内容层与视觉层的边界

内容层应该只负责“是什么”，不负责“怎么画”。

例如：

- `siteContent.links[i].label`
  负责当前 link 的名称
- `EntryScene`
  决定这个 link 如何驱动粒子形体与 UI 展示

同理：

- `siteContent.projects`
  定义项目数据
- `CubesScene / DetailScene`
  决定项目在首页和详情页里的表现

## 9. 当前维护建议

### 9.1 新增内容字段

如果后续从原版继续提取字段，建议优先按这条链路加：

1. `raw/be.js`
2. `adapters/beToSiteContent.js`
3. 消费方 scene / UI

### 9.2 新增资产

建议按这条顺序加：

1. `public/reference-assets/` 放入文件
2. `assetManifest.js` 注册 key
3. 对应 scene 通过 `assets.get(group, key)` 消费

### 9.3 不建议直接在 scene 里写死绝对资源路径

原因：

- 会绕过 `AssetRegistry` 缓存
- 会破坏 preload 统计
- 会让调试和迁移状态失去统一入口

## 10. 相关延伸文档

如果你想继续看：

- `public/` 目录结构
- 为什么当前会使用 `ktx2`、`drc`、`exr`
- 当前哪些静态资源已经被工程接管

可以继续阅读：

- [08-public-assets.md](./08-public-assets.md)
