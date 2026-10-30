# Ask Mode

English | [中文](ask-mode.zh.md)

Ask mode is logged per-agent collaboration state owned by [dsh-ask-mode](../../packages/plan/ask-mode) (`ctx.askMode`, `AskModeController`): while active, a deployment-owned guidance section is included in each model request, so the agent answers questions and explains code instead of changing the repository. Ask mode is **soft guidance**. [Sandbox mode](sandbox.md) and [approval policy](approval.md) enforce restrictions independently; neither reads or writes ask state, so deployments configure them separately. The package is optional, and the agent loop does not depend on it. It contributes the `ask:policy` prompt section and registers the `/ask` command; it registers no tool. Ask mode and [plan mode](plan.md) are mutually exclusive. The [package README](../../packages/plan/ask-mode/README.md) owns the configuration walkthrough, model-experience, and limitation detail.

Source: [`packages/plan/ask-mode/src/index.ts`](../../packages/plan/ask-mode/src/index.ts)

## Logged state and recovery

`ask/mode` (`{ active: boolean }`) is a log-only, whole-value-replace [session event](session.md): durable and replayable, never in the model transcript. The `ask` unit folds committed selection, command settlement, and the selection recorded at the latest request header. `ctx.askMode` requires the registry and awaits registration of `ask` and `turnBoundary` during activation, then reads through their retained handles. Clients receive only `{ active, pending }`; resume, fork, and compaction recover both from the log. The complete event declaration is in the [persistence log event catalog](../persistence-catalog.md).

## Pending selections and the pre-step append

Because every session event is turn-enclosed, a user selection remains pending until the next accepted in-turn pre-step appends it before request derivation, in whichever turn that occurs. A selection never forces continuation. `set(agent, active)` records the pending selection (a no-op when the target equals the logged-or-already-pending state), and `get(agent)` returns the logged state plus the selected state waiting to be appended.

The only append point while an agent is running is a prepended `agent/pre-step` listener. It observes every proposed request step, calls downstream listeners first, and appends only after they accept the step. An append failure cannot block the turn, and the selection remains pending for a later accepted in-turn pre-step. An appended user selection also records one plugin-sourced `user/message` notice, but only when the last logged request header described the other state.

## Mutual exclusion with plan mode

Selecting plan mode clears ask state without a second append: the `ask` fold resets on a committed `plan/mode` carrying `active: true`, and ask mode does not resume when plan mode later exits. Selecting ask mode leaves plan mode by calling the plan service's own `set(agent, false)`, so the plan projection folds the change and narrates it exactly as a `/plan off` selection. The plan guidance section is suppressed while ask mode is selected and the ask guidance section is suppressed while plan mode is selected or pending, so a session shows at most one collaboration policy.

## Configuration

```ts type-equiv
/** Deployment-owned ask guidance. */
interface AskModeConfig {
  /** Guidance rendered as the `ask:policy` prompt section while ask mode is active. */
  section: string
}
```

A missing, blank, or non-string `section` and any unknown key fail at plugin load rather than being ignored. While ask mode is active, the exact `section` text renders as the `ask:policy` [system-prompt section](system-prompt.md); inactive ask mode contributes no text.

## The `/ask` command

When [`ctx.commands`](commands.md) is composed, the plugin registers `/ask [off|message]`: bare `/ask` selects ask mode, any other non-empty message selects it and then submits the text through `agent.steer()` so it becomes the next step's ordinary logged user message under ask guidance, and the exact argument `off` selects inactive, which also cancels a pending entry before it is appended and becomes visible to a request. `/ask off` with attachments is rejected before the mode changes.

## The service

`ctx.askMode` owns the logged ask state, applies and narrates selected state at step start, and owns the `ask:policy` section and the `/ask` command; `get`/`set` signatures are in the generated [service catalog](#ctxaskmode--askmodecontroller).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.md)

Source: [`packages/plan/ask-mode/src/index.ts`](../../packages/plan/ask-mode/src/index.ts)
<!-- END GENERATED cordis-surface -->
