# Igloo Rebuild 文档索引

这套文档对应的是当前 `igloo-rebuild` 代码本身，而不是早期阶段性的迁移计划或原版 bundle 笔记。

目标有 3 个：

1. 让后来接手的人能快速看懂当前工程结构。
2. 让后续继续迁移原版效果时，有一份稳定的模块地图可对照。
3. 让文档始终跟着当前代码走，而不是停留在旧计划上。

## 建议阅读顺序

1. [01-system-overview.md](./01-system-overview.md)
   系统总览、模块边界、核心对象关系。
2. [02-runtime-flow.md](./02-runtime-flow.md)
   从应用启动到每帧更新的完整运行时链路。
3. [03-content-and-assets.md](./03-content-and-assets.md)
   内容模型、资源清单、加载契约。
4. [04-scenes-overview.md](./04-scenes-overview.md)
   顶层 scene 的职责划分。
5. [05-entry-scene.md](./05-entry-scene.md)
   `EntryScene` 的详细拆解与当前迁移形态。
6. [06-ui-and-debug.md](./06-ui-and-debug.md)
   DOM HUD、WebGL HUD、调试面板与调参入口。
7. [07-source-map.md](./07-source-map.md)
   `src/` 全量源码索引。
8. [08-public-assets.md](./08-public-assets.md)
   `public/` 资源目录、压缩格式与当前静态资源使用方式。

## 当前工程一句话概括

当前重建版延续了原站的运行时形状，核心由这些部分组成：

- `Engine`
  统一管理渲染器、尺寸和帧循环。
- `MainController`
  统一编排路由、滚动、scene、UI、音频。
- 3 个首页主场景
  `IglooScene`、`CubesScene`、`EntryScene`。
- 1 个详情 overlay
  `DetailScene`。
- 2 套 HUD
  `UIScene` 和 `WebGLUiScene`。
- 1 套内容与资源层
  由 `siteContent` 和 `assetManifest` 提供。

## 代码主入口

- 应用入口：`src/main.js`
- 顶层控制器别名：`src/controllers/SiteController.js`
- 实际主控制器：`src/runtime/MainController.js`

## 这套文档覆盖什么

覆盖：

- 当前模块职责
- 模块之间的数据流
- scene 与 runtime 的边界
- 内容与资源的组织方式
- 当前迁移版实现里值得记录的关键约定

不覆盖：

- 原版 bundle 的逐函数逆向笔记
- 已过时的阶段性计划文档
- 已删除实验代码的历史记录

## 维护规则

新增 `src/` 文件时，同步更新 [07-source-map.md](./07-source-map.md)。
某个模块边界有明显变化时，同步更新对应专题文档。
