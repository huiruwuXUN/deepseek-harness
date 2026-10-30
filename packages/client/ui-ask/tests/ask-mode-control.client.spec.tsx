// @vitest-environment jsdom
/**
 * The ask chip over the `ask` projection: nothing renders while the capability
 * is absent or the effective target is the default mode; while ask mode is the
 * target the chip executes /ask off and stays visible through failures until
 * the projection confirms the exit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { AskProjection } from '@deepseek-ai/dsh-ask-mode/types'
import { AskChip, type AskChipProps } from '../src/client/AskModeControl.tsx'
import css from '../src/client/AskModeControl.module.css'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: AskChipProps['t'] = makeTranslate(zh, commonZh)


function setup(
  ask: AskProjection | undefined,
  exitAskMode = vi.fn(() => Promise.resolve<string | null>(null)),
  locked = false,
) {
  const store = createSnapshotStore<{ value: AskProjection | undefined }>({ value: ask })
  const useSelector = bindSnapshotSelector(store)
  const useProjection: AskChipProps['useProjection'] = (key: string) =>
    (key === 'ask' ? useSelector(state => state.value) : undefined)
  // The chip reads only its owner prop, inject face and locale seat; the rest of
  // the standard session kit stays unused, so the fixture supplies the consumed share.
  const consumed: Partial<AskChipProps> = { locked, exitAskMode, useProjection, t }
  const view = render(<AskChip {...(consumed as AskChipProps)} />)
  return { store, exitAskMode, view }
}

const chip = () => screen.getByRole('button', { name: '问答模式已开启，按下关闭' })

describe('AskChip', () => {
  it('renders nothing for an absent capability or a default-mode target', () => {
    const absent = setup(undefined)
    expect(absent.view.container.innerHTML).toBe('')
    cleanup()
    const inactive = setup({ active: false, pending: false })
    expect(inactive.view.container.innerHTML).toBe('')
    cleanup()
    const leaving = setup({ active: true, pending: true })
    expect(leaving.view.container.innerHTML).toBe('')
  })

  it('renders the Ask status for active and pending-entry targets', () => {
    setup({ active: true, pending: false })
    expect(chip().textContent).toBe('问答')
    cleanup()
    setup({ active: false, pending: true })
    expect(chip().textContent).toBe('问答')
  })

  it('leads with the question glyph and swaps in the circled close only while hovered', () => {
    setup({ active: true, pending: false })
    const glyphs = chip().querySelectorAll('svg')
    expect(glyphs).toHaveLength(2)
    const slot = glyphs[0]!.parentElement!
    expect(slot).toBe(chip().firstElementChild)
    expect(slot.getAttribute('aria-hidden')).toBe('true')
    expect(glyphs[0]!.classList.contains(css.restGlyph!)).toBe(true)
    expect(glyphs[1]!.classList.contains(css.hoverGlyph!)).toBe(true)
    expect(glyphs[1]!.parentElement).toBe(slot)
    expect(chip().lastChild?.textContent).toBe('问答')
  })

  it('executes /ask off once and follows the projection down', async () => {
    let resolve!: (value: string | null) => void
    const exitAskMode = vi.fn(() => new Promise<string | null>((done) => { resolve = done }))
    const { store } = setup({ active: true, pending: false }, exitAskMode)
    fireEvent.click(chip())
    expect(exitAskMode).toHaveBeenCalledTimes(1)
    fireEvent.click(chip())
    expect(exitAskMode).toHaveBeenCalledTimes(1)
    resolve(null)
    store.set({ value: { active: true, pending: true } })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '问答模式已开启，按下关闭' })).toBeNull()
    })
  })

  it('disables under the locked owner prop', () => {
    setup({ active: true, pending: false }, vi.fn(), true)
    expect((chip() as HTMLButtonElement).disabled).toBe(true)
  })

  it('surfaces admission and transport failures while staying visible', async () => {
    const exitAskMode = vi.fn()
      .mockResolvedValueOnce('host said no')
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce('socket closed')
    setup({ active: true, pending: false }, exitAskMode)
    fireEvent.click(chip())
    expect((await screen.findByText('退出问答模式失败')).getAttribute('title')).toBe('host said no')
    expect(chip()).toBeTruthy()

    fireEvent.click(chip())
    expect(await screen.findByTitle('network down')).toBeTruthy()

    fireEvent.click(chip())
    expect(await screen.findByTitle('socket closed')).toBeTruthy()
  })

  it('ignores in-flight fulfillment and rejection after unmount', () => {
    let resolve!: (value: string | null) => void
    const successful = setup(
      { active: true, pending: false },
      vi.fn(() => new Promise<string | null>((done) => { resolve = done })),
    )
    fireEvent.click(chip())
    successful.view.unmount()
    expect(() => { resolve(null) }).not.toThrow()

    let reject!: (reason: unknown) => void
    const exitAskMode = vi.fn(() => new Promise<string | null>((_done, fail) => { reject = fail }))
    const { view } = setup({ active: true, pending: false }, exitAskMode)
    fireEvent.click(chip())
    view.unmount()
    expect(() => { reject(new Error('late')) }).not.toThrow()
  })
})
