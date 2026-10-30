---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-29-ask-collaboration-mode

[English](2026-10-29-ask-collaboration-mode.md) | 中文

## 概述

新增仅记录用的 ask/mode 事件，以及问答模式在选择时记录用户消息的 ask-mode 来源归属。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

当前 Session 格式版本中的新根：已有日志不含 ask/mode 事件，仍然有效；早于该事件的读取方会拒绝携带它的日志，与所有 required-on-read 事件一致。ask-mode 来源变体只出现在该插件写入的消息上，当前读取方把未知来源种类视为保留的归属信息而非拒绝该消息，回放时文本不变。该变体会改变 user/message、developer/message、agent/inbox/spliced 与 session/title-llm-request 的声明来源联合类型，但不改变任何既有取值形态或判别字段，因此移除该插件后联合类型回到此前状态，日志保持一致。问答模式只是引导：它不新增工具，除部署提供的 ask:policy 系统提示词段（不持久化）外不新增任何请求输入。无需变更头部、信封或迁移。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/plan/ask-mode：41 个测试通过，packages/plan/ask-mode/src/index.ts 达到 100% 单文件覆盖率。pnpm --silent run verify-persistence-changes --json 在本记录写入前恰好分类出这五个根。

<a id="dev-note"></a>
## 开发备注

无。
