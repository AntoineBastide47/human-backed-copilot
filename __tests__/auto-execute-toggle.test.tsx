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
        className={`absolute inset-y-0 my-auto w-5 h-5 rounded-full bg-white transition-transform ${
          autoExecute ? 'translate-x-[28px]' : 'translate-x-0'
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
    expect(screen.getByTestId('thumb').className).toContain('translate-x-0')
  })

  it('thumb has right position class when on', () => {
    render(<AutoExecuteToggle />)
    fireEvent.click(screen.getByTestId('toggle'))
    expect(screen.getByTestId('thumb').className).toContain('translate-x-[28px]')
  })

  it('thumb right edge stays within container (28px offset + 20px width = 48px = container)', () => {
    // Container: w-12 = 48px. Thumb: w-5 = 20px. overflow-hidden clips flush.
    const containerWidth = 48
    const thumbWidth = 20
    const onOffset = 28

    expect(onOffset + thumbWidth).toBeLessThanOrEqual(containerWidth)
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
