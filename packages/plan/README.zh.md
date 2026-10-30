---
description: "plan 组的包映射：在 agent（智能体）行动前引导它的计划模式与问答模式两种协作状态，供用户和维护者浏览该组。"
kind: "package-group"
---

# plan/：协作状态

[English](README.md) | 中文

## 概述

`plan/` 组提供两种由部署写入的指令引导 agent 的协作模式。计划模式先探索和设计再执行：你用 `/plan` 命令进入和离开，agent 在执行前把完成的计划呈交你批准。问答模式负责回答与解释：你用 `/ask` 命令进入和离开，agent 只做调研而不改动仓库。两种模式互斥。二者都是引导而非限制：每个工具仍然可用，沙箱模式与审批提示等限制需另行配置。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

每个包拥有一种协作模式；完整约定以各自的子系统参考为准，两个包之间没有共享注册表。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`plan-mode/`](plan-mode/README.zh.md) | 提供计划模式：`/plan` 进入和离开，部署写入的指令在规划期间引导 agent，`exit_plan_mode` 把完成的计划呈交你评审 | `ctx.planMode` |
| [`ask-mode/`](ask-mode/README.zh.md) | 提供问答模式：`/ask` 进入和离开，部署写入的指令引导 agent 回答问题、解释代码而不改动仓库 | `ctx.askMode` |

-----

<a id="related-documentation"></a>
## 相关文档

先从子系统参考了解共享词汇，再阅读各包 README 了解配置与限制。

- [计划模式子系统参考](../../docs/subsystems/plan.zh.md)——计划模式如何工作、其配置与退出工具的行为。
- [问答模式子系统参考](../../docs/subsystems/ask-mode.zh.md)——问答模式如何工作、其配置以及与计划模式的互斥。
- [plan 专用协作状态](plan-mode/README.zh.md)——计划模式背后的设计决策。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
