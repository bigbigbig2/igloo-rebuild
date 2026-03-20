# Igloo Rebuild

This repository is the clean-room reconstruction workspace for the dumped `www.igloo.inc` production build.

## 文档

旧的阶段计划文档已经移除，当前统一使用一套直接对应现有代码的文档体系。

- `docs/README.md`
  - 文档索引与推荐阅读顺序。
- `docs/01-system-overview.md`
  - 系统总览与模块边界。
- `docs/02-runtime-flow.md`
  - 启动流程、滚动流程、路由流程与渲染编排。
- `docs/03-content-and-assets.md`
  - 内容模型、资源清单与加载契约。
- `docs/04-scenes-overview.md`
  - 顶层 scene 职责划分。
- `docs/05-entry-scene.md`
  - `EntryScene` 的详细拆解与迁移形态。
- `docs/06-ui-and-debug.md`
  - DOM HUD、WebGL HUD 与调试面板。
- `docs/07-source-map.md`
  - `src/` 源码索引。
- `docs/08-public-assets.md`
  - `public/` 资源目录、压缩格式与当前静态资源使用关系。

## Stack

- Vite
- Plain JavaScript
- Three.js

## Current Architecture

- `src/core/Engine.js`
  - Owns the renderer, resize flow and render loop.
- `src/core/Router.js`
  - Minimal runtime router for `/` and `/portfolio/:project`.
- `src/controllers/SiteController.js`
  - The top-level orchestrator.
  - Mirrors the original production controller shape:
    - home sections
    - detail route
    - UI overlay
    - scroll-driven section selection
- `src/scenes/`
  - `IglooScene`
  - `CubesScene`
  - `EntryScene`
  - `DetailScene`
  - `UIScene` (DOM overlay for now)
- `src/content/siteContent.js`
  - Reconstructed content layer.
- `src/content/assetManifest.js`
  - Original dump asset references, grouped by role.
- `src/runtime/MainController.js`
  - Central application orchestrator for scenes, route, scroll, UI, and audio.
- `public/decoders/`
  - Local Draco and Basis decoders copied from the production dump.
- `public/reference-assets/`
  - A curated subset of dumped `.drc`, `.ktx2` and `.exr` files used by the rebuilt scenes.

## Current Asset Pipeline

- `AssetRegistry` now preloads:
  - Draco geometry via `DRACOLoader`
  - KTX2 textures via `KTX2Loader`
  - EXR environment maps via `EXRLoader + PMREM`
- The reconstructed scenes now consume a real subset of the original dumped assets instead of placeholder primitives only.

## Why This Structure

The original site was a production bundle with a thin Svelte shell and a large runtime controller that managed:

- a WebGL runtime
- multiple section scenes
- a detail scene
- a UI layer
- route-driven scene switching

This repo starts by rebuilding that runtime shape first, then the real assets and shaders can be migrated into stable modules instead of staying trapped inside a single minified bundle.

## 文档维护规则

当 `src/` 下新增文件时，同步更新 `docs/07-source-map.md`。
当运行时边界或模块职责有明显变化时，同步更新 `docs/` 下对应专题文档。
