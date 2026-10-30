/**
 * Turn-end triggers: a completed turn whose human text matches a configured
 * pattern enqueues one follow-up prompt in the same Session. This automates
 * "after this kind of turn, do that" on a Session event instead of a wall-clock
 * timer, and unlike a Host poller it survives only as long as the running
 * harness, with no external watcher process.
 * @module @deepseek-ai/dsh-experimental-turn-trigger
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { resolveTurnTriggers } from './config.ts'
import type { TurnTriggerConfig } from './config.ts'
import { installTurnTriggers } from './runtime.ts'
import type {} from './source.ts'

export { Config, resolveTurnTriggers } from './config.ts'
export type { ResolvedTurnTrigger, TurnTriggerConfig, TurnTriggerRule } from './config.ts'
export { MAX_MATCHED_TEXT_CHARS, matchedTextOf, renderTriggerFraming } from './framing.ts'
export type { TurnTriggerMatch } from './framing.ts'
export { installTurnTriggers } from './runtime.ts'
export type { TurnTriggerSurface } from './runtime.ts'
export type { TurnTriggerMessageSource } from './source.ts'

/** Plugin name registered with the Loader. */
export const name = 'turn-trigger'

/** Host services this plugin consumes; Session events arrive through their owning plugin scope. */
export const inject = ['agents', 'sessions']

/**
 * Install turn-end evaluation in the mounting scope.
 * @param ctx - Context owning the agent and Session services.
 * @param config - Validated rule list from the profile composition.
 */
export function apply(ctx: Context, config: TurnTriggerConfig): void {
  const rules = resolveTurnTriggers(config)
  if (rules.length === 0) return
  installTurnTriggers({
    onSessionEvent: listener => ctx.on('session/event', listener),
    agentFor: (session: Session) => {
      const agent: Agent | undefined = ctx.agents.get(session.id)
      return agent?.session === session ? agent : undefined
    },
    flush: (session: Session) => ctx.sessions.flush(session),
    warn: (message) => { ctx.logger.warn(message) },
  }, rules)
}
