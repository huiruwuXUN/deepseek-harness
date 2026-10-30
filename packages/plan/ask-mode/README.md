---
description: "Ask mode for users and maintainers choosing, configuring, or debugging the per-agent question-answering mode: deployment guidance, a /ask command, and no mutation tools enabled by policy."
kind: "package-reference"
---

# @deepseek-ai/dsh-ask-mode

English | [中文](README.zh.md)

## Summary

Ask mode asks an agent to answer questions and explain code instead of changing the repository. Enter it with `/ask`, optionally with a message or ordered image and file attachments; leave with `/ask off` or by selecting another collaboration mode. Deployment-defined guidance controls answering behavior, but every tool remains available, so use sandbox mode and approval prompts for enforced limits. Ask mode and plan mode are mutually exclusive, and the active state survives session resume and forks. Choose it when you want an explanation, a review, or a diagnosis without edits.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

When ask mode is active, the agent answers under your instructions and leaves the working tree alone. The common path: configure the guidance text, enter ask mode with `/ask`, then switch back when you want the change implemented.

### When to choose it

Choose ask mode when the agent should explain how something works, review a change, or diagnose a failure without touching files. It does not restrict the agent: every tool stays callable, so use sandbox mode and approval prompts when you need enforced limits. Skip it when the agent should act on your request immediately.

### Minimal configuration

The only required configuration is the guidance text the agent follows while answering; anything else you add fails at load.

```yaml
- name: '@deepseek-ai/dsh-ask-mode'
  config:
    section: |
      You are in ask mode. Answer questions and explain code without changing
      the repository.
```

| Field | Default | Meaning |
|---|---|---|
| `section` | required | Guidance rendered as the `ask:policy` prompt section while ask mode is active |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-ask-mode) is the exhaustive source for every accepted field and its JSDoc.

<a id="entering-and-leaving-ask-mode"></a>
### Entering and leaving ask mode

Type `/ask` to enter ask mode, or `/ask <message>` to enter with a question — the message becomes your next request under ask guidance. Type `/ask off` to leave ask mode directly; it also cancels an ask-mode entry that has not taken effect yet.

You can attach images and generic files to an `/ask` message, and they are included with it in selection order. `/ask off` with attachments is rejected before the mode changes. The `/ask` command is available wherever slash commands are supported, such as the Web client.

Selecting plan mode leaves ask mode. Entering ask mode leaves plan mode through the same service call `/ask` performs, so a session never carries both modes.

### Observing ask state

Interfaces can show whether ask mode is active and whether a mode change you requested is still waiting to take effect. The state is the same in every tab and survives restarts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package mirrors `dsh-plan-mode` with the reviewed exit removed: one log-only event, one projection unit, one prompt section, one command, and no tool. The [subsystem page](../../../docs/subsystems/ask-mode.md) owns the state model and the append rules.

### Design philosophy

Ask mode is guidance, not enforcement. The mode names an intent — explain, do not edit — and the prompt section carries it; sandbox and approval policies remain the only enforcement. Keeping the tool catalog identical across modes preserves request-cache stability, so the rules are stated in prose and the tools stay listed.

The state model drops everything plan mode needs for a reviewed exit. There is no `entered` flag (no tool is disclosed progressively), no review lifecycle, and no failure path besides an append failure, which leaves the selection pending for a later accepted in-turn pre-step.

### Durable state and step-boundary appends

`ask/mode` (`{ active: boolean }`) is a log-only, whole-value-replace session event. `set(agent, active)` applies it immediately when no turn is open and otherwise records it as a pending selection flushed by a prepended `agent/pre-step` listener, exactly as plan mode does. Selecting plan mode cannot reach into this package, so the ask projection resets itself: a committed `plan/mode` with `active: true` clears ask state, and ask mode does not resume when plan mode later exits.

### The `/ask` command

`/ask [off|message]` selects ask mode; a non-empty message is steered as the next ordinary logged user message under ask guidance. `/ask off` with attachments is rejected before the mode changes.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Ask mode subsystem page](../../../docs/subsystems/ask-mode.md) — logged state, the projection fold, and the mutual-exclusion rule.
- [dsh-plan-mode](../plan-mode/README.md) — the sibling collaboration mode whose reviewed exit ask mode does not have.
- [dsh-client-ui-ask](../../client/ui-ask/README.md) — the browser chip that leaves ask mode.

-----

<a id="model-experience"></a>
## Model Experience

### Ask policy system prompt

#### What the model sees

While ask mode is the effective target, the model sees the deployment's exact `section` text at first-party prompt order 550; inactive mode contributes no text, and another collaboration mode's guidance suppresses this section.

##### Configuration example

```markdown
You are in ask mode. Answer questions, explain code, and inspect the workspace without changing it.
```

#### Token effect

Inactive ask mode adds no tokens; active ask mode adds the configured section to every request.

#### KV Cache effect

Entering or leaving ask mode changes the active `ask:policy` section and therefore the request prefix. Every other request input stays identical.

### Human command

#### What the model sees

`/ask`, `/ask off`, and their terminal results stay outside model history. A non-empty suffix other than the exact `off` argument selects ask mode and then submits the trimmed text through `agent.steer()`, so it becomes the next step's ordinary logged user message; admitted image and file blocks are submitted in selection order before any text. An active `/ask off` selection contributes the standard logged user-switch notice only when the last request header described ask mode; cancelling a pending entry contributes none because no request observed it.

#### Token effect

The optional message costs the same history tokens as submitting that content separately; bare `/ask` and `/ask off` add none, and a narrated exit adds the small retained switch notice.

#### KV Cache effect

The switch notice sits in history, so it changes the request only from the point it is appended; the system prompt changes at the next request after the mode boundary lands.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ask mode is guidance, not an execution sandbox** — deployments that require enforced read-only answering must compose the independent sandbox and approval policies.
- **No reviewed exit** — unlike plan mode there is no tool, so the model cannot leave ask mode; the user leaves with `/ask off` or by selecting another mode.
- **Pending selections are process-local** — a selection made after a turn's final accepted pre-step is lost if the process exits before another accepted in-turn pre-step.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The mode was extracted as a second concrete collaboration case rather than a generic named-mode registry; see the plan-mode README's future note for the extraction rule that still applies.

</details>
