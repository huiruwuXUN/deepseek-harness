/**
 * Pure types of the ask domain: the ONE home of the `ask` projection-key
 * declaration, free of this package's host-side value imports (cordis,
 * dsh-agent, dsh-system-prompt). Two namespace projections serve it — `./types`
 * for host consumers and `./client` for client aggregates — with zero content
 * duplication.
 *
 * @module @deepseek-ai/dsh-ask-mode/types
 */


/**
 * The ask projection's wire value. `active` is the committed state in force
 * (the last `ask/mode`, inactive before the first, and inactive once a later
 * `plan/mode` hands the session to plan mode); `pending` is true while a
 * logged `/ask` selection targets a state other than `active`, has not failed
 * through its paired `command/done`, and no later mode event records that
 * state. Capability absence (ask-mode not composed) is the key's absence,
 * never a value.
 */
export interface AskProjection {
  active: boolean
  pending: boolean
}

/** Host state used to derive {@link AskProjection}. */
export interface AskUnitState {
  /** Committed ask mode. */
  active: boolean
  /** The selection's target mode; null when no selection is outstanding. */
  wanted: boolean | null
  /** The latest ask command awaiting its paired settlement. */
  running: { commandId: string; wanted: boolean } | null
  /** Active state recorded by the latest `request/header`, or null. */
  activeAtLastHeader: boolean | null
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Ask collaboration state folded from the ask command lifecycle, `ask/mode`, and plan handovers. */
    ask: AskProjection
  }
}
