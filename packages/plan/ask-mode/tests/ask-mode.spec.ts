import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import CommandRuntime, { type CommandSubmitAttachment } from '@deepseek-ai/dsh-commands'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import PlanModeController from '@deepseek-ai/dsh-plan-mode'
import AskModeController, { askProjectionDefinition, resolveConfig } from '../src/index.ts'
import type { AskModeConfig } from '../src/index.ts'
import type { AskUnitState } from '../src/types.ts'

const testToolSignal = new AbortController().signal
const TEST_MODEL_SELECTION = { provider: 'test', model: 'test' }

const TEST_ASK_SECTION = 'Test ask mode instructions.'
const ASK_CONFIG = { section: TEST_ASK_SECTION } satisfies AskModeConfig

interface Harness {
  ctx: Context
  plan?: PlanModeController
}

async function harness(options: { planMode?: boolean } = {}): Promise<Harness> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(CommandRuntime)
  const plan = options.planMode === true
    ? await ctx.plugin(PlanModeController, { section: 'Test plan mode instructions.' })
    : undefined
  await ctx.plugin(AskModeController, ASK_CONFIG)
  return plan === undefined ? { ctx } : { ctx, plan: ctx.planMode }
}

let counter = 0
async function makeAgent(ctx: Context, options: { active?: boolean; planActive?: boolean } = {}): Promise<Agent> {
  const sessionId = SessionId(`ask-agent-${String(++counter)}`)
  const { agent } = await ctx.agents.create({
    sessionId,
    agentOptions: { provider: 'mock', model: 'mock' },
  })
  if (options.planActive === true) agent.session.append('plan/mode', { active: true })
  if (options.active !== undefined) agent.session.append('ask/mode', { active: options.active })
  return agent
}

function foldAskMode(events: readonly SessionEvent[], end = events.length): boolean {
  let state: AskUnitState = askProjectionDefinition.init()
  let index = 0
  for (const event of events) {
    if (index >= end) break
    index++
    state = askProjectionDefinition.apply(state, event)
  }
  return state.active
}

/** Dispatch a pre-step waterfall entry (and optionally its step-start commit). */
async function boundary(ctx: Context, agent: Agent, type: 'pre-step' | 'step-start', signal = new AbortController().signal): Promise<void> {
  const events = agentEvents(ctx, agent)
  const message = createUserMessage({
    content: [{ type: 'text', text: 'boundary probe' }],
    source: { kind: 'user' },
  })
  const decision = await events.waterfall(
    'agent/pre-step',
    { modelSelection: { provider: 'mock', model: 'mock' }, messages: [message], turn: 1, step: 1, signal },
    () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
  )
  if (decision.kind === 'enter') {
    for (const pending of decision.messages.slice(1)) {
      agent.session.append('user/message', pending, { surfaceOp: 'append' })
    }
  }
  if (type === 'step-start') {
    const event = agent.session.append('step/start', { turn: 1, step: 1 })
    ctx.emit('session/event', agent.session, event)
  }
}

function openTurn(agent: Agent, turn = 0): void {
  agent.session.append('turn/start', { turn })
}

function closeTurn(agent: Agent, turn = 0): void {
  agent.session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

function header(agent: Agent): void {
  agent.session.append('request/header', { header: { config: { provider: 'test', model: 'test-model' } }, reason: 'initial' })
}

function noticeTexts(agent: Agent): string[] {
  return agent.session.snapshotEvents()
    .filter(event => event.type === 'user/message' && event.data.source.kind !== 'user')
    .map(event => (event.data as { content: { type: string; text?: string }[] }).content.map(block => block.text ?? '').join(''))
}

async function assembleFor(ctx: Context, agent: Agent) {
  const toolSet = await ctx.tools.resolve({ agent, modelSelection: TEST_MODEL_SELECTION, signal: testToolSignal })
  return ctx.systemPrompt.assemble({ agent, scope: agent, toolSet })
}

function sectionText(assembly: { sections: { name: string; text: string }[] }): string | undefined {
  return assembly.sections.find(section => section.name === 'ask:policy')?.text
}

function provideAttachments(ctx: Context): void {
  let saved = 0
  const saveImage = (input: { mediaType: string }) => {
    saved += 1
    return Promise.resolve({
      attachmentId: `att-${saved}`, mediaType: input.mediaType, bytes: 3, width: 1, height: 1,
    })
  }
  ctx.provide('attachments', {
    imageLimits: {
      maxImageBytes: 1024, maxImagesPerMessage: 4, maxMessageImageBytes: 1024,
      maxImagePixels: 1_000_000, mediaTypes: ['image/png'],
    },
    validateImage: () => Promise.resolve(),
    saveImage,
    async saveImages(inputs: readonly { mediaType: string }[]) {
      const refs = []
      for (const input of inputs) refs.push(await saveImage(input))
      return refs
    },
    saveFile(input: { data: Uint8Array; name?: string }) {
      saved += 1
      return Promise.resolve({
        attachmentId: `att-${saved}`, bytes: input.data.byteLength, name: input.name ?? 'attachment',
      })
    },
  })
}

function execute(ctx: Context, agent: Agent, line: string, attachments: readonly CommandSubmitAttachment[] = []) {
  return ctx.commands.execute(agent, line, attachments, new AbortController().signal)
}

describe('resolveConfig', () => {
  it('requires string, non-empty ask instructions', () => {
    expect(() => resolveConfig({} as AskModeConfig)).toThrow('needs a string `section`')
    // @ts-expect-error — a non-string section is a load-time misconfiguration.
    expect(() => resolveConfig({ section: 5 })).toThrow('needs a string `section`')
    expect(() => resolveConfig({ section: '   ' })).toThrow('needs a non-empty `section`')
  })

  it('returns a detached ask config', () => {
    const config = { section: TEST_ASK_SECTION }
    const resolved = resolveConfig(config)
    expect(resolved).toEqual(config)
    expect(resolved).not.toBe(config)
  })

  it('rejects fields outside the ask policy config', () => {
    // @ts-expect-error — unknown keys are rejectable configuration input.
    expect(() => resolveConfig({ section: TEST_ASK_SECTION, tools: ['read'] }))
      .toThrow('unknown key(s) tools — config is { section }')
  })
})

describe('foldAskMode', () => {
  it('folds an empty log to inactive and takes the last ask/mode otherwise', () => {
    const session = Session.create(SessionId('fold'))
    expect(foldAskMode(session.snapshotEvents())).toBe(false)
    session.append('ask/mode', { active: true })
    session.append('ask/mode', { active: false })
    session.append('ask/mode', { active: true })
    expect(foldAskMode(session.snapshotEvents())).toBe(true)
  })
})

describe('ctx.askMode: get/set', () => {
  it('does not activate without the projection registry and agent registry', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(AskModeController, ASK_CONFIG)
    expect(ctx.get('askMode')).toBeUndefined()
  })

  it('reads the folded state', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    expect(ctx.askMode.get(agent)).toEqual({ active: false })
    agent.session.append('ask/mode', { active: true })
    expect(ctx.askMode.get(agent)).toEqual({ active: true })
  })

  it('queues an entry during an open turn', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    expect(ctx.askMode.set(agent, true)).toBe('queued')
    expect(ctx.askMode.get(agent)).toEqual({ active: false, pending: true })
  })

  it('drops a no-op set (target equals pending, else the current fold)', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    expect(ctx.askMode.set(agent, false)).toBe('noop')
    expect(ctx.askMode.get(agent)).toEqual({ active: false })
    expect(ctx.askMode.set(agent, true)).toBe('queued')
    expect(ctx.askMode.set(agent, true)).toBe('noop')
    expect(ctx.askMode.get(agent)).toEqual({ active: false, pending: true })
  })

  it('a between-turns selection commits ask/mode immediately and narrates once', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    const inject = vi.fn<(message: UserMessage) => void>()
    vi.spyOn(agent, 'inject').mockImplementation(inject)
    header(agent)
    expect(ctx.askMode.set(agent, true)).toBe('committed')
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(true)
    expect(ctx.askMode.get(agent)).toEqual({ active: true })
    const notice = inject.mock.calls[0]?.[0]
    expect(notice?.content).toEqual([{ type: 'text', text: 'The user switched this session to ask mode.' }])
    expect(notice?.source).toMatchObject({ kind: 'ask-mode', form: 'notice' })
    header(agent)
    expect(ctx.askMode.set(agent, false)).toBe('committed')
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(false)
    expect(inject).toHaveBeenLastCalledWith(expect.objectContaining({
      content: [{ type: 'text', text: 'The user switched this session back to the default mode.' }],
    }))
    expect(inject).toHaveBeenCalledTimes(2)
    await boundary(ctx, agent, 'step-start')
    expect(agent.session.snapshotEvents().filter(event => event.type === 'ask/mode')).toHaveLength(2)
  })

  it('a between-turns reversal of a mid-turn pending intent cancels without logging', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    expect(ctx.askMode.set(agent, true)).toBe('queued')
    closeTurn(agent)
    expect(ctx.askMode.set(agent, false)).toBe('cancelled')
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
    expect(ctx.askMode.get(agent)).toEqual({ active: false })
  })

  it('narrates nothing before the first request header', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    ctx.askMode.set(agent, true)
    expect(noticeTexts(agent)).toEqual([])
  })

  it('selecting ask mode leaves plan mode', async () => {
    const { ctx } = await harness({ planMode: true })
    const agent = await makeAgent(ctx, { planActive: true })
    expect(ctx.planMode.get(agent)).toEqual({ active: true })
    expect(ctx.askMode.set(agent, true)).toBe('committed')
    expect(ctx.planMode.get(agent)).toEqual({ active: false })
    expect(ctx.askMode.get(agent)).toEqual({ active: true })
  })
})

describe('the boundary flush', () => {
  it('is inert when no selection is pending', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    const onBoundary = (Reflect.get(ctx.askMode, 'onBoundary') as (session: Session) => void).bind(ctx.askMode)
    expect(() => { onBoundary(agent.session) }).not.toThrow()
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
  })

  it('drops a pending selection that matches the logged state and flushes otherwise', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    const onBoundary = (Reflect.get(ctx.askMode, 'onBoundary') as (session: Session) => void).bind(ctx.askMode)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    ctx.askMode.set(agent, false)
    onBoundary(agent.session)
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
    ctx.askMode.set(agent, true)
    onBoundary(agent.session)
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(true)
  })

  it('flushes from pre-step before the following step/start', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    await boundary(ctx, agent, 'pre-step')
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(true)
    expect(ctx.askMode.get(agent)).toEqual({ active: true })
  })

  it('skips the flush when the step is rejected or aborted', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    const events = agentEvents(ctx, agent)
    const message = createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })
    const rejected = await events.waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'mock', model: 'mock' }, messages: [message], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'reject' as const, reason: { kind: 'user' as const } }),
    )
    expect(rejected.kind).toBe('reject')
    const aborted = new AbortController()
    aborted.abort()
    await events.waterfall(
      'agent/pre-step',
      { modelSelection: { provider: 'mock', model: 'mock' }, messages: [message], turn: 1, step: 1, signal: aborted.signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [message] }),
    )
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
    expect(ctx.askMode.get(agent)).toEqual({ active: false, pending: true })
  })

  it('nets out a flip sequence that returns to the folded mode (no append, no notice)', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    ctx.askMode.set(agent, false)
    await boundary(ctx, agent, 'pre-step')
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
    expect(noticeTexts(agent)).toEqual([])
  })

  it('narrates once when the flushed mode differs from what the last header told the model', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    header(agent)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    await boundary(ctx, agent, 'pre-step')
    expect(noticeTexts(agent)).toEqual(['The user switched this session to ask mode.'])
    await boundary(ctx, agent, 'step-start')
    expect(noticeTexts(agent)).toEqual(['The user switched this session to ask mode.'])
  })

  it('stays silent when the header already reflects the flushed mode', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    agent.session.append('ask/mode', { active: true })
    header(agent)
    openTurn(agent)
    ctx.askMode.set(agent, false)
    expect(ctx.askMode.get(agent)).toEqual({ active: true, pending: false })
    ctx.askMode.set(agent, true)
    await boundary(ctx, agent, 'step-start')
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(true)
    expect(noticeTexts(agent)).toEqual([])
  })

  it('contains an append failure and keeps the intent pending', async () => {
    const { ctx } = await harness()
    const warn = vi.fn()
    ctx.logger.warn = warn as never
    const agent = await makeAgent(ctx)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    const append = vi.spyOn(agent.session, 'append')
    append.mockImplementationOnce(() => { throw new Error('backend gone') })
    await boundary(ctx, agent, 'pre-step')
    expect(warn).toHaveBeenCalledOnce()
    expect(ctx.askMode.get(agent)).toEqual({ active: false, pending: true })
    append.mockRestore()
    await boundary(ctx, agent, 'pre-step')
    expect(foldAskMode(agent.session.snapshotEvents())).toBe(true)
    expect(ctx.askMode.get(agent).pending).toBeUndefined()
  })

  it('removes the pre-step flush when the plugin fiber is disposed', async () => {
    const ctx = new Context()
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    const fiber = await ctx.plugin(AskModeController, ASK_CONFIG)
    const agent = await makeAgent(ctx)
    openTurn(agent)
    ctx.askMode.set(agent, true)
    await fiber.dispose()
    await boundary(ctx, agent, 'pre-step')
    expect(agent.session.snapshotEvents().some(event => event.type === 'ask/mode')).toBe(false)
  })
})

describe('the soft layer', () => {
  it('renders the section only while ask mode is selected', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    expect(sectionText(await assembleFor(ctx, agent))).toBe('')
    agent.session.append('ask/mode', { active: true })
    expect(sectionText(await assembleFor(ctx, agent))).toBe(TEST_ASK_SECTION)
    agent.session.append('ask/mode', { active: false })
    expect(sectionText(await assembleFor(ctx, agent))).toBe('')
  })

  it('leaves an agent-less assembly untouched', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: TEST_MODEL_SELECTION, signal: testToolSignal })
    const assembly = await ctx.systemPrompt.assemble({ toolSet })
    expect(sectionText(assembly)).toBe('')
  })

  it('suppresses ask guidance while plan mode is active or pending', async () => {
    const { ctx } = await harness({ planMode: true })
    const agent = await makeAgent(ctx)
    agent.session.append('ask/mode', { active: true })
    expect(sectionText(await assembleFor(ctx, agent))).toBe(TEST_ASK_SECTION)
    agent.session.append('plan/mode', { active: true })
    expect(sectionText(await assembleFor(ctx, agent))).toBe('')
    // Plan exit does not revive ask mode: the plan entry cleared the selection.
    agent.session.append('plan/mode', { active: false })
    expect(ctx.askMode.get(agent)).toEqual({ active: false })
    expect(sectionText(await assembleFor(ctx, agent))).toBe('')
    agent.session.append('ask/mode', { active: true })
    expect(sectionText(await assembleFor(ctx, agent))).toBe(TEST_ASK_SECTION)
    openTurn(agent)
    ctx.planMode.set(agent, true)
    expect(ctx.planMode.get(agent)).toEqual({ active: false, pending: true })
    expect(sectionText(await assembleFor(ctx, agent))).toBe('')
  })
})

describe('the /ask command', () => {
  it('registers only the ask command with the command registry', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    expect(ctx.commands.list(agent).map(command => command.name)).toEqual(['ask'])
  })

  it('bare /ask enters ask mode', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    expect((await execute(ctx, agent, '/ask'))?.result).toEqual({ kind: 'success', text: 'Ask mode on. Use /ask off to leave.' })
    expect(ctx.askMode.get(agent)).toEqual({ active: true })
  })

  it('a message argument enters ask mode and submits the text', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    const steer = vi.fn<(message: UserMessage) => void>()
    vi.spyOn(agent, 'steer').mockImplementation(steer)
    expect((await execute(ctx, agent, '/ask   explain the retry logic  '))?.result)
      .toEqual({ kind: 'success', text: 'Ask mode on. Use /ask off to leave.' })
    expect(steer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      content: [{ type: 'text', text: 'explain the retry logic' }],
      source: { kind: 'user' },
    }))
  })

  it('reports the queued wording when the selection waits for the next step', async () => {
    const { ctx } = await harness()
    const agent = await makeAgent(ctx)
    openTurn(agent)
    expect((await execute(ctx, agent, '/ask explain'))?.result)
      .toEqual({ kind: 'success', text: 'Entering ask mode (applies from the next step). Use /ask off to leave.' })
  })

  it('steers attachments with or without text and refuses them on /ask off', async () => {
    const { ctx } = await harness()
    provideAttachments(ctx)
    ctx.commands.registerFileReceiptResolver((agent, receiptId) => receiptId === 'receipt-notes'
      ? { attachmentId: `file-${agent.id}` as never, bytes: 5, name: 'notes.txt' }
      : undefined)
    const attachments = [
      { type: 'image' as const, mediaType: 'image/png' as const, data: 'AAAA', name: 'diagram.png' },
      { type: 'file' as const, receiptId: 'receipt-notes' },
    ]

    const withMessage = await makeAgent(ctx)
    const steer = vi.fn<(message: UserMessage) => void>()
    vi.spyOn(withMessage, 'steer').mockImplementation(steer)
    expect((await execute(ctx, withMessage, '/ask explain the flow', attachments))?.result)
      .toEqual({ kind: 'success', text: 'Ask mode on. Use /ask off to leave.' })
    const steered = steer.mock.calls[0]?.[0]
    expect(steered?.content).toHaveLength(3)
    expect(steered?.content[0]).toMatchObject({ type: 'image', attachment: { attachmentId: 'att-1' } })
    expect(steered?.content[1]).toMatchObject({ type: 'file', attachment: { name: 'notes.txt' } })
    expect(steered?.content[2]).toEqual({ type: 'text', text: 'explain the flow' })

    const bare = await makeAgent(ctx)
    openTurn(bare)
    const bareSteer = vi.fn<(message: UserMessage) => void>()
    vi.spyOn(bare, 'steer').mockImplementation(bareSteer)
    expect((await execute(ctx, bare, '/ask', attachments))?.result)
      .toEqual({ kind: 'success', text: 'Entering ask mode (applies from the next step). Use /ask off to leave.' })
    expect(bareSteer).toHaveBeenCalledOnce()

    const off = await makeAgent(ctx, { active: true })
    const offSteer = vi.fn<(message: UserMessage) => void>()
    vi.spyOn(off, 'steer').mockImplementation(offSteer)
    expect((await execute(ctx, off, '/ask off', attachments))?.result)
      .toEqual({ kind: 'error', text: 'Attachments cannot accompany /ask off.' })
    expect(offSteer).not.toHaveBeenCalled()
    expect(ctx.askMode.get(off)).toEqual({ active: true })
  })

  it('reports committed, queued, cancelled, and inactive exits', async () => {
    const { ctx } = await harness()
    const active = await makeAgent(ctx, { active: true })
    expect((await execute(ctx, active, '/ask off'))?.result).toEqual({ kind: 'success', text: 'Ask mode off.' })
    expect(ctx.askMode.get(active)).toEqual({ active: false })
    expect((await execute(ctx, active, '/ask off'))?.result).toEqual({ kind: 'success', text: 'Ask mode is already inactive.' })

    const queued = await makeAgent(ctx)
    openTurn(queued)
    ctx.askMode.set(queued, true)
    expect((await execute(ctx, queued, '/ask off'))?.result).toEqual({ kind: 'success', text: 'Ask mode entry cancelled.' })
    expect((await execute(ctx, queued, '/ask off'))?.result).toEqual({ kind: 'success', text: 'Ask mode is already inactive.' })

    const leaving = await makeAgent(ctx, { active: true })
    openTurn(leaving)
    expect((await execute(ctx, leaving, '/ask off'))?.result)
      .toEqual({ kind: 'success', text: 'Leaving ask mode (applies from the next step).' })
    expect((await execute(ctx, leaving, '/ask off'))?.result)
      .toEqual({ kind: 'success', text: 'Leaving ask mode (applies from the next step).' })
  })
})
