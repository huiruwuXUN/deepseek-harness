/** Ask projection behavior. */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import PlanModeController from '@deepseek-ai/dsh-plan-mode'
import { CommandId } from '@deepseek-ai/dsh-commands/brand'
import AskModeController from '@deepseek-ai/dsh-ask-mode'

interface Bench {
  ctx: Context
  session: Session
  values(): Record<string, unknown>
}

async function harness(withAskMode: boolean, withPlanMode = false): Promise<Bench> {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (withPlanMode) await ctx.plugin(PlanModeController, { section: 'plan policy' })
  if (withAskMode) await ctx.plugin(AskModeController, { section: 'ask policy' })
  const { agent } = await ctx.agents.create({
    sessionId: SessionId('ask-projection'),
    agentOptions: { provider: 'mock', model: 'mock' },
  })
  const session = agent.session
  return {
    ctx,
    session,
    values: () => ctx.sessionProjections.snapshot(session).values,
  }
}

/** Append one logged /ask selection record (the executor's command/run shape). */
function runAskCommand(session: Session, args: string, index: number): CommandId {
  const commandId = CommandId(`ask-proj-${String(index)}`)
  session.append('command/run', {
    commandId,
    name: 'ask',
    args,
    source: { kind: 'user' },
  })
  return commandId
}

/** Append the paired settlement for one projected ask command. */
function settleAskCommand(session: Session, commandId: CommandId, kind: 'success' | 'error'): void {
  session.append('command/done', { commandId, kind })
}

/** Commit one ask/mode flip inside an open turn (the invariant's turn-enclosure rule). */
function commitAskMode(session: Session, active: boolean, turn: number): void {
  session.append('turn/start', { turn })
  session.append('ask/mode', { active })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

describe('ask projection unit', () => {
  it('serves inactive/not-pending for the empty log', async () => {
    const bench = await harness(true)
    expect(bench.values().ask).toEqual({ active: false, pending: false })
  })

  it('a logged /ask selection reads pending until ask/mode records it', async () => {
    const bench = await harness(true)
    const commandId = runAskCommand(bench.session, '', 0)
    expect(bench.values().ask).toEqual({ active: false, pending: true })
    settleAskCommand(bench.session, commandId, 'success')
    expect(bench.values().ask).toEqual({ active: false, pending: true })
    commitAskMode(bench.session, true, 0)
    expect(bench.values().ask).toEqual({ active: true, pending: false })
  })

  it('drops an ask selection when its command settles with an error', async () => {
    const bench = await harness(true)
    commitAskMode(bench.session, true, 0)
    const commandId = runAskCommand(bench.session, 'off', 0)
    expect(bench.values().ask).toEqual({ active: true, pending: true })
    settleAskCommand(bench.session, commandId, 'error')
    expect(bench.values().ask).toEqual({ active: true, pending: false })
  })

  it('folds `off` args and non-ask commands correctly, and a matching selection is not pending', async () => {
    const bench = await harness(true)
    commitAskMode(bench.session, true, 0)
    bench.session.append('command/run', {
      commandId: CommandId('other-1'), name: 'compact', args: '', source: { kind: 'user' },
    })
    expect(bench.values().ask).toEqual({ active: true, pending: false })
    bench.session.append('command/run', {
      commandId: CommandId('ask-no-input'), name: 'ask', source: { kind: 'user' },
    })
    expect(bench.values().ask).toEqual({ active: true, pending: false })
    runAskCommand(bench.session, ' off', 1)
    expect(bench.values().ask).toEqual({ active: true, pending: true })
    commitAskMode(bench.session, false, 1)
    expect(bench.values().ask).toEqual({ active: false, pending: false })
    runAskCommand(bench.session, 'off', 2)
    expect(bench.values().ask).toEqual({ active: false, pending: false })
  })

  it('a /ask message-argument selection targets ask mode', async () => {
    const bench = await harness(true)
    runAskCommand(bench.session, ' explain the retry policy', 0)
    expect(bench.values().ask).toEqual({ active: false, pending: true })
  })

  it('freezes the active state across a request/header into activeAtLastHeader', async () => {
    const bench = await harness(true)
    commitAskMode(bench.session, true, 0)
    expect(bench.ctx.sessionProjections.checkpoint(bench.session).ask?.val).toMatchObject({ activeAtLastHeader: null })
    bench.session.append('request/header', {
      header: { config: { provider: 'test', model: 'test-model' } },
      reason: 'initial',
    })
    expect(bench.ctx.sessionProjections.checkpoint(bench.session).ask?.val).toMatchObject({ activeAtLastHeader: true })
  })

  it('clears ask state when plan mode activates, and does not revive it when plan exits', async () => {
    const bench = await harness(true, true)
    commitAskMode(bench.session, true, 0)
    expect(bench.values().ask).toEqual({ active: true, pending: false })
    bench.session.append('turn/start', { turn: 1 })
    bench.session.append('plan/mode', { active: true })
    bench.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect(bench.values().ask).toEqual({ active: false, pending: false })
    expect(bench.values().plan).toEqual({ active: true, pending: false })
    bench.session.append('turn/start', { turn: 2 })
    bench.session.append('plan/mode', { active: false })
    bench.session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    expect(bench.values().ask).toEqual({ active: false, pending: false })
  })

  it('has no ask key when ask-mode is not composed', async () => {
    const bench = await harness(false)
    expect('ask' in bench.values()).toBe(false)
  })

  it('drops the key when the ask-mode fiber unloads (HMR safety)', async () => {
    const bench = await harness(false)
    const fiber = await bench.ctx.plugin(AskModeController, { section: 'ask policy' })
    expect(bench.values().ask).toEqual({ active: false, pending: false })
    await fiber.dispose()
    expect('ask' in bench.values()).toBe(false)
  })

  it('cold replay recovers pending from the log alone (a fresh registry refolds it)', async () => {
    const bench = await harness(true)
    runAskCommand(bench.session, '', 0)
    const cold = await harness(true)
    for (const event of bench.session.snapshotEvents()) {
      if (event.type === 'command/run' || event.type === 'command/done' || event.type === 'ask/mode') {
        cold.session.append(event.type, event.data)
      }
    }
    expect(cold.values().ask).toEqual({ active: false, pending: true })
  })
})
