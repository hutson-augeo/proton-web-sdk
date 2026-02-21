import { useState } from 'react'
import { CooldownStrip } from './components/CooldownStrip'
import { TokenJourney } from './components/TokenJourney'
import { Transfer } from './components/Transfer'

function App() {
  const [trayOpen, setTrayOpen] = useState(false)

  return (
    <>
      <CooldownStrip/>

      <div className="max-w-5xl mx-auto px-4 py-8 flex gap-3 items-start">

        {/* ── Transfer tray ── */}
        <div className={[
          'shrink-0 flex items-stretch transition-all duration-300 ease-in-out',
          trayOpen ? 'w-72' : 'w-8',
        ].join(' ')}>

          {/* Toggle tab — always visible */}
          <button
            onClick={() => setTrayOpen(o => !o)}
            className="w-8 shrink-0 flex flex-col items-center justify-center gap-1.5 bg-white border border-gray-200 rounded-xl shadow-sm hover:bg-gray-50 transition-colors text-gray-400 hover:text-gray-600 py-4"
            title={trayOpen ? 'Close' : 'Transfer'}
          >
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase [writing-mode:vertical-lr] rotate-180 select-none">
              Transfer
            </span>
            <span className="text-xs leading-none">{trayOpen ? '‹' : '›'}</span>
          </button>

          {/* Tray panel — slides in */}
          <div className={[
            'overflow-hidden transition-all duration-300 ease-in-out',
            trayOpen ? 'w-64 opacity-100 ml-2' : 'w-0 opacity-0 ml-0',
          ].join(' ')}>
            <div className="w-64">
              <Transfer/>
            </div>
          </div>
        </div>

        {/* ── Token Journey — primary view ── */}
        <div className="flex-1 min-w-0">
          <TokenJourney/>
        </div>

      </div>
    </>
  )
}

export default App
