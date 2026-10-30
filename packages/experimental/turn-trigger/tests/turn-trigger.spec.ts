import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import * as turnTrigger from '../src/index.ts'
import { MAX_MATCHED_TEXT_CHARS } from '../src/index.ts'
import { Config, resolveTurnTriggers } from '../src/config.ts'
import type { ResolvedTurnTrigger } from '../src/config.ts'
import { matchedTextOf, renderTriggerFraming } from '../src/framing.ts'
import { installTurnTriggers } from '../src/runtime.ts'
import type { TurnTriggerSurface, TurnTriggerTarget } from '../src/runtime.ts'

const PLAN_PATH = '/Users/example/.cursor/plans/numbering_title_hierarchy_10b464e5.plan.md'
const PLAN_RULE = {
  id: 'plan-check',
  match: '(/[^\\s]*\\.cursor/plans/[^\\s]+\\.plan\\.md)',
  prompt: 'Check whether {match} is finished.',
  cooldownMinutes: 30,
}
const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** One entry of the framing payload, mirroring the contract the assertions read. */
interface FramingEntry {
  rule_id: string
  matched_text: string
  prompt: string
}

/**
 * Decode the canonical payload line of one framed message.
 * @param text - Framed message text as delivered to the Agent.
 * @returns The decoded payload entries.
 */
function framingPayload(text: string): readonly FramingEntry[] {
  const encoded = text.split('triggers_json: ').at(1) ?? '[]'
  const decoded: unknown = JSON.parse(encoded)
  return decoded as readonly FramingEntry[]
}

/** One human prompt carrying `text` as its only content block. */
function human(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

/** One prompt another producer injected on the user role. */
function injected(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'turn-trigger', ruleIds: ['plan-check'] } })
}

/** Test harness: real Session events, stubbed Agent lookup and flush. */
interface Harness {
  readonly session: Session
  readonly followups: UserMessage[]
  readonly warnings: string[]
  readonly surface: TurnTriggerSurface
  dispose(): void
}

/**
 * Build the event source every harness shares: a real Session whose appends
 * publish `session/event` on the Context.
 * @param rules - Compiled rules installed in the harness.
 * @param options - Agent override, flush override, and whether to install through the plugin.
 */
async function harness(
  rules: readonly ResolvedTurnTrigger[],
  options: {
    agent?: boolean
    flush?: () => Promise<boolean>
    install?: (surface: TurnTriggerSurface) => () => void
  } = {},
): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId(`turn-trigger-${contexts.length}`))
  const followups: UserMessage[] = []
  const warnings: string[] = []
  const target: TurnTriggerTarget = {
    session,
    followup(message) { followups.push(message) },
  }
  const surface: TurnTriggerSurface = {
    onSessionEvent: listener => ctx.on('session/event', listener),
    agentFor: () => options.agent === false ? undefined : target,
    flush: options.flush ?? (async () => true),
    warn: (message) => { warnings.push(message) },
  }
  let release: () => void
  if (options.install === undefined) {
    release = installTurnTriggers(surface, rules)
  } else {
    release = options.install(surface)
  }
  return { session, followups, warnings, surface, dispose: release }
}

/** Let the delivery promise chain settle: flush acknowledgement happens after the append. */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 4; tick += 1) await Promise.resolve()
}

/** Open a turn and deliver the given user-role messages into it. */
function runTurn(session: Session, messages: readonly UserMessage[], end: 'completed' | 'aborted' = 'completed'): void {
  session.append('turn/start', { turn: 1 })
  for (const message of messages) session.append('user/message', message, { surfaceOp: 'append' })
  session.append('turn/end', { turn: 1, reason: end === 'completed' ? { kind: 'completed' } : { kind: 'aborted', reason: 'cancelled' } })
}

describe('configuration', () => {
  it('compiles every declared rule with its cooldown', () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE, { id: 'plain', match: 'review', prompt: 'Review the diff.' }] })
    expect(rules.map(rule => rule.id)).toEqual(['plan-check', 'plain'])
    expect(rules[0]?.pattern.test(PLAN_PATH)).toBe(true)
    expect(rules[0]?.cooldownMs).toBe(1_800_000)
    expect(rules[1]?.cooldownMs).toBe(0)
  })

  it('treats an absent rule list as disabled', () => {
    expect(resolveTurnTriggers({})).toEqual([])
    expect(resolveTurnTriggers({ rules: [] })).toEqual([])
  })

  it('rejects every malformed rule at load time', () => {
    expect(() => resolveTurnTriggers({ rules: [{ ...PLAN_RULE, id: '  ' }] })).toThrow(/non-empty id/)
    expect(() => resolveTurnTriggers({ rules: [PLAN_RULE, PLAN_RULE] })).toThrow(/duplicate rule id/)
    expect(() => resolveTurnTriggers({ rules: [{ ...PLAN_RULE, prompt: ' ' }] })).toThrow(/non-empty prompt/)
    expect(() => resolveTurnTriggers({ rules: [{ ...PLAN_RULE, match: '(' }] })).toThrow(/invalid match pattern/)
  })

  it('defaults the rule list and cooldown through the schema', () => {
    expect(Config({}).rules).toEqual([])
    const parsed = Config({ rules: [{ id: 'a', match: 'b', prompt: 'c' }] })
    expect(parsed.rules?.[0]?.cooldownMinutes).toBe(0)
  })
})

describe('framing', () => {
  const rule: ResolvedTurnTrigger = {
    id: 'plan-check', pattern: /x/u, prompt: 'Check {match} now.', cooldownMs: 0,
  }

  it('interpolates the captured text and states its origin', () => {
    const text = renderTriggerFraming([{ rule, matchedText: PLAN_PATH }])
    expect(text).toContain('[TURN-END TRIGGER]')
    expect(text).toContain(PLAN_PATH)
    expect(framingPayload(text)).toEqual([
      { rule_id: 'plan-check', matched_text: PLAN_PATH, prompt: `Check ${PLAN_PATH} now.` },
    ])
  })

  it('bounds the quoted match', () => {
    const long = 'p'.repeat(MAX_MATCHED_TEXT_CHARS + 50)
    const [entry] = framingPayload(renderTriggerFraming([{ rule, matchedText: long }]))
    expect(entry?.matched_text).toHaveLength(MAX_MATCHED_TEXT_CHARS)
    expect(entry?.matched_text.endsWith('…')).toBe(true)
  })

  it('prefers the first capture group over the whole match', () => {
    const match = rule.pattern.exec('x')
    expect(match).not.toBeNull()
    expect(matchedTextOf(match!)).toBe('x')
    const capture = /prefix-(plan-\d+)/u.exec('prefix-plan-7')
    expect(matchedTextOf(capture!)).toBe('plan-7')
  })
})

describe('turn-end delivery', () => {
  it('delivers one follow-up when a completed turn carries a matching human prompt', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    runTurn(h.session, [human(`please use ${PLAN_PATH}`)])
    expect(h.followups).toHaveLength(1)
    const [message] = h.followups
    expect(message?.source).toEqual({ kind: 'turn-trigger', ruleIds: ['plan-check'] })
    expect(message?.content[0]).toMatchObject({ type: 'text' })
  })

  it('stays silent when the human text does not match', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    runTurn(h.session, [human('unrelated work')])
    expect(h.followups).toEqual([])
  })

  it('never retriggers on its own injected prompt', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    runTurn(h.session, [injected(`check ${PLAN_PATH}`)])
    expect(h.followups).toEqual([])
  })

  it('ignores turns that did not complete or carried no human text', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    runTurn(h.session, [human(PLAN_PATH)], 'aborted')
    expect(h.followups).toEqual([])
    h.session.append('turn/start', { turn: 2 })
    h.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    expect(h.followups).toEqual([])
  })

  it('respects the rule cooldown inside one Session', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-29T04:00:00.000Z'))
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.followups).toHaveLength(1)
    clock.mockReturnValue(Date.parse('2026-10-29T04:10:00.000Z'))
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.followups).toHaveLength(1)
    clock.mockReturnValue(Date.parse('2026-10-29T04:31:00.000Z'))
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.followups).toHaveLength(2)
    clock.mockRestore()
  })

  it('does not deliver without a live Agent', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules, { agent: false })
    runTurn(h.session, [human(PLAN_PATH)])
    expect(h.followups).toEqual([])
  })

  it('reports an unacknowledged flush and keeps the cooldown open', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules, { flush: async () => false })
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.warnings[0]).toContain('did not acknowledge')
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.followups).toHaveLength(2)
  })

  it('contains a rejected flush', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules, { flush: async () => { throw new Error('disk full') } })
    runTurn(h.session, [human(PLAN_PATH)])
    await settle()
    expect(h.warnings[0]).toContain('disk full')
  })

  it('skips a turn while a previous delivery is unacknowledged', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const pending = Promise.withResolvers<boolean>()
    const h = await harness(rules, { flush: () => pending.promise })
    runTurn(h.session, [human(PLAN_PATH)])
    runTurn(h.session, [human(PLAN_PATH)])
    expect(h.followups).toHaveLength(1)
    pending.resolve(true)
    await settle()
  })

  it('stops delivering after disposal', async () => {
    const rules = resolveTurnTriggers({ rules: [PLAN_RULE] })
    const h = await harness(rules)
    h.dispose()
    runTurn(h.session, [human(PLAN_PATH)])
    expect(h.followups).toEqual([])
  })
})

describe('plugin composition', () => {
  it('mounts through the Loader with the declared schema', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('plugin'))
    const followups: UserMessage[] = []
    ctx.provide('agents', { get: (id: SessionId) => id === session.id ? { session, followup: (m: UserMessage) => { followups.push(m) } } : undefined })
    await ctx.plugin(turnTrigger, { rules: [PLAN_RULE] })
    runTurn(session, [human(PLAN_PATH)])
    expect(followups).toHaveLength(1)
  })

  it('stays inert without rules', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('inert'))
    ctx.provide('agents', { get: () => undefined })
    await ctx.plugin(turnTrigger, {})
    runTurn(session, [human(PLAN_PATH)])
    expect(ctx.fiber.state).toBeDefined()
  })
})
