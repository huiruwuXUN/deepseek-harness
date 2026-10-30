---
description: "Web GUI 的问答模式状态徽章：显示问答模式已开启并可将其关闭的 composer 控件；供问答模式的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ask

[English](README.md) | 中文

## 概述

问答模式让你请 agent 解释代码、诊断问题，而不改动文件。用 `/ask` 进入，用 composer 徽章退出，与计划模式的使用方式相同；两者互斥：选择其一即离开另一模式。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与 `ui-conversation` 及 `dsh-ask-mode` 一起挂载本插件；问答模式激活时，徽章随即占据 composer 的问答座位（plan 座位右侧）。经命令路径进入问答模式——从 composer 的 `+` Command 菜单选择「问答」，或键入 `/ask`——再用徽章将其关闭。

### 徽章显示什么

当有效目标为问答模式时，该座位渲染蓝色「问答」状态按钮——标签前是问号图标，按钮可用且被悬停或键盘聚焦时换成圆形 ×——点击执行 `/ask off`。否则座位保持为空：未组合 ask-mode 的宿主，或尚无会话的 Draft，都不显示任何内容。

### 失败

准入失败（`matched: false`、业务错误、传输故障）以内联错误呈现，徽章保持显示直至投影确认退出。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

徽章占据 conversation 声明的 `conversation.input.ask` 单实例座位；node 半部是空 apply（roster 行）。读取经 standard-kit 的 `useProjection` 走通用投影对：有效目标是 `pending ? !active : active`——折叠的宿主值而非客户端乐观态，因此到达的帧无论哪个方向都会纠正徽章。座位注入面携带一个动词 `exitAskMode`，经 `ctx.remote.commands.execute` 执行 `/ask off`，并把准入失败映射为一行内联错误。

组件即去掉审阅界面的计划徽章：一个状态按钮、一条命令、一行错误。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-ask-mode](../../plan/ask-mode/README.zh.md)——拥有问答模式、`/ask` 命令、投影与 policy 段。
- [ui-conversation](../ui-conversation/README.zh.md)——声明 composer 的 `conversation.input.ask` 座位。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 chip 派发的 `/ask off` 命令行：`dsh-ask-mode` 拥有该命令行驱动的模型可见 policy 段与已记录状态。

#### KV Cache 影响

进入或离开问答模式会改变活跃的 `ask:policy` 系统提示词段，因此改变请求前缀；chip 本身不添加任何提示词内容。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **问答模式是引导而非执行沙箱**——需要强制只读作答的部署必须组合独立的沙箱与审批策略。
- **徽章属于默认 composer**——待处理的涉及整个 composer 的交互（如 plan 评审）会临时取代 InputBar 及其徽章。
- **未激活时无问答控件**——入口使用共享 Command source；有能力但模式未激活的会话在工具行不显示问答入口。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
