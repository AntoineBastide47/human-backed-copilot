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
      aria-pressed={autoExecute}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors flex-shrink-0 ${
        autoExecute ? 'bg-black text-white' : 'bg-stone-100 text-stone-500'
      }`}
    >
      {autoExecute ? 'Enabled' : 'Disabled'}
    </button>
  )
}

describe('AutoExecuteToggle', () => {
  it('shows Disabled and aria-pressed=false by default', () => {
    render(<AutoExecuteToggle />)
    const btn = screen.getByTestId('toggle')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.textContent).toBe('Disabled')
  })

  it('shows Enabled and aria-pressed=true after click', () => {
    render(<AutoExecuteToggle />)
    fireEvent.click(screen.getByTestId('toggle'))
    const btn = screen.getByTestId('toggle')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.textContent).toBe('Enabled')
  })

  it('toggles back to Disabled on second click', () => {
    render(<AutoExecuteToggle />)
    const btn = screen.getByTestId('toggle')
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(btn.textContent).toBe('Disabled')
  })
})
