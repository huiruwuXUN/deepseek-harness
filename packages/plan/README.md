---
description: "Package map for the plan group: the plan-mode and ask-mode collaboration states that guide the agent before it acts, for users and maintainers navigating the group."
kind: "package-group"
---

# plan/ — collaboration state

English | [中文](README.zh.md)

## Summary

The `plan/` group provides two collaboration modes that steer the agent through deployment-written instructions. Plan mode explores and designs before executing: you enter and leave it with the `/plan` command, and the agent presents the finished plan for your approval before carrying it out. Ask mode answers and explains: you enter and leave it with the `/ask` command, and the agent investigates without changing the repository. The two modes are mutually exclusive. Both guide rather than restrict: every tool stays available, and limits such as sandbox mode and approval prompts are configured separately.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Each package owns one collaboration mode; the subsystem references own the exhaustive contracts, and the packages share no registry.

| Package | Role | ctx key |
|---|---|---|
| [`plan-mode/`](plan-mode/README.md) | Provides plan mode: `/plan` enters and leaves it, deployment guidance steers the agent while planning, and `exit_plan_mode` presents the finished plan for your review | `ctx.planMode` |
| [`ask-mode/`](ask-mode/README.md) | Provides ask mode: `/ask` enters and leaves it, and deployment guidance steers the agent to answer questions and explain code without changing the repository | `ctx.askMode` |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem references for the shared vocabulary, then read the package READMEs for configuration and limitations.

- [Plan mode subsystem reference](../../docs/subsystems/plan.md) — how plan mode works, its configuration, and the exit tool's behavior.
- [Ask mode subsystem reference](../../docs/subsystems/ask-mode.md) — how ask mode works, its configuration, and its mutual exclusion with plan mode.
- [Plan-specific collaboration state](plan-mode/README.md) — the design decision behind plan mode.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
