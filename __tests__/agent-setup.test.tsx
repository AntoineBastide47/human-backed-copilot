// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// Inline StepTracker since it's not exported — keep in sync with page.tsx
type SetupStatus = 'idle' | 'submitting' | 'registering' | 'active' | 'timeout' | 'error'

function StepTracker({ setupStatus }: { setupStatus: SetupStatus }) {
  const steps = [
    { key: 'submit',      label: 'Submitting to AgentBook' },
    { key: 'registering', label: 'Registering on-chain'    },
    { key: 'active',      label: 'Agent active'             },
  ]
  const activeIdx =
    setupStatus === 'idle'        ? -1 :
    setupStatus === 'submitting'  ? 0  :
    setupStatus === 'registering' ? 1  :
    setupStatus === 'active'      ? 2  : 0

  return (
    <div>
      {steps.map((step, i) => {
        const done    = i < activeIdx || setupStatus === 'active'
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
  it('renders all three step labels', () => {
    render(<StepTracker setupStatus="submitting" />)
    expect(screen.getByText('Submitting to AgentBook')).toBeTruthy()
    expect(screen.getByText('Registering on-chain')).toBeTruthy()
    expect(screen.getByText('Agent active')).toBeTruthy()
  })

  it('marks step 0 as current when submitting', () => {
    render(<StepTracker setupStatus="submitting" />)
    const step = screen.getByTestId('step-submit').querySelector('[data-current]')
    expect(step?.getAttribute('data-current')).toBe('true')
    expect(step?.getAttribute('data-done')).toBe('false')
  })

  it('marks step 0 done and step 1 current when registering', () => {
    render(<StepTracker setupStatus="registering" />)
    const s0 = screen.getByTestId('step-submit').querySelector('[data-done]')
    const s1 = screen.getByTestId('step-registering').querySelector('[data-current]')
    expect(s0?.getAttribute('data-done')).toBe('true')
    expect(s1?.getAttribute('data-current')).toBe('true')
  })

  it('marks all steps done when active', () => {
    render(<StepTracker setupStatus="active" />)
    const indicators = document.querySelectorAll('[data-done]')
    indicators.forEach(el => expect(el.getAttribute('data-done')).toBe('true'))
  })

  it('shows ✓ checkmarks for done steps', () => {
    render(<StepTracker setupStatus="active" />)
    const checks = screen.getAllByText('✓')
    expect(checks).toHaveLength(3)
  })

  it('shows step numbers (not ✓) for incomplete steps when idle', () => {
    render(<StepTracker setupStatus="idle" />)
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByText('✓')).toBeNull()
  })

  it('step 1 done, step 2 current when registering', () => {
    render(<StepTracker setupStatus="registering" />)
    // Step 0 (submit) should show ✓
    const submitStep = screen.getByTestId('step-submit')
    expect(submitStep.textContent).toContain('✓')
    // Step 1 (registering) should show number 2, not ✓
    const regStep = screen.getByTestId('step-registering')
    expect(regStep.textContent).toContain('2')
  })
})
