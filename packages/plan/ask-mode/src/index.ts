/**
 * Ask mode is logged per-agent collaboration state: while active, a
 * deployment-owned guidance section is included in each model request, so the
 * model answers questions and explains changes instead of making them. It is
 * the question-answering counterpart of plan mode: ask and plan are mutually
 * exclusive, and selecting one leaves the other, so a session always has at
 * most one collaboration mode in force. Sandbox mode and approval policy
 * enforce restrictions independently and do not read or write ask state.
 *
 * The `ask` projection folds the session log, so resume and fork restore the
 * state. User selections remain pending until the next accepted in-turn
 * pre-step. The service includes the selected state in the proposed step
 * assembly, then appends `ask/mode` from `agent/pre-step` only when the step is
 * accepted. Same-step request retries reuse their assembly.
 *
 * See packages/plan/ask-mode/README.md.
 *
 * @module @deepseek-ai/dsh-ask-mode
 */

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z as zod } from 'zod'
import type { ZodType } from 'zod'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import type { Session, UserMessage } from '@deepseek-ai/dsh-session'
import type { CommandDefinitionId } from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { ProjectionDefinition, ProjectionHandle } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-plan-mode'
import type { AskProjection, AskUnitState } from './types.ts'
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'ask-mode': { kind: 'ask-mode' } & ContextFormed
  }
}
export type * from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * Whether ask mode is in force from this point on: log-only, non-surface,
     * whole-value replace. The last `ask/mode` wins; a log with none folds to
     * inactive through the projection unit's fold.
     */
    'ask/mode': { active: boolean }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    askMode: AskModeController
  }
}

/** Deployment-owned ask guidance. */
export interface AskModeConfig {
  /** Guidance rendered as the `ask:policy` prompt section while ask mode is active. */
  section: string
}

/**
 * Validate deployment-owned ask guidance. Missing, blank, non-string, or
 * unknown fields fail at plugin load rather than being ignored.
 *
 * @param config Raw plugin config.
 * @returns A detached validated config.
 */
export function resolveConfig(config: AskModeConfig): AskModeConfig {
  const section = (config as Partial<AskModeConfig>).section
  if (typeof section !== 'string') {
    throw new Error('AskModeConfig needs a string `section`')
  }
  if (section.trim() === '') {
    throw new Error('AskModeConfig needs a non-empty `section`')
  }
  const unknown = Object.keys(config).filter(key => key !== 'section')
  if (unknown.length > 0) {
    throw new Error(`AskModeConfig has unknown key(s) ${unknown.join(', ')} — config is { section }`)
  }
  return { section }
}

const askUnitStateSchema: ZodType<AskUnitState> = zod.object({
  active: zod.boolean(),
  wanted: zod.boolean().nullable(),
  running: zod.object({
    commandId: zod.string(),
    wanted: zod.boolean(),
  }).strict().nullable(),
  activeAtLastHeader: zod.boolean().nullable(),
}).strict()

/** Wire payload schema of the `ask` projection. */
const askProjectionSchema: ZodType<AskProjection> = zod.object({
  active: zod.boolean(),
  pending: zod.boolean(),
})

/**
 * Projection of logged ask selections and committed mode. A `plan/mode` that
 * activates plan mode hands the session to plan, so it clears ask mode and any
 * outstanding ask selection: the two modes are mutually exclusive, and a later
 * plan exit does not silently revive ask mode.
 */
export const askProjectionDefinition = {
  key: 'ask',
  stateVersion: 1,
  stateSchema: askUnitStateSchema,
  init: () => ({ active: false, wanted: null, running: null, activeAtLastHeader: null }),
  apply: (state, event) => {
    if (event.type === 'command/run' && event.data.name === 'ask') {
      if (event.data.args === undefined) return state
      const wanted = event.data.args.trim() !== 'off'
      return { ...state, running: { commandId: event.data.commandId, wanted } }
    }
    if (event.type === 'command/done' && event.data.commandId === state.running?.commandId) {
      const wanted = event.data.kind === 'success' && state.running.wanted !== state.active
        ? state.running.wanted
        : null
      return { ...state, wanted, running: null }
    }
    if (event.type === 'ask/mode') {
      return { ...state, active: event.data.active, wanted: null }
    }
    if (event.type === 'plan/mode' && event.data.active) {
      return { ...state, active: false, wanted: null, running: null }
    }
    if (event.type === 'request/header') {
      return { ...state, activeAtLastHeader: state.active }
    }
    return state
  },
  wire: {
    viewSchema: askProjectionSchema,
    view: (state) => {
      const wanted = state.running?.wanted ?? state.wanted
      return { active: state.active, pending: wanted !== null && wanted !== state.active }
    },
  },
} satisfies ProjectionDefinition<'ask', AskUnitState>

/**
 * `ctx.askMode`: owns logged ask state, applies and narrates selected state at
 * step start, and owns the `ask:policy` section and the `/ask` command. Ask and
 * plan are mutually exclusive: selecting ask leaves plan, and a logged plan
 * entry clears ask through the projection fold. Client carriers expose the
 * projection's cropped `{ active, pending }` view. Agent prompt assembly fails
 * while the projection reader is not ready; callers must await plugin
 * activation before running an agent.
 */
export class AskModeController extends Service {
  static inject = ['systemPrompt', 'sessionProjections', 'agents']

  /** Validated deployment-owned guidance. */
  private readonly section: string
  private askProjectionHandle: ProjectionHandle<AskUnitState> | undefined

  /** Latest selection per session awaiting the next accepted in-turn pre-step. */
  private readonly pendingIntents = new WeakMap<Session, boolean>()

  constructor(ctx: Context, config: AskModeConfig = { section: '' }) {
    super(ctx, 'askMode')
    this.section = resolveConfig(config).section
  }

  protected async [Service.init](): Promise<void> {
    const ctx = this.ctx
    ctx.systemPrompt.section({
      name: 'ask:policy',
      order: ctx.systemPrompt.getSectionOrder('ASK_POLICY'),
      text: (context) => {
        if (context.agent === undefined) return ''
        return this.policyApplies(context.agent) ? this.section : ''
      },
    })
    this.askProjectionHandle = await ctx.sessionProjections.register(askProjectionDefinition)
    // Pre-step is outside Session.append publication, so it can append the
    // log-only mode event inside an open turn without re-entering the session.
    // A failed append remains pending for a later accepted in-turn pre-step,
    // and policy cannot block the step.
    ctx.on('agent/pre-step', async (
      { agent, signal },
      next,
    ): Promise<PreStepDecision> => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted || !this.pendingIntents.has(agent.session)) return decision
      const narration = this.narration(agent.session, this.pendingIntents.get(agent.session) === true)
      try {
        this.onBoundary(agent.session)
      } catch (error) {
        ctx.logger.warn('dsh-ask-mode: failed to append selected ask mode at step start: %o', error)
        return decision
      }
      return narration === undefined
        ? decision
        : { ...decision, messages: [...decision.messages, narration] }
    })
    // The command child activates only when a command registry is composed.
    ctx.inject(['commands'], (commandCtx) => {
      commandCtx.commands.register({
        definitionId: brandString<CommandDefinitionId>('@deepseek-ai/dsh-ask-mode'),
        name: 'ask',
        description: 'Enter or leave ask mode',
        input: { hint: '[off|message]', attachments: true },
        handler: ({ agent, rawInput, attachments }) => {
          const message = rawInput.trim()
          if (message === 'off' && attachments.length > 0) {
            return { kind: 'error', text: 'Attachments cannot accompany /ask off.' }
          }
          if (message === 'off') {
            switch (this.set(agent, false)) {
              case 'committed':
                return { kind: 'success', text: 'Ask mode off.' }
              case 'queued':
                return { kind: 'success', text: 'Leaving ask mode (applies from the next step).' }
              case 'cancelled':
                return { kind: 'success', text: 'Ask mode entry cancelled.' }
              case 'noop':
                // Repeat the queued wording while an exit still awaits the
                // next accepted pre-step; only a truly inactive session reads
                // idempotent.
                return this.loggedActive(agent.session)
                  ? { kind: 'success', text: 'Leaving ask mode (applies from the next step).' }
                  : { kind: 'success', text: 'Ask mode is already inactive.' }
            }
          }
          const outcome = this.set(agent, true)
          if (message !== '' || attachments.length > 0) {
            agent.steer(createUserMessage({
              content: [
                ...attachments,
                ...(message === '' ? [] : [{ type: 'text' as const, text: message }]),
              ],
              source: { kind: 'user' },
            }))
          }
          return {
            kind: 'success',
            text: outcome === 'committed'
              ? 'Ask mode on. Use /ask off to leave.'
              : 'Entering ask mode (applies from the next step). Use /ask off to leave.',
          }
        },
      })
    })
  }

  /**
   * Read the logged ask state and any selected state awaiting the next
   * accepted in-turn pre-step.
   *
   * @param agent The agent to read.
   * @returns Current logged state plus a pending selection, when present.
   */
  get(agent: Agent): { active: boolean; pending?: boolean } {
    const active = this.loggedActive(agent.session)
    const pending = this.pendingIntents.get(agent.session)
    return pending === undefined ? { active } : { active, pending }
  }

  /**
   * Select whether ask mode should be active. Between turns the method appends
   * the change immediately because no in-turn pre-step will run until another
   * prompt starts a turn. The open-turn fold is the idle signal: agent status
   * stays `running` through post-turn checkpointing, when no further in-turn
   * pre-step runs. During an open turn the selection remains pending until the
   * next accepted in-turn pre-step. Selecting ask mode also leaves plan mode,
   * because the two are mutually exclusive. Repeated selection of the current
   * or already-pending state is a no-op.
   *
   * @param agent The agent to switch.
   * @param active Whether ask mode should be active.
   * @returns what happened: `committed` (logged now), `queued` (awaiting the
   * next accepted in-turn pre-step), `cancelled` (an opposite pending selection
   * was cleared; the logged state already matches), or `noop` (already in that
   * state).
   */
  set(agent: Agent, active: boolean): 'committed' | 'queued' | 'cancelled' | 'noop' {
    if (active) this.leavePlan(agent)
    const session = agent.session
    const pending = this.pendingIntents.get(session)
    const target = pending ?? this.loggedActive(session)
    if (active === target) return 'noop'
    if (this.hasOpenTurn(session)) {
      this.pendingIntents.set(session, active)
      return this.loggedActive(session) === active ? 'cancelled' : 'queued'
    }
    // No open turn: commit now. Delete only after append succeeds so a
    // failed durable write leaves the selection retryable, not dropped.
    if (active === this.loggedActive(session)) {
      this.pendingIntents.delete(session)
      return 'cancelled'
    }
    session.append('ask/mode', { active })
    this.pendingIntents.delete(session)
    const narration = this.narration(session, active)
    if (narration !== undefined) agent.inject(narration)
    return 'committed'
  }

  /**
   * Whether ask guidance belongs in the request for one agent: ask must be
   * selected, and plan must be neither active nor selected, so the two modes
   * never contribute guidance to the same request.
   */
  private policyApplies(agent: Agent): boolean {
    if (!this.selectedActive(agent.session)) return false
    const plan = this.ctx.get('planMode')
    if (plan === undefined) return true
    const state = plan.get(agent)
    return !(state.pending ?? state.active)
  }

  /** Leave plan mode when ask mode is selected, so only one mode is in force. */
  private leavePlan(agent: Agent): void {
    const plan = this.ctx.get('planMode')
    if (plan === undefined) return
    plan.set(agent, false)
  }

  private loggedActive(session: Session): boolean {
    return this.askState(session).active
  }

  private selectedActive(session: Session): boolean {
    return this.pendingIntents.get(session) ?? this.loggedActive(session)
  }

  private loggedActiveAtLastHeader(session: Session): boolean | undefined {
    return this.askState(session).activeAtLastHeader ?? undefined
  }

  private hasOpenTurn(session: Session): boolean {
    return this.ctx.agents.turnBoundaryOf(session).openTurnStartSeq !== null
  }

  private askState(session: Session): AskUnitState {
    if (this.askProjectionHandle === undefined) {
      throw new Error('ask mode is not ready; await plugin activation before running an agent')
    }
    return this.askProjectionHandle.stateOf(session)
  }

  /** Append one pending selection before the next request assembly. */
  private onBoundary(session: Session): void {
    const pending = this.pendingIntents.get(session)
    if (pending === undefined) return
    if (pending === this.loggedActive(session)) {
      this.pendingIntents.delete(session)
      return
    }
    session.append('ask/mode', { active: pending })
    // Delete only after append succeeds so a later accepted in-turn pre-step
    // can retry a failed durable write.
    this.pendingIntents.delete(session)
  }

  /** Build a user-switch notice when the last logged header described the other mode. */
  private narration(session: Session, target: boolean): UserMessage | undefined {
    const told = this.loggedActiveAtLastHeader(session)
    if (told === undefined || told === target) return
    const text = target
      ? 'The user switched this session to ask mode.'
      : 'The user switched this session back to the default mode.'
    return createUserMessage({
      content: [{ type: 'text', text }],
      // The narration is already one sentence, so it is its own summary.
      source: { kind: 'ask-mode', form: 'notice', summary: text },
    })
  }
}

export default AskModeController
