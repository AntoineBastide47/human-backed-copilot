'use client'
import Link from 'next/link'
import { VerifyButton } from '@/components/verify-button'
import {
  setLocalStorageValue,
  useLocalStorageValue,
} from '@/lib/client-storage'

export default function HomePage() {
  const userId = useLocalStorageValue('hbc_userId')

  const handleVerified = (uid: string, walletAddress: string) => {
    setLocalStorageValue('hbc_userId', uid)
    setLocalStorageValue('hbc_walletAddress', walletAddress)
  }

  return (
    <div className="px-6 space-y-8 mt-4">
      {/* Hero */}
      <section className="space-y-2">
        <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-primary">
          Security Protocol
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight text-on-background leading-tight">
          Verification Center
        </h1>
      </section>

      {/* World ID card */}
      <section>
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-[0_4px_24px_-4px_rgba(38,52,61,0.06)]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-secondary text-2xl">fingerprint</span>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-on-surface">Proof of Personhood</h2>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                This app uses <span className="font-bold text-secondary">World ID</span> to verify you are a unique human — no personal data collected.
              </p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-outline-variant/10 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-outline font-bold">Privacy</p>
              <p className="text-sm font-semibold text-on-surface">Zero-Knowledge</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-outline font-bold">Security</p>
              <p className="text-sm font-semibold text-on-surface">Orb-Verified</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section>
        <ul className="space-y-3">
          {[
            { icon: 'verified_user', text: 'One unique human per agent — bots blocked' },
            { icon: 'swap_horiz', text: 'DCA & rebalance strategies on World Chain' },
            { icon: 'how_to_vote', text: 'Human approval required for every trade' },
            { icon: 'badge', text: 'ENS subname for your agent (*.copilot.eth)' },
          ].map(({ icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-secondary text-base">{icon}</span>
              </div>
              <p className="text-sm text-on-surface-variant">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* CTAs */}
      <section className="space-y-4">
        {userId ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-container rounded-xl">
              <span className="material-symbols-outlined text-tertiary text-lg">check_circle</span>
              <p className="text-sm font-semibold text-on-surface">Identity verified — you&apos;re in.</p>
            </div>
            <Link
              href="/agent/setup"
              className="w-full py-5 bg-[#162238] text-white rounded-xl font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-lg block text-center"
            >
              <span className="material-symbols-outlined">smart_toy</span>
              Set Up Your Agent
            </Link>
            <Link
              href="/dashboard"
              className="w-full py-4 bg-surface-container-low text-secondary rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform text-sm block text-center"
            >
              <span className="material-symbols-outlined text-base">analytics</span>
              View Dashboard
            </Link>
          </>
        ) : (
          <VerifyButton onVerified={handleVerified} />
        )}
      </section>

      {/* Info grid */}
      <section className="grid grid-cols-6 gap-4 pb-4">
        <div className="col-span-4 bg-surface-container-highest/40 p-5 rounded-xl space-y-2">
          <span className="material-symbols-outlined text-primary">history_edu</span>
          <h3 className="text-sm font-bold text-on-surface">Audit Trail</h3>
          <p className="text-xs text-on-surface-variant">Immutable logs of all verification and execution events.</p>
        </div>
        <div className="col-span-2 bg-primary text-white p-5 rounded-xl flex flex-col justify-between">
          <span className="material-symbols-outlined">shield</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Active</span>
        </div>
      </section>
    </div>
  )
}
