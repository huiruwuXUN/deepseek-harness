/**
 * ui-ask browser half on a real SlotRegistry: the plugin occupies the
 * conversation-declared `conversation.input.ask` single seat with the active
 * ask status chip; the injected face executes /ask off and folds admission
 * outcomes into null (admitted) or a user-visible failure line; teardown
 * empties the seat (HMR safety).
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { AskChip } from '../src/client/AskModeControl.tsx'
import type { AskChipInjected } from '../src/client/index.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const SID = 's-ask' as SessionId

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({
    name: 'root',
    children: { 'conversation.input.ask': { kind: 'single', scope: 'session' } },
  } as never, () => null)
  const execute = vi.fn((_sessionId: SessionId, _line: string) =>
    Promise.resolve({ ok: true, value: { commandId: 'c1', result: { kind: 'success' as const } } }))
  const commandsRemote = { execute }
  ctx.provide('remote', { commands: commandsRemote })
  ctx.provide('remote.commands', commandsRemote)
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx, slots, execute }
}

describe('ui-ask browser apply', () => {
  it('declares every service it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.commands', 'locale'])
  })

  it('node-half apply is an intentional no-op', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('waits until conversation declares the ask seat', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('remote', { commands: {} })
    ctx.provide('remote.commands', {})
    ctx.provide('locale', new LocaleRuntime(ctx))
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('conversation.input.ask')).toHaveLength(0)
    ctx.slots.register({
      name: 'root', children: { 'conversation.input.ask': { kind: 'single', scope: 'session' } },
    } as never, () => null)
    await Promise.resolve()
    expect(ctx.slots.entries('conversation.input.ask')).toHaveLength(1)
    await fiber.dispose()
    expect(ctx.slots.entries('conversation.input.ask')).toHaveLength(0)
  })

  it('registers the chip, executes /ask off, and unregisters on teardown', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries('conversation.input.ask')[0]!
    expect(entry.component).toBe(AskChip)
    expect(entry.locale).toBe('ask')
    if (entry.inject === undefined) throw new Error('the ask seat registered no inject face')
    const injected = Reflect.apply(entry.inject, undefined, [SID]) as AskChipInjected

    await expect(injected.exitAskMode()).resolves.toBeNull()
    expect(b.execute).toHaveBeenLastCalledWith(SID, '/ask off', [])

    // Business failure folds to the composer-visible line: the generated method
    // reports the RPC failure in its error branch.
    b.execute.mockResolvedValueOnce({
      ok: false,
      error: new RemoteError('session/not-found', 'gone', { sessionId: SID }),
    } as never)
    await expect(injected.exitAskMode()).resolves.toBe('gone (session/not-found)')

    // Unmatched admission (ask-mode not composed host-side) is also a failure line.
    b.execute.mockResolvedValueOnce({ ok: true, value: undefined } as never)
    await expect(injected.exitAskMode()).resolves.toBe('unknown command: /ask off')

    await fiber.dispose()
    expect(b.slots.entries('conversation.input.ask')).toHaveLength(0)
  })
})
