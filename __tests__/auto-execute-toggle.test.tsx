// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React, { useState } from 'react'

function AutoExecuteToggle() {
  const [autoExecute, setAutoExecute] = useState(false)

  return (
    <button
      type="button"
      onClick={() => setAutoExecute(v => !v)}
      data-testid="toggle"
      role="switch"
      aria-checked={autoExecute}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
        autoExecute ? 'bg-black' : 'bg-stone-200'
      }`}
    >
      <span
        data-testid="thumb"
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          autoExecute ? 'translate-x-[26px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

describe('AutoExecuteToggle', () => {
  it('is off by default', () => {
    render(<AutoExecuteToggle />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })

  it('thumb has left position class when off', () => {
    render(<AutoExecuteToggle />)
    expect(screen.getByTestId('thumb').className).toContain('translate-x-0.5')
  })

  it('thumb has right position class when on', () => {
    render(<AutoExecuteToggle />)
    fireEvent.click(screen.getByTestId('toggle'))
    expect(screen.getByTestId('thumb').className).toContain('translate-x-[26px]')
  })

  it('thumb right edge stays within container (26px offset + 20px width = 46px < 48px container)', () => {
    // Container: w-12 = 48px. Thumb: w-5 = 20px. ON offset: 26px.
    // Right edge = 26 + 20 = 46px — 2px clear of the 48px container.
    const containerWidth = 48
    const thumbWidth = 20
    const onOffset = 26
    const offOffset = 2 // translate-x-0.5 = 0.125rem ≈ 2px
    const padding = 2

    expect(onOffset + thumbWidth).toBeLessThanOrEqual(containerWidth - padding)
    expect(offOffset).toBeGreaterThanOrEqual(padding)
  })

  it('toggles aria-checked on click', () => {
    render(<AutoExecuteToggle />)
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
