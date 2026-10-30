---
description: "Ask-mode status chip for the Web GUI: the composer control that shows ask mode is on and turns it off; for users and maintainers of ask mode."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-ask

English | [中文](README.zh.md)

## Summary

Ask mode lets you ask the agent to explain code and diagnose problems without changing files. Enter with `/ask` and leave with the composer chip, the same way Plan mode works, and the two are mutually exclusive: selecting one leaves the other.

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

Mount this plugin alongside `ui-conversation` and `dsh-ask-mode`; the chip then occupies the composer's ask seat to the right of the plan seat whenever ask mode is active. Enter ask mode through the command path — choose Ask from the composer's `+` Command menu or type `/ask` — and turn it off with the chip.

### What the chip shows

While the effective target is ask mode, the seat renders the blue "Ask" status button — the question glyph ahead of the label, swapped for a circled cross while the enabled button is hovered or keyboard-focused — which executes `/ask off`. Otherwise the seat stays empty: a host without ask mode, or a Draft with no session, shows nothing.

### Failures

Admission failures (`matched: false`, business errors, transport faults) surface as an inline error and the chip stays until the projection confirms the exit.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The chip occupies the conversation-declared `conversation.input.ask` single seat; the node half is an empty apply (the roster row). Reads ride the generic projection pair through the standard-kit `useProjection`: the effective target is `pending ? !active : active` — a folded host value, not client optimism, so an arriving frame corrects the chip either way. The seat's injected face carries one verb, `exitAskMode`, which executes `/ask off` through `ctx.remote.commands.execute` and maps admission failures to an inline error line.

The component is the plan chip with the review surface removed: one status button, one command line, one error line.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-ask-mode](../../plan/ask-mode/README.md) — owns ask mode, the `/ask` command, the projection, and the policy section.
- [ui-conversation](../ui-conversation/README.md) — declares the composer's `conversation.input.ask` seat.
- [Client package map](../README.md) — adjacent browser UI packages.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the `/ask off` command line the chip dispatches: `dsh-ask-mode` owns the model-visible policy section and the logged state that line drives.

#### KV Cache effect

Entering or leaving ask mode changes the active `ask:policy` system-prompt section and therefore the request prefix; the chip itself adds no prompt content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Ask mode is guidance, not an execution sandbox** — deployments that require enforced read-only answering must compose the independent sandbox and approval policies.
- **The chip belongs to the default composer** — a pending whole-composer interaction such as plan review temporarily replaces the InputBar and its chip.
- **No inactive ask control** — entry uses the shared Command source; a session with the capability but inactive mode shows no ask affordance in the tool row.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
