'use client'

export function TopAppBar() {
  return (
    <header className="fixed top-0 w-full z-50 bg-slate-50/80 backdrop-blur-md">
      <div className="flex justify-between items-center px-6 h-16 w-full">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-secondary text-base">account_balance</span>
          </div>
          <span className="text-lg font-bold text-stone-900 uppercase tracking-widest">
            Copilot
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-stone-700">support_agent</span>
        </div>
      </div>
      <div className="bg-slate-200/50 h-px w-full" />
    </header>
  )
}
