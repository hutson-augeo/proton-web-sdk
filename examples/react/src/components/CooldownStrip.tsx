import { useCallback, useEffect, useRef, useState } from 'react'
import { checkRespawnStatus, formatTimeRemaining } from '@proton/respawn'
import type { RespawnConfig, RespawnStatus } from '@proton/respawn'
import { useAppSelector } from '../hooks/store'
import { selectUser } from '../store/slices/user.slice'
import { Avatar } from './Avatar'
import * as SDK from '../webSdk'

const RESPAWN_CONFIG: RespawnConfig = {
  accessContract: 'myapp.access',
  accessTable:    'accounts',
  accessAction:   'setaccess',
  paymentContract:'myapp.pay',
  paymentAction:  'unlock',
  paymentAmount:  '1.0000 XPR',
  cooldownHours:  24,
}

type StripState = 'idle' | 'loading' | 'locked' | 'available' | 'error'

export const CooldownStrip = () => {
  const { actor, cooldownRefreshAt } = useAppSelector(selectUser)

  const [strip, setStrip]     = useState<StripState>('idle')
  const [status, setStatus]   = useState<RespawnStatus | null>(null)
  const [msLeft, setMsLeft]   = useState(0)
  const fetchingRef           = useRef(false)

  // ── Fetch on-chain cooldown status ──────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!actor || !SDK.session || fetchingRef.current) return
    fetchingRef.current = true
    setStrip('loading')
    try {
      const data = await checkRespawnStatus(SDK.session, RESPAWN_CONFIG)
      setStatus(data)
      setMsLeft(data.timeRemainingMs ?? 0)
      setStrip(data.canRespawnFree ? 'available' : 'locked')
    } catch {
      setStrip('error')
    } finally {
      fetchingRef.current = false
    }
  }, [actor])

  // Re-fetch whenever actor connects or a journey executes
  useEffect(() => {
    if (!actor) { setStrip('idle'); setStatus(null); return }
    fetchStatus()
  }, [actor, cooldownRefreshAt, fetchStatus])

  // Live countdown tick
  useEffect(() => {
    if (strip !== 'locked' || msLeft <= 0) return
    const id = setInterval(() => {
      setMsLeft(prev => {
        const next = Math.max(0, prev - 1000)
        if (next === 0) setStrip('available')
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [strip, msLeft])

  // ── Derive display values ────────────────────────────────────────────────
  // Always render a stable strip — height never collapses, no layout shift
  const isIdle      = !actor || strip === 'idle'
  const isLocked    = strip === 'locked'
  const isAvailable = strip === 'available'
  const isLoading   = strip === 'loading'

  const xprBal = status?.xprBalance?.amount ?? null

  return (
    <div
      className={[
        'w-full border-b transition-colors duration-500',
        isIdle      ? 'bg-gray-950 border-gray-800'       : '',
        isLocked    ? 'bg-gray-950 border-gray-800'        : '',
        isAvailable ? 'bg-emerald-950 border-emerald-900'  : '',
        isLoading   ? 'bg-gray-900 border-gray-800'        : '',
        strip === 'error' ? 'bg-red-950 border-red-900'    : '',
      ].join(' ')}
    >
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-3 flex-wrap min-h-[2rem]">

        {isIdle ? (
          /* Placeholder row — keeps height stable before wallet connects */
          <>
            <span className="shrink-0 w-2 h-2 rounded-full bg-gray-800" />
            <span className="flex-1" />
            <div className="shrink-0">
              <Avatar/>
            </div>
          </>
        ) : (
          <>
            {/* Status indicator dot */}
            <span className={[
              'shrink-0 w-2 h-2 rounded-full',
              isLocked    ? 'bg-orange-400 animate-pulse'  : '',
              isAvailable ? 'bg-emerald-400'               : '',
              isLoading   ? 'bg-gray-500 animate-pulse'    : '',
              strip === 'error' ? 'bg-red-400'             : '',
            ].join(' ')} />

            {/* Actor */}
            <span className="font-mono text-xs text-gray-400 shrink-0">{actor}</span>

            <span className="text-gray-700 text-xs shrink-0">·</span>

            {/* Main message */}
            {isLoading && (
              <span className="text-xs text-gray-500">Checking on-chain cooldown…</span>
            )}

            {isLocked && (
              <>
                <span className="text-xs font-semibold text-orange-300">Locked</span>
                <span className="text-gray-700 text-xs shrink-0">·</span>
                <span className="text-xs text-gray-500">Next free access in</span>
                {/* Live countdown */}
                <span className="font-mono text-sm font-bold text-white tabular-nums tracking-tight">
                  {msLeft > 0 ? formatTimeRemaining(msLeft) : '00:00:00'}
                </span>
                {status?.cooldownEnds && (
                  <>
                    <span className="text-gray-700 text-xs shrink-0 hidden sm:inline">·</span>
                    <span className="text-[10px] text-gray-600 hidden sm:inline">
                      unlocks {status.cooldownEnds.toLocaleString()}
                    </span>
                  </>
                )}
              </>
            )}

            {isAvailable && (
              <>
                <span className="text-xs font-semibold text-emerald-300">Access Available</span>
                <span className="text-gray-700 text-xs shrink-0">·</span>
                <span className="text-xs text-emerald-600">Cooldown expired — free entry ready</span>
              </>
            )}

            {strip === 'error' && (
              <span className="text-xs text-red-400">Could not fetch on-chain status</span>
            )}

            {/* Spacer */}
            <span className="flex-1" />

            {/* XPR balance */}
            {xprBal && (
              <span className="text-[10px] font-mono text-gray-600 shrink-0 hidden sm:inline">
                {xprBal} XPR
              </span>
            )}

            {/* Refresh button */}
            <button
              onClick={fetchStatus}
              disabled={isLoading}
              className="shrink-0 text-[10px] text-gray-600 hover:text-gray-300 disabled:opacity-30 transition-colors font-mono"
              title="Refresh cooldown status"
            >
              ↺ refresh
            </button>

            <span className="text-gray-700 text-xs shrink-0">·</span>

            {/* Avatar */}
            <div className="shrink-0">
              <Avatar/>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
