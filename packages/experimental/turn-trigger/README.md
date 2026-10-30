---
description: "Run a configured follow-up prompt when a completed turn's human text matches a pattern, without a Host timer or an external watcher."
kind: "package-bundle"
---

# @deepseek-ai/dsh-experimental-turn-trigger

English | [中文](README.zh.md)

## Summary

Turn-trigger automates "after this kind of turn, do that" on the Session event that closes a turn: when a turn completes, the plugin tests the human-authored text of that turn against configured patterns and, on a match, enqueues one follow-up prompt in the same Session. Automation tasks already run on wall-clock selectors (`after_seconds`, `at`, `every_seconds`, `daily`, `weekly`, `cron`); this plugin covers the event-driven case, so an external watcher process and its polling interval are unnecessary. Triggers are experimental: a rule that matches too broadly starts extra model turns, which costs tokens.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

A profile row carries the rules:

```yaml
- name: '@deepseek-ai/dsh-experimental-turn-trigger'
  config:
    rules:
      - id: plan-check
        match: '(/[^\s]*\.cursor/plans/[^\s]+\.plan\.md)'
        prompt: 'Review whether {match} is complete and report the unfinished items.'
        cooldownMinutes: 30
```

- `id` names the rule in logs and framing, and must be unique.
- `match` is a JavaScript regular expression source tested against the completed turn's human text; capture group 1, when the pattern declares one, is the text interpolated into `prompt`.
- `prompt` is the follow-up instruction; `{match}` interpolates the matched text.
- `cooldownMinutes` is the minimum gap between two firings of this rule in one Session; omit it to fire on every matching turn.

Only human prompts trigger a rule: text another producer injected on the user role — scheduled reminders, goal rounds, subdirectory instructions, and this plugin's own follow-ups — is ignored, so a delivered check cannot retrigger itself.

### Install into a profile

```sh
pnpm dsh plugin --profile web add ./packages/experimental/turn-trigger
```

The package declares `dsh.bundle.patch`, so installing it adds the plugin row; add `config.rules` to the profile's `cordis.patch.yml` to switch rules on. A profile with no rules loads the plugin inertly.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`src/config.ts` validates every declared rule when the plugin mounts and compiles its pattern, so a malformed rule fails at load instead of on the first finished turn. `src/runtime.ts` buffers the human text of each open turn from `user/message` events, evaluates the rules on `turn/end` with `reason.kind === 'completed'`, and delivers one `agent.followup()` message carrying every rule that matched. Delivery is acknowledged by `ctx.sessions.flush`; a rejected or unacknowledged flush leaves the cooldown open and reports the failure in the log. `src/framing.ts` renders the model-visible text with a canonical JSON payload, so matched text cannot forge framing lines.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Turn-end trigger message

#### What the model sees

A delivered trigger is one user-role message whose source kind is `turn-trigger`, opening with `[TURN-END TRIGGER]` and a line stating that it is automated rather than human. The payload lists each matched rule's id, the bounded matched text, and the interpolated prompt, so the model reads an instruction rather than a conversation turn.

#### Token effect

Every delivery adds one short user-role message; the matched text is bounded, so a broad pattern cannot paste an unbounded turn into context.

#### KV Cache effect

The delivery lands after the completed turn, so the preceding request prefix is unchanged; only requests after the follow-up see the added message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Rules live in the profile composition, not in the Automation tasks page: creating a rule needs a configuration edit and an application restart, not a UI form.
- Cooldowns and turn buffers are process-local; a restart forgets them.
- Rules apply to every Session that mounts the plugin, with no per-Workspace scoping.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Run `pnpm exec vitest run packages/experimental/turn-trigger` for the package's specs.

</details>
