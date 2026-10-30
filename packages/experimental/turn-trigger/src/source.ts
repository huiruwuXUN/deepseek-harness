/**
 * Message-source kind for prompts this plugin delivers, so its own follow-ups
 * never count as human text and cannot retrigger a rule.
 * @module @deepseek-ai/dsh-experimental-turn-trigger/source
 */

import type { ContextFormed } from '@deepseek-ai/dsh-llm'

/** Source attached to one delivered trigger batch. */
export interface TurnTriggerMessageSource {
  readonly kind: 'turn-trigger'
  /** Ids of the rules that produced this message, in declaration order. */
  readonly ruleIds: readonly string[]
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'turn-trigger': TurnTriggerMessageSource & ContextFormed
  }
}
