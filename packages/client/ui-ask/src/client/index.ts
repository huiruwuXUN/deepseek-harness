/** Ask-mode control for the composer tool row. */
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only: pulls the ui-conversation SlotMap merge (the input.ask seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the `ask` SessionProjectionMap merge for useProjection.
import type {} from '@deepseek-ai/dsh-ask-mode/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/remote'
import { AskChip } from './AskModeControl.tsx'
import { en, ja, es, fr, de, ru, pt, zh, type AskKey } from './locales.ts'

export type { AskKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The composer ask chip's copy. */
    ask: AskKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'ask'

/** Injected business face of the composer ask seat. */
export interface AskChipInjected {
  /**
   * Leave ask mode by executing /ask off.
   * @returns null on admitted execution; a user-visible failure line otherwise.
   */
  exitAskMode: () => Promise<string | null>
}

/** Services for the ask control. */
export const inject = ['slots', 'remote', 'remote.commands', 'locale']

/**
 * Register the composer ask status chip.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'ui-ask: dictionaries')

  ctx.slots.inject('conversation.input.ask', () => ctx.slots.register({
    name: 'conversation.input.ask',
    locale: NS,
    inject: (sessionId: SessionId): AskChipInjected => ({
      // Failure strings stay English (error-surface policy: not localized).
      exitAskMode: async () => {
        const result = await ctx.remote.commands.execute(sessionId, '/ask off', [])
        if (!result.ok) return `${result.error.message} (${result.error.code})`
        if (result.value === undefined) return 'unknown command: /ask off'
        return null
      },
    }),
  }, AskChip))
}
