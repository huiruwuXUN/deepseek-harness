/** Ask state must not be read before the projection reader is registered. */
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import AskModeController from '@deepseek-ai/dsh-ask-mode'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

describe('ask-mode activation', () => {
  it('rejects ask-state reads until the projection reader resolves', async () => {
    const ctx = new Context()
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    onTestFinished(async () => {
      release.resolve(undefined)
      await ctx.fiber.dispose()
    })
    await mountAgentLoopTestDependencies(ctx)
    await ctx.plugin(AgentLoop, { agents: [] })
    const { agent } = await ctx.agents.create({
      sessionId: SessionId('ask-init'),
      agentOptions: { provider: 'mock', model: 'mock' },
    })
    const register = ctx.sessionProjections.register.bind(ctx.sessionProjections)
    const spy = vi.spyOn(ctx.sessionProjections, 'register').mockImplementation(async (definition) => {
      const handle = await register(definition)
      if (definition.key === 'ask') {
        entered.resolve(undefined)
        await release.promise
      }
      return handle
    })
    onTestFinished(() => { spy.mockRestore() })
    const fiber = ctx.plugin(AskModeController, { section: 'Answer questions only.' })
    await entered.promise
    expect(() => ctx.askMode.get(agent))
      .toThrow('ask mode is not ready; await plugin activation before running an agent')

    release.resolve(undefined)
    await fiber
    expect(ctx.askMode.get(agent)).toEqual({ active: false })
  })
})
