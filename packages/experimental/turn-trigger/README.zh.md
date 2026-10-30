---
description: "已完成回合的人类文本匹配所配置的模式时追加后续提示词，无需 Host 定时器或外部监视进程。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-turn-trigger

[English](README.md) | 中文

## 概述

回合触发器基于关闭回合的会话事件实现「这类回合之后做那件事」：回合完成时，插件用所配置的模式测试该回合由人类撰写的文本，一旦匹配，就在同一会话中追加一条后续提示词。自动化任务已经按挂钟选择器运行（`after_seconds`、`at`、`every_seconds`、`daily`、`weekly`、`cron`）；本插件覆盖由事件驱动的场景，因此不需要外部监视进程及其轮询间隔。触发器是实验性的：匹配范围过宽的规则会启动额外的模型回合，从而消耗 token。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

profile 行携带规则：

```yaml
- name: '@deepseek-ai/dsh-experimental-turn-trigger'
  config:
    rules:
      - id: plan-check
        match: '(/[^\s]*\.cursor/plans/[^\s]+\.plan\.md)'
        prompt: 'Review whether {match} is complete and report the unfinished items.'
        cooldownMinutes: 30
```

- `id` 在日志与框架文本中标识规则，且必须唯一。
- `match` 是 JavaScript 正则表达式源码，用于测试已完成回合的人类文本；若模式声明了捕获组 1，该组文本会插值进 `prompt`。
- `prompt` 是后续指令；`{match}` 插值匹配到的文本。
- `cooldownMinutes` 是同一会话中该规则两次触发之间的最小间隔；省略则在每次匹配的回合触发。

只有人类提示词会触发规则：其他生产者以用户角色注入的文本——定时提醒、目标回合、子目录指令以及本插件自身的后续提示词——会被忽略，因此已投递的检查不会再次触发自己。

### 安装到 profile

```sh
pnpm dsh plugin --profile web add ./packages/experimental/turn-trigger
```

该包声明了 `dsh.bundle.patch`，因此安装它会加入插件行；在 profile 的 `cordis.patch.yml` 中补充 `config.rules` 即可开启规则。没有规则的 profile 会以惰性方式加载本插件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

`src/config.ts` 在插件挂载时校验每条声明的规则并编译其模式，因此格式错误的规则在加载时即失败，而不是等到第一个完成的回合。`src/runtime.ts` 从 `user/message` 事件缓冲每个未关闭回合的人类文本，在 `turn/end` 且 `reason.kind === 'completed'` 时评估规则，并投递一条携带所有命中规则的 `agent.followup()` 消息。投递由 `ctx.sessions.flush` 确认；被拒绝或未确认的 flush 会让冷却保持开启，并在日志中报告失败。`src/framing.ts` 用规范 JSON 载荷渲染模型可见文本，因此匹配到的文本无法伪造框架行。

</details>

-----

<a id="model-experience"></a>
## 模型体验

### 回合结束触发器消息

#### 模型看到什么

投递的触发器是一条用户角色消息，来源类型为 `turn-trigger`，以 `[TURN-END TRIGGER]` 开头，并有一行声明它是自动投递而非人类输入。载荷列出每条命中规则的 id、有界的匹配文本与插值后的提示词，因此模型读到的是指令，而不是一轮对话。

#### Token 影响

每次投递都会增加一条简短的用户角色消息；匹配文本是有界的，因此宽泛的模式无法把整个回合无界地贴入上下文。

#### KV Cache 影响

投递落在已完成回合之后，因此此前的请求前缀不变；只有后续提示词之后的请求才会看到这条新增消息。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 规则位于 profile 组合中，而不在自动化任务页面：创建规则需要修改配置并重启应用，而不是填写 UI 表单。
- 冷却与回合缓冲都是进程本地的；重启即遗忘。
- 规则对挂载本插件的每个会话生效，没有按工作区划分的作用域。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

运行 `pnpm exec vitest run packages/experimental/turn-trigger` 执行本包的测试。

</details>
