# Phase 0 Dossier

Phase 0 的目标是先把 dump 中最重要的事实整理成“逆向资料包”，而不是直接继续改运行时代码。

这一阶段只做 4 件事：

1. 确认原站数据结构
2. 确认路由与事件总线
3. 确认资源与音频角色
4. 确认首页与详情页切换时序

## Source of truth

- 原站 dump：`../www.igloo.inc/`
- 主运行时：`../www.igloo.inc/assets/App3D-5907d20f.js`
- 当前重建路线：`../reverse-engineering-roadmap.md`

## Deliverables

- `be-data-model.md`
  - `Be` 数据块结构、字段角色、迁移建议。
- `runtime-routing-events.md`
  - 路由、主控制器、场景注册表、关键事件列表。
- `assets-audio-map.md`
  - dump 资源规模、资源分类、代表性资源与场景职责、音频表。
- `scene-timing-notes.md`
  - 首页滚动、auto-center、detail 进出场的关键时序。

## Phase 0 结论

- 原站是“薄 HTML 壳 + 主 bundle + WebGL runtime controller”的结构，而不是 DOM-first 页面。
- `Be` 已经包含了当前 rebuild 缺失的大量真实内容，包括 manifesto、3 个 portfolio 项目、顶部 social、底部 links、默认音量与静音状态。
- 原站首页不是单场景切换，而是多 scene composer 合成，再通过 fullscreen material 做过渡和 detail overlay。
- 当前 `igloo-rebuild` 最适合的下一步仍然是 `Phase 1: 提取 Be 并替换 siteContent`。

## Recommended next task

- `Task 01`：从 `Be` 提取内容层，并在 `igloo-rebuild` 中建立适配层。
