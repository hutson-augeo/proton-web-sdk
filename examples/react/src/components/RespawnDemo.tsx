import { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { selectUser } from '../store/slices/user.slice'
import { checkRespawnStatus, recordFreeAccess, payForAccess, formatTimeRemaining } from '@proton/respawn'
import type { RespawnConfig, RespawnStatus } from '@proton/respawn'
import * as SDK from '../webSdk'

// ---------------------------------------------------------------------------
// Placeholder config — swap these for your deployed contract names
// ---------------------------------------------------------------------------
const RESPAWN_CONFIG: RespawnConfig = {
  accessContract: 'myapp.access',
  accessTable: 'accounts',
  accessAction: 'setaccess',
  paymentContract: 'myapp.pay',
  paymentAction: 'unlock',
  paymentAmount: '1.0000 XPR',
  cooldownHours: 24,
}

export const RespawnDemo = () => {
  const user = useSelector(selectUser)
  const [status, setStatus] = useState<RespawnStatus | null>(null)
  const [countdown, setCountdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<'pay' | 'wait' | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-load status when user logs in
  useEffect(() => {
    if (!user.actor || !SDK.session) return
    let cancelled = false
    setLoading(true)
    setError(null)
    checkRespawnStatus(SDK.session, RESPAWN_CONFIG)
      .then((s) => { if (!cancelled) setStatus(s) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user.actor])

  // Live countdown ticker
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!status?.cooldownEnds || status.canRespawnFree) {
      setCountdown('')
      return
    }
    const end = status.cooldownEnds.getTime()
    const tick = () => {
      const remaining = end - Date.now()
      if (remaining <= 0) {
        setCountdown('00:00:00')
        setStatus((prev) => prev ? { ...prev, canRespawnFree: true, timeRemainingMs: 0 } : prev)
        if (timerRef.current) clearInterval(timerRef.current)
      } else {
        setCountdown(formatTimeRemaining(remaining))
      }
    }
    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status?.cooldownEnds, status?.canRespawnFree])

  if (!user.actor) return null

  const handlePay = async () => {
    if (!SDK.session) return
    setActing('pay')
    setError(null)
    setResultMsg(null)
    try {
      await payForAccess(SDK.session, RESPAWN_CONFIG)
      setResultMsg('Payment successful — access granted.')
      setStatus((prev) => prev ? { ...prev, canRespawnFree: false } : prev)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(null)
    }
  }

  const handleWait = async () => {
    if (!SDK.session || !status?.canRespawnFree) return
    setActing('wait')
    setError(null)
    setResultMsg(null)
    try {
      await recordFreeAccess(SDK.session, RESPAWN_CONFIG)
      setResultMsg('Access recorded on-chain.')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setActing(null)
    }
  }

  const xprDisplay = status?.xprBalance
    ? `${status.xprBalance.amount} XPR`
    : '0.0000 XPR'

  return (
    <div className="bg-purple-700 text-white rounded-2xl shadow p-6 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">Respawn Access</h2>
        <p className="text-sm text-purple-200 mt-0.5">
          {status?.canRespawnFree === false
            ? 'Your cooldown is active. Wait or pay to access now.'
            : 'Choose how to access the platform.'}
        </p>
      </div>

      {/* XPR Balance */}
      <div className="bg-white/10 rounded-xl px-4 py-3 flex justify-between items-center">
        <span className="text-sm text-purple-200">XPR Balance</span>
        <span className="font-semibold">
          {loading ? '—' : xprDisplay}
        </span>
      </div>

      {/* Countdown */}
      {!status?.canRespawnFree && countdown && (
        <div className="flex flex-col items-center gap-1">
          <span className="font-mono text-5xl font-bold tracking-widest">{countdown}</span>
          <span className="text-xs text-purple-300 uppercase tracking-wide">until free access</span>
        </div>
      )}

      {/* Token list */}
      {status && status.tokens.length > 0 && (
        <div className="bg-white/10 rounded-xl px-4 py-3 space-y-1.5">
          <p className="text-xs text-purple-300 uppercase tracking-wide mb-2">Wallet tokens</p>
          {status.tokens.map((t) => (
            <div key={t.symbol} className="flex justify-between text-sm">
              <span className="text-purple-200">{t.symbol}</span>
              <span>{t.amount}</span>
            </div>
          ))}
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="bg-red-500/20 border border-red-400/40 rounded-lg px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {resultMsg && (
        <div className="bg-green-500/20 border border-green-400/40 rounded-lg px-3 py-2 text-sm text-green-200">
          {resultMsg}
        </div>
      )}

      {/* Action buttons */}
      {status && (
        <div className="flex flex-col gap-3 mt-auto">
          <button
            onClick={handlePay}
            disabled={!status.hasEnoughXpr || acting !== null}
            title={!status.hasEnoughXpr ? 'Insufficient XPR balance' : ''}
            className="w-full bg-white text-purple-700 font-semibold py-3 rounded-xl hover:bg-purple-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {acting === 'pay' ? 'Processing…' : `Pay ${RESPAWN_CONFIG.paymentAmount}`}
          </button>

          <button
            onClick={handleWait}
            disabled={!status.canRespawnFree || acting !== null}
            title={!status.canRespawnFree ? 'Cooldown still active' : ''}
            className="w-full bg-white/15 text-white font-semibold py-3 rounded-xl hover:bg-white/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {acting === 'wait'
              ? 'Recording…'
              : status.canRespawnFree
                ? 'Free Access'
                : `Wait ${countdown}`}
          </button>
        </div>
      )}

      {loading && !status && (
        <p className="text-sm text-purple-300 text-center">Checking access status…</p>
      )}
    </div>
  )
}
