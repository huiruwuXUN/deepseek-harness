import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseCircleFillRegular, IconQuestionOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the input.ask seat and
// its {locked} owner share).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AskChipInjected } from './index.ts'
import css from './AskModeControl.module.css'

/** Full ask-seat component props: runtime share (standard kit + locked owner prop) & injected share & the locale seat. */
export type AskChipProps =
  PropsRuntime<'conversation.input.ask'> & InjectFace<AskChipInjected> & PropsLocale<'ask'>

/**
 * Ask-mode status over the host-computed `ask` projection. The chip renders
 * only while the effective target is ask mode (`pending ? !active : active` —
 * a folded host value, not client optimism) and executes /ask off.
 *
 * @param props - runtime share, injected ask face, and locale seat.
 * @returns the chip, or null when ask mode is not in force.
 */
export function AskChip({ useProjection, locked, exitAskMode, t }: AskChipProps) {
  const ask = useProjection('ask')
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  if (ask === undefined) return null
  const target = ask.pending ? !ask.active : ask.active
  if (!target) return null

  const off = (): void => {
    // No leaving/locked guard: both disable the button, so no click arrives.
    setLeaving(true)
    setError(null)
    void exitAskMode().then((failure) => {
      if (!aliveRef.current) return
      setLeaving(false)
      setError(failure)
    }, (reason: unknown) => {
      if (!aliveRef.current) return
      setLeaving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <span className={css.wrap}>
      <button
        type="button"
        className={css.chip}
        aria-label={t('chip.on.aria')}
        title={t('chip.on.title')}
        disabled={locked || leaving}
        onClick={off}
      >
        <span className={css.glyph} aria-hidden>
          <IconQuestionOutlineRegular className={css.restGlyph} size={14} />
          <IconCloseCircleFillRegular className={css.hoverGlyph} size={14} />
        </span>
        {t('chip.label')}
      </button>
      {error !== null && <span className={css.error} role="status" title={error}>{t('chip.exitFailed')}</span>}
    </span>
  )
}
