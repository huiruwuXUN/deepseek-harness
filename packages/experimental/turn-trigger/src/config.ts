/**
 * Profile configuration for turn-end triggers: one declared rule becomes one
 * compiled pattern plus the prompt it delivers.
 * @module @deepseek-ai/dsh-experimental-turn-trigger/config
 */

import Schema from '@deepseek-ai/schemastery'

/** One trigger declared in the profile configuration. */
export interface TurnTriggerRule {
  /** Stable identifier used in log lines, framing text, and cooldown keys. */
  id: string
  /**
   * Regular expression source tested against the human text of a finished
   * turn. Capture group 1, when the pattern has one, is the matched text
   * interpolated into `prompt`.
   */
  match: string
  /** Prompt delivered to the Session when the pattern matches; `{match}` interpolates the matched text. */
  prompt: string
  /** Minimum minutes between two firings of this rule in one Session. Defaults to 0. */
  cooldownMinutes?: number
}

/** Plugin configuration as written in `cordis.yml`. */
export interface TurnTriggerConfig {
  /** Triggers evaluated after every completed turn. An empty list disables the plugin. */
  rules?: TurnTriggerRule[]
}

/** Configuration schema: unknown keys are rejected, omitted fields defaulted. */
export const Config: Schema<TurnTriggerConfig> = Schema.object({
  rules: Schema.array(Schema.object({
    id: Schema.string().required(),
    match: Schema.string().required(),
    prompt: Schema.string().required(),
    cooldownMinutes: Schema.number().min(0).default(0),
  })).default([]),
})

/** One validated rule with its compiled pattern and cooldown. */
export interface ResolvedTurnTrigger {
  /** Stable identifier declared by the rule. */
  readonly id: string
  /** Compiled pattern; `u`-flagged and stateless because `match` is never reused across calls. */
  readonly pattern: RegExp
  /** Prompt text with a `{match}` placeholder. */
  readonly prompt: string
  /** Cooldown in milliseconds; 0 fires on every matching turn. */
  readonly cooldownMs: number
}

/**
 * Validate every declared rule and compile its pattern.
 *
 * Misconfiguration fails at load time instead of on the first finished turn:
 * a duplicate id, an uncompilable pattern, or a blank prompt or id is an
 * error, never a silently skipped rule.
 * @param config - Profile configuration supplied by the Loader.
 * @returns Compiled rules in declaration order.
 */
export function resolveTurnTriggers(config: TurnTriggerConfig): readonly ResolvedTurnTrigger[] {
  const declared = config.rules ?? []
  const seen = new Set<string>()
  return declared.map((rule) => {
    const id = rule.id.trim()
    if (id === '') throw new Error('turn-trigger: every rule needs a non-empty id')
    if (seen.has(id)) throw new Error(`turn-trigger: duplicate rule id ${JSON.stringify(id)}`)
    seen.add(id)
    const prompt = rule.prompt.trim()
    if (prompt === '') throw new Error(`turn-trigger: rule ${JSON.stringify(id)} needs a non-empty prompt`)
    let pattern: RegExp
    try {
      pattern = new RegExp(rule.match, 'u')
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`turn-trigger: rule ${JSON.stringify(id)} has an invalid match pattern: ${detail}`)
    }
    return { id, pattern, prompt: rule.prompt, cooldownMs: (rule.cooldownMinutes ?? 0) * 60_000 }
  })
}
