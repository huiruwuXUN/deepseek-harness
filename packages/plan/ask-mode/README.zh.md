---
description: "问答模式（ask）的面向用户与维护者文档：可选择的按 agent 生效的问答模式，包含部署引导、`/ask` 命令，以及由策略而非工具禁用实现的只读约束。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ask-mode

[English](README.md) | 中文

## 概述

问答模式让 agent 回答问题、解释代码，而不改动仓库。用 `/ask` 进入，可附带消息或有顺序的图片与文件附件；用 `/ask off` 或切换到其他协作模式退出。行为由部署提供的引导文本控制，但所有工具仍可调用，需要强制限制时请组合沙箱模式与审批提示。问答模式与计划模式互斥，激活状态可跨会话恢复与分叉保留。需要解释、评审或诊断而不产生改动时选择它。

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

问答模式激活时，agent 在你的指示下作答并保持工作区不变。常见路径：配置引导文本，用 `/ask` 进入，需要实施时再切回。

### 何时选择它

当 agent 应解释某处如何工作、评审一项改动或诊断故障，且不应触碰文件时，选择问答模式。它不限制 agent：所有工具仍可调用，需要强制限制时请使用沙箱模式与审批提示。需要 agent 立即执行时不要使用它。

### 最小配置

唯一必填的配置是 agent 作答时遵循的引导文本；任何多余字段都会在加载时失败。

```yaml
- name: '@deepseek-ai/dsh-ask-mode'
  config:
    section: |
      You are in ask mode. Answer questions and explain code without changing
      the repository.
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `section` | 必填 | 问答模式激活时渲染为 `ask:policy` 提示词段的引导文本 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-ask-mode)是全部可接受字段及其 JSDoc 的完整来源。

<a id="entering-and-leaving-ask-mode"></a>
### 进入与退出问答模式

键入 `/ask` 进入问答模式，或用 `/ask <message>` 带一个问题进入——该消息会成为问答引导下的下一条请求。键入 `/ask off` 直接退出，也会取消尚未生效的进入操作。

`/ask` 消息可附带图片与通用文件，按选择顺序随消息一并进入。带附件的 `/ask off` 会在模式改变前被拒绝。`/ask` 命令在所有支持斜杠命令的界面可用，例如 Web 客户端。

选择计划模式会退出问答模式。进入问答模式同样通过 `/ask` 所用的服务调用退出计划模式，因此一个会话不会同时持有两种模式。

### 观察问答状态

界面可以显示问答模式是否激活，以及你请求的模式切换是否仍在等待生效。该状态在各标签页一致，并在重启后保留。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是去掉审阅式退出的 `dsh-plan-mode`：一个仅记日志的事件、一个投影单元、一个提示词段、一个命令，没有工具。[子系统页面](../../../docs/subsystems/ask-mode.zh.md)拥有状态模型与追加规则。

### 设计理念

问答模式是引导而非强制。模式表达意图——解释而不编辑，由提示词段承载；沙箱与审批策略仍是唯一的强制手段。保持工具目录在各模式间一致可维持请求缓存稳定，因此规则写在文本中，工具照常列出。

状态模型舍弃了计划模式为审阅式退出所需的全部字段：没有 `entered` 标志（没有逐步披露的工具），没有审阅生命周期，也没有除追加失败之外的失败路径——追加失败会让选择保持待定，等待之后某个被接受的中途 pre-step。

### 持久状态与步骤边界追加

`ask/mode`（`{ active: boolean }`）是仅记日志、整值替换的会话事件。没有进行中的回合时，`set(agent, active)` 立即应用；否则记录为待定选择，由前置的 `agent/pre-step` 监听器冲刷，与计划模式一致。选择计划模式无法回调本包，因此 ask 投影自行复位：已提交且 `active: true` 的 `plan/mode` 会清空问答状态，计划模式之后退出时问答模式不会自动恢复。

### `/ask` 命令

`/ask [off|message]` 选择问答模式；非空消息会经 steer 成为问答引导下的下一条普通已记录用户消息。带附件的 `/ask off` 在模式改变前被拒绝。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [问答模式子系统页面](../../../docs/subsystems/ask-mode.zh.md)——已记录状态、投影折叠与互斥规则。
- [dsh-plan-mode](../plan-mode/README.zh.md)——同级的协作模式，问答模式没有它的审阅式退出。
- [dsh-client-ui-ask](../../client/ui-ask/README.zh.md)——退出问答模式的浏览器徽章。

-----

<a id="model-experience"></a>
## 模型体验

### 问答策略系统提示词

#### 模型看到什么

问答模式为有效目标时，模型会在 first-party 提示词顺序 550 处看到部署方提供的原样 `section` 文本；未激活模式不贡献任何文本，其他协作模式的指引会压制该段落。

##### 配置示例

```markdown
You are in ask mode. Answer questions, explain code, and inspect the workspace without changing it.
```

#### Token 影响

未激活的问答模式不增加 token；激活的问答模式把已配置的段落加入每个请求。

#### KV Cache 影响

进入或退出问答模式会改变活跃的 `ask:policy` 段，因此改变请求前缀。其余请求输入完全不变。

### 人类命令

#### 模型看到什么

`/ask`、`/ask off` 及其终端结果留在模型历史之外。除恰好为 `off` 以外的非空后缀会在选择问答模式后，把去除首尾空白的文本通过 `agent.steer()` 提交，使其成为下一步的普通已记录用户消息；已准入的图片块与文件块按选择顺序排在文本之前。问答模式已激活时选择 `/ask off`，只会在最后记录的请求头描述了问答模式的情况下追加标准的已记录用户切换通知；取消待生效条目不贡献通知，因为没有请求观测到它。

#### Token 影响

可选消息的历史 token 成本与单独提交该内容相同；不带参数的 `/ask` 与 `/ask off` 不增加 token，带通知的退出会追加一条简短且会保留的切换通知。

#### KV Cache 影响

切换通知位于对话历史中，因此只从追加之处起改变请求；系统提示词在模式边界落地后的下一个请求改变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **问答模式是引导而非执行沙箱**——需要强制只读作答的部署必须组合独立的沙箱与审批策略。
- **没有审阅式退出**——与计划模式不同，这里没有工具，模型无法自行退出问答模式；用户用 `/ask off` 或切换模式退出。
- **待定选择只在进程内**——在回合最后一个被接受的 pre-step 之后做的选择，若进程在下一个被接受的中途 pre-step 之前退出，就会丢失。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

该模式作为第二个具体协作场景被抽取，而不是通用的命名模式注册表；抽取规则仍以 plan-mode README 的未来说明为准。

</details>
