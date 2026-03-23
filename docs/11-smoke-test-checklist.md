# Smoke Test Checklist

## 1. 文档目的

这份清单用于每次运行时重构之后，快速确认核心链路没有明显回归。

它不追求覆盖所有视觉细节，只覆盖最关键的“能不能正常跑”。

## 2. 启动

- 打开首页，boot loader 正常消失
- 首页首帧能看到 `igloo` section
- 控制台没有立即抛出运行时错误

## 3. 首页滚动

- 鼠标滚轮可以推动首页 section 变化
- 键盘 `ArrowUp / ArrowDown / PageUp / PageDown` 可以推动首页滚动
- 滚到 `cubes` 时没有明显卡死或黑屏
- 滚到 `entry` 时底部 HUD 正常出现
- 首页静止一段时间后，自动居中吸附仍然正常

## 4. Cubes 交互

- 在 `cubes` section 中移动鼠标时，hover project 正常变化
- hover 到可点对象时鼠标指针会变化
- 点击项目后进入 `/portfolio/:project`
- detail 打开时从 `cubes` 进入，没有明显断帧或跳变

## 5. Detail 开关

- 打开 detail 后，文案和 overlay 正常出现
- 按 `Esc` 可以返回首页
- 从 detail 返回后，首页 scroll 会回到之前位置
- 返回首页后，detail 状态会完全清空，不残留 focus

## 6. Entry 交互

- 在 `entry` section 中 hover link 时预览正常变化
- 点击或 cycle link 时当前 link 能切换
- `Visit` 链接仍然指向当前激活外链
- entry 中的音效触发频率正常，没有明显重复爆音

## 7. 音频

- 首次用户交互后，背景 loop 能正常解锁
- `mute/unmute` 正常工作
- 切到不同 section 时背景混音会变化
- 打开 detail 时 `enter-project` / `project-text` 正常触发
- 返回首页时 `leave-project` 正常触发

## 8. UI

- DOM HUD 与 WebGL HUD 没有明显冲突
- `igloo / cubes / entry` 三段的标签和提示文案正常切换
- detail 打开后，交互提示文案切换到返回语义

## 9. 当前重构阶段特别关注

如果这次改动涉及：

- `AudioController`
  - 重点确认 loop、one-shot、mute、visibility 行为
- `DetailTransitionState`
  - 重点确认 detail 开合时序与 UI reveal 阶段
- `MainController` / `coordinators`
  - 重点确认路由、指针、entry 外链和每帧状态同步
