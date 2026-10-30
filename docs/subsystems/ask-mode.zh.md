# 问答模式

[English](ask-mode.md) | 中文

问答模式是由 [dsh-ask-mode](../../packages/plan/ask-mode)（`ctx.askMode`、`AskModeController`）拥有的、按 agent 记录的协作状态：激活期间，每次模型请求都会包含一段部署提供的引导文本，使 agent 回答问题、解释代码而不是改动仓库。问答模式是**软引导**。[沙箱模式](sandbox.zh.md)与[审批策略](approval.zh.md)独立实施限制；两者都不读写问答状态，因此部署需要分别配置。该包是可选的，agent loop 不依赖它。它贡献 `ask:policy` 提示词段并注册 `/ask` 命令；不注册任何工具。问答模式与[计划模式](plan.zh.md)互斥。[包 README](../../packages/plan/ask-mode/README.zh.md) 拥有配置说明、模型体验与限制细节。

来源：[`packages/plan/ask-mode/src/index.ts`](../../packages/plan/ask-mode/src/index.ts)

## 已记录状态与恢复

`ask/mode`（`{ active: boolean }`）是仅记日志、整值替换的[会话事件](session.zh.md)：持久、可重放，从不进入模型对话记录。`ask` 单元折叠已提交的选择、命令结算，以及最近一次请求头处记录的选择。`ctx.askMode` 需要注册表，并在激活期间等待 `ask` 与 `turnBoundary` 注册完成，之后通过保有的句柄读取。客户端只收到 `{ active, pending }`；恢复、分叉与压缩都从日志重建二者。完整事件声明见[持久化日志事件目录](../persistence-catalog.zh.md)。

## 待定选择与 pre-step 追加

由于每个会话事件都封闭在回合内，用户选择在被接受的中途 pre-step 于请求派生之前追加它之前一直处于待定，无论那发生在哪个回合。选择从不强制续跑。`set(agent, active)` 记录待定选择（当目标等于已记录或已待定的状态时为空操作），`get(agent)` 返回已记录状态加上等待追加的选择状态。

agent 运行期间唯一的追加点是一个前置的 `agent/pre-step` 监听器。它观察每个提议的请求步骤，先调用下游监听器，仅在其接受该步骤后才追加。追加失败不会阻塞回合，选择保持待定，等待之后某个被接受的中途 pre-step。追加的用户选择还会记录一条插件来源的 `user/message` 通知，但仅当最近一次记录在案的请求头描述的是另一种状态时。

## 与计划模式的互斥

选择计划模式会清空问答状态，无需第二次追加：`ask` 折叠在携带 `active: true` 的已提交 `plan/mode` 上复位，且计划模式之后退出时问答模式不会自动恢复。选择问答模式则通过计划服务自身的 `set(agent, false)` 退出计划模式，因此计划投影会折叠这次变化，并像 `/plan off` 选择那样叙述它。问答模式被选中期间计划引导段被抑制，计划模式被选中或待定期问答引导段被抑制，因此一个会话至多显示一种协作策略。

## 配置

```ts type-equiv
/** Deployment-owned ask guidance. */
interface AskModeConfig {
  /** Guidance rendered as the `ask:policy` prompt section while ask mode is active. */
  section: string
}
```

缺失、空白或非字符串的 `section`，以及任何未知键，都会在插件加载时失败而不是被忽略。问答模式激活期间，`section` 的原文会作为 `ask:policy` [系统提示词段](system-prompt.zh.md)渲染；未激活时不贡献任何文本。

## `/ask` 命令

组合 [`ctx.commands`](commands.zh.md) 后，插件注册 `/ask [off|message]`：裸 `/ask` 选择问答模式；其他任何非空消息先选择该模式，再通过 `agent.steer()` 提交该文本，使其成为问答引导下下一步的普通已记录用户消息；精确参数 `off` 选择未激活，同时取消尚未追加、尚未对请求可见的待定进入。带附件的 `/ask off` 会在模式改变前被拒绝。

## 服务

`ctx.askMode` 拥有已记录的问答状态，在步骤开始时应用并叙述所选状态，并拥有 `ask:policy` 段与 `/ask` 命令；`get`/`set` 签名见生成的[服务目录](#ctxaskmode--askmodecontroller)。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxaskmode--askmodecontroller"></a>

### `ctx.askMode` — `AskModeController`

`ctx.askMode`: owns logged ask state, applies and narrates selected state at step start, and owns the `ask:policy` section and the `/ask` command. Ask and plan are mutually exclusive: selecting ask leaves plan, and a logged plan entry clears ask through the projection fold. Client carriers expose the projection's cropped `{ active, pending }` view. Agent prompt assembly fails while the projection reader is not ready; callers must await plugin activation before running an agent.

```ts cordis-catalog
/**
 * Read the logged ask state and any selected state awaiting the next
 * accepted in-turn pre-step.
 *
 * @param agent The agent to read.
 * @returns Current logged state plus a pending selection, when present.
 */
get(agent: Agent): { active: boolean; pending?: boolean }

/**
 * Select whether ask mode should be active. Between turns the method appends
 * the change immediately because no in-turn pre-step will run until another
 * prompt starts a turn. The open-turn fold is the idle signal: agent status
 * stays `running` through post-turn checkpointing, when no further in-turn
 * pre-step runs. During an open turn the selection remains pending until the
 * next accepted in-turn pre-step. Selecting ask mode also leaves plan mode,
 * because the two are mutually exclusive. Repeated selection of the current
 * or already-pending state is a no-op.
 *
 * @param agent The agent to switch.
 * @param active Whether ask mode should be active.
 * @returns what happened: `committed` (logged now), `queued` (awaiting the
 * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
 * was cleared; the logged state already matches), or `noop` (already in that
 * state).
 */
set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop'
```

Types: [Agent](core.zh.md)

Source: [`packages/plan/ask-mode/src/index.ts`](../../packages/plan/ask-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
