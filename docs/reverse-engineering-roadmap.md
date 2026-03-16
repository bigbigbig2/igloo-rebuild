# Igloo Reverse Engineering Roadmap

本文件用于沉淀 `https://www.igloo.inc/` 的逆向、迁移、复刻与重构路线。

目标不是一次性把页面“抄出来”，而是把已经 dump 下来的线上产物拆成一套可维护、可验证、可逐步还原的工程结构。

## 1. 项目边界

- 原站 dump：`../www.igloo.inc/`
- 重建工程：`./`
- 当前重建入口：`src/main.js`
- 当前主控：`src/controllers/SiteController.js`
- 当前资源管线：`src/core/AssetRegistry.js`

当前策略应明确分成两层：

1. **逆向层**：从 dump 中抽出数据结构、运行时结构、场景职责、事件流、资源映射。
2. **重建层**：在 `igloo-rebuild` 中按稳定模块重新实现，而不是继续依赖单个压缩 bundle。

## 2. 原站真实结构判断

根据 dump 分析，原站不是“普通 DOM 网站 + 少量 3D 点缀”，而是：

- 一个很薄的 HTML 壳
- 一个主入口脚本
- 一个大型 WebGL/App 运行时 bundle
- 一套独立的几何、纹理、字体、音频、解码器资源
- 一个事件总线驱动的场景控制器
- 一个路由系统，负责 `/` 与 `/portfolio/:project`

### 2.1 关键锚点

- HTML 壳：`../www.igloo.inc/index.html`
- 入口脚本：`../www.igloo.inc/assets/index-2d900c2d.js`
- 主运行时：`../www.igloo.inc/assets/App3D-5907d20f.js`

在主运行时中，目前已确认以下关键锚点：

- `Be` 数据块：约在 `App3D-5907d20f.js:32050`
- 音频控制器：约在 `App3D-5907d20f.js:32194`
- 场景注册表：约在 `App3D-5907d20f.js:44571`
- 主控制器：约在 `App3D-5907d20f.js:44576`
- 路由定义：约在 `App3D-5907d20f.js:44814`

## 3. 当前 `igloo-rebuild` 已完成内容

当前重建工程已经完成了第一阶段的“运行时骨架搭建”。

### 3.1 已完成

- 用 `Vite + Three.js + Plain JS` 建立独立重建工程
- 用 `Engine` 统一管理 renderer、resize、render loop
- 用 `Router` 管理 `/` 与 `/portfolio/:project`
- 用 `SiteController` 组织首页 section 与 detail route
- 用 `AssetRegistry` 打通 Draco / KTX2 / EXR 资源预载
- 已接入部分真实 dump 资源而不是纯占位几何体
- 已有 4 个主要场景雏形：
  - `IglooScene`
  - `CubesScene`
  - `EntryScene`
  - `DetailScene`
- 已有一个临时 DOM HUD 用于调试与内容展示

### 3.2 当前状态本质

现在的 `igloo-rebuild` 更接近：

- “可运行的 clean-room reconstruction workspace”

还不是：

- “对原站视觉、交互、音频、UI、shader 的 1:1 还原版”

## 4. 当前缺口

当前真正的差距不在“有没有模型”，而在下面 5 个层面。

### 4.1 数据层未完成

当前 `src/content/siteContent.js` 还是手写 placeholder。

但原站真实文案、日期、社媒、项目配置已经存在于 `Be` 中，包括：

- manifesto 标题与正文
- social links
- 3 个 portfolio 项目信息
- detail interior 的完整内容
- 音量与静音初始值

这意味着：

- 下一步不应该继续手写内容
- 而应该从 `Be` 提取真实数据，再做一层适配

### 4.2 运行时调度模型未对齐

当前 `igloo-rebuild` 仍是“单活跃场景 + 直接切换”的模式。

而原站更接近：

- 首页多个 scroll scene 并存
- 通过 composer / pass 渲染到纹理
- 用全屏材质混合当前 scene、下一 scene、detail scene
- 通过统一 scroll progress 驱动场景切换与自动居中

也就是说，后面最关键的架构改造点是：

- 从 `setScene(scene)` 过渡到“多场景合成 + scroll controller + detail overlay”

### 4.3 UI 层未对齐

当前 UI 是 DOM HUD，仅用于占位与调试。

原站 UI 明显属于 WebGL 文本与图标系统，涉及：

- datatexture
- MSDF / 字体 atlas
- UI icon datatexture
- UI shader 动效

因此当前 DOM HUD 最好继续保留为：

- 调试层 / 过渡层

而不是直接把它当最终 UI 实现。

### 4.4 音频层未接回

原站已有完整音频系统，至少包含：

- 背景氛围音
- section / project 交互音
- detail 进出场音
- UI 音
- 连续循环的环境层
- 按事件动态调节的 volume

当前重建工程虽然登记了少量音频文件，但尚未建立：

- audio manager
- event binding
- state-driven volume automation

### 4.5 视觉材质层未接回

当前多数场景仍使用 `MeshStandardMaterial` / `MeshPhysicalMaterial`。

原站则大量使用 shader、自定义 uniform、datatexture、噪声纹理、体积纹理与后处理混合。

因此材质层属于第二阶段的保真工作，而不是第一优先级。

## 5. 逆向工作的正确顺序

后续不要按“先做哪个画面最酷”来推进，而要按“依赖顺序”来推进。

正确顺序建议如下。

### Phase 0：建立逆向资料包

目标：把 dump 中最重要的信息提纯，避免每次都回 bundle 里重新找。

本阶段交付物：

- `Be` 数据结构说明
- 路由说明
- 事件总线关键事件列表
- 音频表
- 资源角色映射表
- 首页 / detail 切换时序说明

这一阶段只整理，不做重构。

### Phase 1：替换内容层

目标：去掉 `siteContent.js` 中的 placeholder，接入原站真实内容。

建议做法：

- 从 `Be` 中提取 manifesto / social / cubes / interior
- 在重建工程中建立一个“适配层”
- 输出成当前场景能消费的数据结构

这一阶段完成后，至少应实现：

- 首页文案真实化
- 3 个项目 title / date / hash / summary / links 真实化
- detail route 对应真实项目数据

### Phase 2：重构运行时主控

目标：把当前 `SiteController + Engine` 升级成更接近原站的调度模型。

建议目标结构：

- `MainController`
- `ScrollState`
- `HomeSceneStack`
- `DetailScene`
- `UIScene`
- `CompositePass` / `SceneBlender`

本阶段重点不是追求 1:1 视觉，而是把下面这些能力搭对：

- 首页 section 共存
- scroll progress 驱动切换
- 自动居中
- detail overlay 进入/退出
- route 与 scene 状态双向同步

### Phase 3：完成最小闭环

建议先只完成这一条用户路径：

1. 进入首页
2. 滚动到 cubes section
3. 点击项目
4. 进入 `/portfolio/:project`
5. detail scene 播放进场动画
6. 返回首页
7. 恢复 scroll 与首页状态

原因：

- 这是原站最关键的交互闭环
- 涉及数据、路由、场景、切换、音频、UI 状态
- 一旦闭环跑通，剩下都是局部质量提升

### Phase 4：按场景优先级迁移

推荐迁移顺序如下：

1. `CubesScene`
2. `DetailScene`
3. `IglooScene`
4. `EntryScene`
5. `UIScene`
6. Audio / Shader / PostFX 深化

原因：

- `Cubes + Detail` 与 portfolio route 直接相关，价值最高
- `Igloo` 更偏首页开场氛围，可在主链路稳定后细化
- `Entry` 更适合在整体滚动编排稳定后再补
- UI / Shader 过早推进会造成返工

### Phase 5：音频接回

当主状态机稳定后，再接音频系统。

建议音频实现原则：

- 所有播放都走统一 `AudioManager`
- 以事件驱动，不在场景里随意硬编码 `new Audio()`
- 区分 loop ambient 与 one-shot sfx
- 先接事件和音量，再细调音色与衰减

建议第一批接回的音频：

- `music-bg`
- `room-bg`
- `click-project`
- `enter-project`
- `leave-project`
- `project-text`
- `manifesto`

### Phase 6：shader / UI / 后处理保真

这是高成本阶段，不要提前做。

本阶段再推进：

- WebGL UI 文本与图标系统
- 自定义材质替换标准材质
- 场景合成 shader
- 特效纹理、噪声、体积纹理
- 风格化过渡与后处理

## 6. 推荐的工程拆分方式

为了后面便于我和你逐步推进，建议把重建工作拆成下面这些模块，而不是继续把逻辑堆进 `SiteController`。

### 6.1 数据模块

- `src/content/raw/`：原始抽取后的数据
- `src/content/adapters/`：把原始数据转换成 rebuild 结构
- `src/content/siteContent.js`：最终对外输出稳定结构

### 6.2 运行时模块

- `src/runtime/MainController.js`
- `src/runtime/ScrollController.js`
- `src/runtime/SceneState.js`
- `src/runtime/RouteSync.js`

### 6.3 渲染模块

- `src/render/Renderer.js`
- `src/render/SceneStack.js`
- `src/render/CompositePass.js`

### 6.4 资源模块

- `src/assets/AssetRegistry.js`
- `src/assets/AssetRoles.js`
- `src/assets/AssetManifest.js`

### 6.5 音频模块

- `src/audio/AudioManager.js`
- `src/audio/AudioEvents.js`

### 6.6 UI 模块

- `src/ui/debug/`：当前 DOM HUD 继续放这里
- `src/ui/webgl/`：未来真实 UI 单独实现

## 7. 每阶段完成标准

后面迁移时，每阶段都必须有“完成标准”，否则会一直处于半完成状态。

### Phase 1 完成标准

- `siteContent` 不再包含 placeholder 文案
- 项目 detail 文案、链接、日期来自原站数据
- 首页与详情页的数据来源统一

### Phase 2 完成标准

- 首页 section 切换不再依赖简单 `setScene()` 硬切
- scroll 状态与 route 状态能稳定同步
- detail 进入 / 退出是状态切换，不是临时 if/else patch

### Phase 3 完成标准

- 首页 → 项目详情 → 返回首页 全链路稳定
- 刷新 `/portfolio/:project` 时能正确进入 detail 状态
- invalid project route 能回退首页或进入兜底逻辑

### Phase 5 完成标准

- 关键交互音全部走统一事件总线
- 背景氛围音可开关、可调音量、可静音
- detail 进出场音触发时序稳定

### Phase 6 完成标准

- DOM HUD 不再承担正式展示职责
- 至少一块 UI 文本 / 图标成功迁移为 WebGL 实现
- 至少一个主要场景的材质由标准材质切换为 shader 驱动

## 8. 当前最推荐的立即行动顺序

如果按最稳妥的节奏推进，建议后续实际执行顺序为：

1. 抽取 `Be` 并建立数据适配层
2. 替换 `siteContent`
3. 整理原站事件总线与路由切换逻辑
4. 重构当前 `SiteController`
5. 搭建首页 scene stack / composite 思路
6. 跑通 homepage → project detail 最小闭环
7. 再接音频
8. 最后做 UI / shader 保真

## 9. 迁移原则

后续所有重构都尽量遵守下面原则：

- 先对齐结构，再对齐表现
- 先做最小闭环，再做全量还原
- 先做数据与状态机，再做 shader 和视觉 polish
- 保留当前 DOM HUD 作为调试工具，直到 WebGL UI 足够稳定
- 每次只迁移一个明确模块，避免“大爆改”
- 所有原站发现都先文档化，再编码实现

## 10. 后续协作方式

后面建议按以下节奏推进：

1. 先以本文件作为总路线图
2. 每次只选一个 Phase 或一个模块
3. 先做最小设计与拆分
4. 再落代码
5. 每一步完成后回写本文件或补充子文档

建议下一步优先任务：

- **Task 01：抽取 `Be` 数据并替换 `siteContent`**

这是整个后续迁移里最稳、最值、返工最少的一步。

## Execution Status

- `Task 01` 已完成
  - 已抽取 `Be` 的 manifesto、social、cubes、links、audio defaults
  - 已建立 `raw Be -> siteContent` 适配层
- `Task 02` 已完成
  - `CubesScene` 不再按 index 猜测 cube 资源，而是消费项目自己的 cube 配置
  - `DetailScene` 已开始消费项目自己的 detail geometry / texture / object scale
- `Task 03` 已完成
  - 已拆出 `ScrollState`、`RouteSync`、`HomeSceneStack` 作为 Phase 2 的运行时骨架
  - `SiteController` 已降为对 `MainController` 的导出别名，后续可继续平滑重构
- `Task 04A` 已完成
  - `Engine` 已支持渲染复合 view，不再只能 `setScene()` 单渲染
  - 首页已接入 `HomeSceneRenderer`，开始走统一渲染骨架而不是每帧硬切单场景
- `Task 04B` 已完成
  - 已接入 `detail overlay` 混合渲染，project route 不再直接硬切到单独 detail scene
  - `DetailScene` 已有基础入场/退场过渡参数，可用于打通最小闭环
- `Task 04C` 已完成
  - `CubesScene` 已开始对 detail route 做 focus 过渡：中心聚焦、相机推进、非选中项目弱化
  - project route 直达时会先对齐到 cubes section，再进入 detail overlay
- `Task 04D` 已完成
  - `CubesScene` 已接入第一批辅助层资源：`background_shapes` 与 `blurrytext`
  - `assetManifest` 已开始覆盖原站 cubes section 的辅助几何与纹理子集
- `Task 04E` 已完成
  - `CubesScene` 已支持 3D hover / pick，首页可直接点击 cube 进入 `/portfolio/:project`
  - DOM HUD 会同步 hovered project 与交互提示，最小闭环不再只依赖右侧 debug 卡片
- `Task 04F` 已完成
  - 进入 project route 前会记录首页 scroll snapshot，返回首页时恢复之前的 home 状态而不是硬回 cubes 起点
  - 直达或刷新 `/portfolio/:project` 时仍会兜底对齐到 cubes section，再进入 detail overlay
- `Task 04G` 已完成
  - `DetailScene` 已接入第一批辅助层：`blurrytext_cylinder`、halo / light column、ambient particles，detail overlay 不再只有单个模型
  - detail 视觉已开始参考原站的空间层级结构，而不是仅靠 DOM 详情卡承担项目存在感
- `Task 04H` 已完成
  - detail 过渡状态已拆成 overlay / focus / scene / UI 四段进度，`CubesScene`、`DetailScene`、`HomeSceneRenderer`、DOM HUD 不再共用一根生硬的 progress
  - DOM HUD 已改为延迟显现 / 延迟退场，开始更接近原站 detail 进入后再显示项目信息的时序
- `Task 04I` 已完成
  - `DetailScene` 已接入更接近原站的内部层级：background plane、lightshaft、lightplane、双层 particles，并开始消费 `perlin / caustics / bokeh` 贴图
  - detail 现在已具备按项目切换 framing preset 的能力，不同项目会带出不同的 object offset、halo / 光柱位置与 camera framing
- `Task 04J` 已完成
  - detail 主物体已从通用 `MeshPhysicalMaterial` 切换到更接近原站的 dark / noise / caustics shader staging，开始消费 `detail-perlin` 与 `detail-caustics`
  - 不同项目现在还会带出不同的材质参数 preset，例如 exposure、caustics strength 与 rim strength，而不再只有统一材质外观
- `Task 04K` 已完成
  - `CubesScene` 现在会导出选中 cube 的屏幕 handoff anchor，`DetailScene` 会从该 anchor 接入，不再像凭空出现在独立空间里
  - focused cube 在 detail 打开后段会减速、前推并淡出，同时 detail 辅助光层改为稍后揭示，首页到详情的接镜头感更连贯
- `Task 04L` 已完成
  - detail 的 secondary composition 已开始项目化：背景、halo、光柱、light plane、粒子、文字圆柱都支持按项目切换不同参数，而不再只是主物体一项发生变化
  - 现在不同项目已具备更明显的 detail 气质差异，例如粒子密度、文字圆柱节奏、辅助光层强度与背景占比都会变化
- `Task 04M` 已完成
  - DOM HUD 的 detail 卡片已拆成分段 reveal：title、summary、social、links、actions 会按 `detailUiProgress` 依次进入，而不再整块一起出现
  - 现在 HUD 的 detail 进入节奏已更贴近 3D detail scene 的 reveal 顺序，首页到项目详情的视觉层级更统一
- `Task 05A` completed
  - `IglooScene` now includes `igloo_cage`, `intro_particles`, and atmospheric `smoke / snow` layers, so the top home section is no longer only the dome, ground, and mountains
  - `IglooScene` now recomputes drift / reveal from stored base transforms, fixing long-run mountain and terrain-patch offset accumulation plus the ring opacity path
- `Task 05B` completed
  - `IglooScene` now exposes a lightweight intro / manifesto presentation state and uses a two-stage camera path, instead of a single linear camera lerp through the full section
  - DOM HUD now stages the `manifesto` title, text, and legal block from `Be`, so the top section behaves more like the original intro timing while keeping the debug overlay architecture
- `Task 05C` completed
  - Added runtime `scene transition state` so home sections can react differently when they are the current scene versus the incoming scene, instead of only receiving a raw `progress` value
  - Improved the `Igloo -> Cubes` handoff with a staged `CubesScene` entrance plus a dedicated composite shader treatment, so the top-to-portfolio transition reads closer to a composed section change than a plain crossfade
- `Task 06A` completed
  - `EntryScene` now uses a first-wave migrated structure with layered portal rings, additive forcefields, plasma disks, smoke trails, ground / ceiling smoke, room ring, and staged particles instead of a single ring plus random points
  - `EntryScene` now follows the original section rhythm more closely with progress windows for ring layers and an incoming handoff from `cubes`, while still staying inside the clean-room runtime architecture
- `Task 06B` completed
  - `CubesScene` now has an outgoing handoff to `EntryScene`, so the portfolio stack no longer just disappears when the home flow continues into the portal section
  - `HomeSceneRenderer` and `EntryScene` now include a dedicated `cubes -> entry` composite / pulse rhythm, making the last home transition read more like a staged portal entry than a generic scene swap
- `Task 06C` completed
  - `EntryScene` now exposes a lightweight presentation state for the portal core, link reveal, room ring, and interaction pulse, so HUD timing can stay aligned with the 3D section rhythm
  - DOM HUD now includes an `Entry` portal card driven by `Be.links`, which keeps the current debug-overlay strategy while restoring the last section's outbound-link intent
