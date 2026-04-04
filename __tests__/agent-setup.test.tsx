// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

type SetupStatus = 'idle' | 'submitting' | 'active' | 'error'

function StepTracker({ setupStatus }: { setupStatus: SetupStatus }) {
  const steps = [
    { key: 'cli', label: 'Register with AgentKit CLI' },
    { key: 'submit', label: 'Create agent' },
    { key: 'active', label: 'Agent active' },
  ]

  const activeIdx =
    setupStatus === 'active' ? 2 :
    setupStatus === 'submitting' ? 1 :
    0

  return (
    <div>
      {steps.map((step, i) => {
        const done = i < activeIdx || setupStatus === 'active'
        const current = i === activeIdx && setupStatus !== 'active'
        return (
          <div key={step.key} data-testid={`step-${step.key}`}>
            <span data-done={done} data-current={current}>
              {done ? '✓' : i + 1}
            </span>
            <span>{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}

describe('StepTracker', () => {
  it('renders the CLI-first labels', () => {
    render(<StepTracker setupStatus="idle" />)
    expect(screen.getByText('Register with AgentKit CLI')).toBeTruthy()
    expect(screen.getByText('Create agent')).toBeTruthy()
    expect(screen.getByText('Agent active')).toBeTruthy()
  })

  it('marks the CLI step as current while idle', () => {
    render(<StepTracker setupStatus="idle" />)
    const step = screen.getByTestId('step-cli').querySelector('[data-current]')
    expect(step?.getAttribute('data-current')).toBe('true')
    expect(step?.getAttribute('data-done')).toBe('false')
  })

  it('marks the CLI step done and create step current while submitting', () => {
    render(<StepTracker setupStatus="submitting" />)
    const cli = screen.getByTestId('step-cli').querySelector('[data-done]')
    const submit = screen.getByTestId('step-submit').querySelector('[data-current]')
    expect(cli?.getAttribute('data-done')).toBe('true')
    expect(submit?.getAttribute('data-current')).toBe('true')
  })

  it('marks all steps done when active', () => {
    render(<StepTracker setupStatus="active" />)
    const indicators = document.querySelectorAll('[data-done]')
    indicators.forEach(el => expect(el.getAttribute('data-done')).toBe('true'))
  })
})
