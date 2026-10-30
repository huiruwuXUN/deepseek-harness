/**
 * Model-visible text for one delivered trigger batch.
 * @module @deepseek-ai/dsh-experimental-turn-trigger/framing
 */

import type { ResolvedTurnTrigger } from './config.ts'

/** Character cap for the quoted matched text, so one long message cannot dominate the prompt. */
export const MAX_MATCHED_TEXT_CHARS = 500

/** One rule that matched the finished turn, with the text it matched. */
export interface TurnTriggerMatch {
  /** The rule that matched. */
  readonly rule: ResolvedTurnTrigger
  /** Capture group 1 when the pattern declares one, otherwise the whole match. */
  readonly matchedText: string
}

/** Fixed origin line so the model never mistakes a trigger for a human prompt. */
const TRIGGER_FRAMING = 'This is an automated message from a turn-end trigger configured by the operator, not from the user.'

/** Bound the quoted match and keep the framing single-line per field. */
function bounded(text: string): string {
  return text.length <= MAX_MATCHED_TEXT_CHARS ? text : `${text.slice(0, MAX_MATCHED_TEXT_CHARS - 1)}…`
}

/**
 * Render the complete model-visible text for one delivered batch.
 *
 * The dynamic payload is canonical JSON so a matched message cannot forge
 * framing lines, and the trigger prompt is interpolated here rather than by
 * the model.
 * @param matches - Matched rules in declaration order, each with its matched text.
 * @returns Stable text for one user-role message.
 */
export function renderTriggerFraming(matches: readonly TurnTriggerMatch[]): string {
  const payload = matches.map(({ rule, matchedText }) => ({
    rule_id: rule.id,
    matched_text: bounded(matchedText),
    prompt: rule.prompt.replaceAll('{match}', bounded(matchedText)),
  }))
  return [
    '[TURN-END TRIGGER]',
    TRIGGER_FRAMING,
    `triggers_json: ${JSON.stringify(payload)}`,
  ].join('\n')
}

/**
 * Select the text a pattern matched: capture group 1 when present, else the whole match.
 * @param match - Result of `RegExp.exec` with a non-empty match.
 * @returns The identifying text for the rule.
 */
export function matchedTextOf(match: RegExpExecArray): string {
  return match[1] ?? match[0]
}
