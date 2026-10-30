---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-29-ask-collaboration-mode

English | [中文](2026-10-29-ask-collaboration-mode.zh.md)

## Summary

Adds the log-only ask/mode event and the ask-mode user-message source attribution that ask mode records for its selections.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-29-ask-collaboration-mode
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "5b0459aac95c52f0a62649768438f9f419a47ced3b1e365f71757d29f1731674"
    decision: same-version
  - root: "event:ask/mode"
    previous: null
    after: "849a76618d96d7df4864738411c132065aa9cf7c6a8af740caa6d55a089de332"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "e93265dd44daff91fb859f51190058819279076c7b2cc40208b8c38aa7d1de53"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "ddff55ba04c22aea53f63ad1eb7f3012ed12d70c1d985de1e4e86f9a12436508"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-liveshare-share-viewer-principal"
    after: "c99ac89330771babf58309c019439e5ec722415439e6db7bf28987eb4002c868"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

A new root in the current Session format version: existing logs contain no ask/mode event and stay valid, while readers that predate it refuse a log carrying it, as every required-on-read event does. The ask-mode source variant only appears on messages this plugin writes, and current readers treat an unknown source kind as preserved attribution rather than rejecting the message; replay keeps the text unchanged. The variant changes the declared source union for user/message, developer/message, agent/inbox/spliced, and session/title-llm-request, but no existing value shape or discriminator changes, so a removed plugin yields the preceding union and the same logs. Ask mode is guidance only: it adds no tool and no request input besides the deployment-owned ask:policy system-prompt section, which is not persisted. No header, envelope, or migration is required.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/plan/ask-mode: 41 tests passed with 100% per-file coverage of packages/plan/ask-mode/src/index.ts. pnpm --silent run verify-persistence-changes --json classified exactly the five reported roots before this record was written.

<a id="dev-note"></a>
## Dev Note

None.
