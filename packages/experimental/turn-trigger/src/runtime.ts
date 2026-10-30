/**
 * Turn-end evaluation: collect the human text of each open turn, evaluate the
 * configured patterns when it completes, and enqueue one follow-up prompt.
 * @module @deepseek-ai/dsh-experimental-turn-trigger/runtime
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, UserMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { ResolvedTurnTrigger } from './config.ts'
import { matchedTextOf, renderTriggerFraming } from './framing.ts'
import type { TurnTriggerMatch } from './framing.ts'
import type { TurnTriggerMessageSource } from './source.ts'

/** The Agent operations delivery needs, so evaluation stays testable without an Agent loop. */
export interface TurnTriggerTarget {
  /**
   * Enqueue one follow-up prompt on this Agent.
   * @param message - Message delivered on the user role.
   */
  followup(message: UserMessage): void
}

/** Host operations the trigger runtime needs, so evaluation stays testable without an Agent loop. */
export interface TurnTriggerSurface {
  /**
   * Subscribe to Session events.
   * @param listener - Receives every Session event in emission order.
   * @returns Disposer for the subscription.
   */
  onSessionEvent(listener: (session: Session, event: SessionEvent) => void): () => void
  /**
   * Resolve the live Agent owning a Session.
   * @param session - The Session whose finished turn is being evaluated.
   * @returns The owning Agent, or undefined when the Session has none.
   */
  agentFor(session: Session): TurnTriggerTarget | undefined
  /**
   * Persist the Session after the follow-up was enqueued.
   * @param session - Session whose inbox accepted the follow-up.
   * @returns Whether persistence acknowledged the write.
   */
  flush(session: Session): Promise<boolean>
  /**
   * Report a contained failure.
   * @param message - Actionable single-line account.
   */
  warn(message: string): void
}

/** Text blocks of one user-role message, ignoring images and other non-text content. */
function textBlocks(content: readonly ContentBlock[]): string[] {
  return content.flatMap(block => block.type === 'text' ? [block.text] : [])
}

/** Cooldown key for one rule in one Session. */
function cooldownKey(sessionId: SessionId, ruleId: string): string {
  return `${sessionId}\u0000${ruleId}`
}

/**
 * Evaluate completed turns against the compiled rules, for the lifetime of the
 * returned disposer.
 *
 * A rule fires at most once per completed turn, never for a turn without
 * human-authored text, and never while a previous delivery from this plugin is
 * still unacknowledged in the same Session.
 * @param surface - Host operations used to observe and deliver.
 * @param rules - Compiled rules in declaration order.
 * @returns Disposer that releases the subscription and process-local state.
 */
export function installTurnTriggers(
  surface: TurnTriggerSurface,
  rules: readonly ResolvedTurnTrigger[],
): () => void {
  const turnText = new Map<SessionId, string[]>()
  const lastFiredAt = new Map<string, number>()
  const delivering = new Set<SessionId>()

  /** Enqueue the follow-up for every rule matching this finished turn. */
  function evaluate(session: Session, text: string): void {
    if (delivering.has(session.id)) return
    const agent = surface.agentFor(session)
    if (agent === undefined) return
    const now = Date.now()
    const matches: TurnTriggerMatch[] = []
    for (const rule of rules) {
      const lastFired = lastFiredAt.get(cooldownKey(session.id, rule.id))
      if (lastFired !== undefined && now - lastFired < rule.cooldownMs) continue
      const match = rule.pattern.exec(text)
      if (match === null) continue
      matches.push({ rule, matchedText: matchedTextOf(match) })
    }
    if (matches.length === 0) return
    const source: TurnTriggerMessageSource = { kind: 'turn-trigger', ruleIds: matches.map(({ rule }) => rule.id) }
    const message = createUserMessage({
      content: [{ type: 'text', text: renderTriggerFraming(matches) }],
      source,
    })
    delivering.add(session.id)
    agent.followup(message)
    void surface.flush(session).then((flushed) => {
      if (!flushed) {
        surface.warn(`turn-trigger: Session persistence did not acknowledge trigger ${JSON.stringify(source.ruleIds)}`)
        return
      }
      for (const { rule } of matches) lastFiredAt.set(cooldownKey(session.id, rule.id), now)
    }, (error: unknown) => {
      surface.warn(`turn-trigger: delivery failed: ${error instanceof Error ? error.message : String(error)}`)
    }).finally(() => {
      delivering.delete(session.id)
    })
  }

  const unsubscribe = surface.onSessionEvent((session, event) => {
    switch (event.type) {
      case 'turn/start':
        turnText.set(session.id, [])
        return
      case 'user/message': {
        // Only a human prompt carries trigger-worthy text; synthetic context, goal
        // rounds, and this plugin's own follow-ups must not retrigger a rule.
        if (event.data.source.kind !== 'user') return
        const collected = turnText.get(session.id)
        if (collected === undefined) turnText.set(session.id, textBlocks(event.data.content))
        else collected.push(...textBlocks(event.data.content))
        return
      }
      case 'turn/end': {
        const collected = turnText.get(session.id)
        turnText.delete(session.id)
        if (collected === undefined || collected.length === 0) return
        if (event.data.reason.kind !== 'completed') return
        evaluate(session, collected.join('\n\n'))
        return
      }
      default:
        return
    }
  })

  return () => {
    unsubscribe()
    turnText.clear()
    lastFiredAt.clear()
    delivering.clear()
  }
}
