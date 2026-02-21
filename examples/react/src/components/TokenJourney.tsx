import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useAppDispatch } from '../hooks/store'
import { bumpCooldown, setUser } from '../store/slices/user.slice'
import { checkRespawnStatus, formatTimeRemaining, payForAccess, recordFreeAccess } from '@proton/respawn'
import type { RespawnConfig, RespawnStatus } from '@proton/respawn'
import * as SDK from '../webSdk'
import { log } from '../utils/log'

// ─────────────────────────────────────────────────────────────────────────────
// Config (swap for real contracts when deployed)
// ─────────────────────────────────────────────────────────────────────────────
const RESPAWN_CONFIG: RespawnConfig = {
  accessContract: 'myapp.access',
  accessTable:    'accounts',
  accessAction:   'setaccess',
  paymentContract:'myapp.pay',
  paymentAction:  'unlock',
  paymentAmount:  '1.0000 XPR',
  cooldownHours:  24,
}

// Set to false once contracts are deployed on-chain.
// In demo mode the execute step simulates a successful transaction so the
// full 5-step journey can be exercised without live contracts.
const DEMO_MODE = true

// ─────────────────────────────────────────────────────────────────────────────
// Error classification
// ─────────────────────────────────────────────────────────────────────────────
type ErrorCode =
  | 'WALLET_REJECTED'
  | 'WALLET_TIMEOUT'
  | 'WALLET_NOT_CONNECTED'
  | 'NETWORK_ERROR'
  | 'HTTP_400'
  | 'HTTP_500'
  | 'INSUFFICIENT_BALANCE'
  | 'CONTRACT_NOT_FOUND'
  | 'TX_REJECTED'
  | 'TX_FAILED'
  | 'UNKNOWN'

interface JourneyError { code: ErrorCode; message: string; detail: string }

function classifyError(err: unknown): JourneyError {
  const raw = err instanceof Error ? err.message : String(err)
  const msg = raw.toLowerCase()

  if (/cancel|e_cancel|user cancel/i.test(raw))
    return { code: 'TX_REJECTED',          message: 'Transaction rejected by user',          detail: raw }
  if (/e_timeout|e_delivery|timed out/i.test(raw))
    return { code: 'WALLET_TIMEOUT',        message: 'Wallet did not respond in time',        detail: raw }
  if (/no session|not connected|wallet/i.test(msg) && /not|miss/i.test(msg))
    return { code: 'WALLET_NOT_CONNECTED',  message: 'Wallet not connected',                  detail: raw }
  if (/load failed|failed to fetch|network/i.test(raw))
    return { code: 'NETWORK_ERROR',         message: 'Network request failed',                detail: raw }
  if (/abi|assertion failed|unknown contract/i.test(raw))
    return { code: 'CONTRACT_NOT_FOUND',    message: 'Contract not found or ABI unavailable', detail: raw }
  if (/insufficient|balance|overdrawn/i.test(raw))
    return { code: 'INSUFFICIENT_BALANCE',  message: 'Insufficient XPR balance',              detail: raw }
  if (/status 400|400/i.test(raw))
    return { code: 'HTTP_400',              message: 'Bad request (HTTP 400)',                detail: raw }
  if (/status 5|500|503/i.test(raw))
    return { code: 'HTTP_500',              message: 'Server error (HTTP 5xx)',                detail: raw }
  if (/broadcast|transaction failed|3\d{6}/i.test(raw))
    return { code: 'TX_FAILED',             message: 'Transaction failed on-chain',            detail: raw }

  return { code: 'UNKNOWN', message: raw, detail: raw }
}

// ─────────────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────────────
type StepStatus = 'idle' | 'loading' | 'success' | 'error'
type PathChoice  = 'pay' | 'free' | null

interface JourneyState {
  wallet:  { status: StepStatus; actor?: string;           error?: JourneyError }
  tokens:  { status: StepStatus; balances?: string[];      error?: JourneyError }
  status:  { status: StepStatus; data?: RespawnStatus;     error?: JourneyError }
  path:    { status: StepStatus; choice: PathChoice;       error?: JourneyError }
  execute: { status: StepStatus; txId?: string;            error?: JourneyError }
}

type Action =
  | { type: 'RESET' }
  | { type: 'WALLET_LOADING' }
  | { type: 'WALLET_SUCCESS'; actor: string }
  | { type: 'WALLET_ERROR';   error: JourneyError }
  | { type: 'TOKENS_LOADING' }
  | { type: 'TOKENS_SUCCESS'; balances: string[] }
  | { type: 'TOKENS_ERROR';   error: JourneyError }
  | { type: 'STATUS_LOADING' }
  | { type: 'STATUS_SUCCESS'; data: RespawnStatus }
  | { type: 'STATUS_ERROR';   error: JourneyError }
  | { type: 'PATH_SELECT';    choice: PathChoice }
  | { type: 'EXECUTE_LOADING' }
  | { type: 'EXECUTE_SUCCESS'; txId?: string }
  | { type: 'EXECUTE_ERROR';   error: JourneyError }

const INITIAL: JourneyState = {
  wallet:  { status: 'idle' },
  tokens:  { status: 'idle' },
  status:  { status: 'idle' },
  path:    { status: 'idle', choice: null },
  execute: { status: 'idle' },
}

function reducer(state: JourneyState, action: Action): JourneyState {
  switch (action.type) {
    case 'RESET':            return { ...INITIAL }
    case 'WALLET_LOADING':   return { ...INITIAL, wallet: { status: 'loading' } }
    case 'WALLET_SUCCESS':   return { ...state, wallet:  { status: 'success', actor: action.actor } }
    case 'WALLET_ERROR':     return { ...state, wallet:  { status: 'error', error: action.error } }
    case 'TOKENS_LOADING':   return { ...state, tokens:  { status: 'loading' } }
    case 'TOKENS_SUCCESS':   return { ...state, tokens:  { status: 'success', balances: action.balances } }
    case 'TOKENS_ERROR':     return { ...state, tokens:  { status: 'error', error: action.error } }
    case 'STATUS_LOADING':   return { ...state, status:  { status: 'loading' } }
    case 'STATUS_SUCCESS':   return { ...state, status:  { status: 'success', data: action.data } }
    case 'STATUS_ERROR':     return { ...state, status:  { status: 'error', error: action.error } }
    case 'PATH_SELECT':      return { ...state, path:    { status: 'success', choice: action.choice } }
    case 'EXECUTE_LOADING':  return { ...state, execute: { status: 'loading' } }
    case 'EXECUTE_SUCCESS':  return { ...state, execute: { status: 'success', txId: action.txId } }
    case 'EXECUTE_ERROR':    return { ...state, execute: { status: 'error', error: action.error } }
    default:                 return state
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export const TokenJourney = () => {
  const [j, dispatch]  = useReducer(reducer, INITIAL)
  const reduxDispatch  = useAppDispatch()
  const runningRef     = useRef(false)

  // ── helpers ────────────────────────────────────────────────────────────────
  const stepDone = (step: keyof JourneyState) => j[step].status === 'success'
  const allIdle  = Object.values(j).every(s => s.status === 'idle')
  const busy     = Object.values(j).some(s => s.status === 'loading')

  // ── Step 1 — wallet ────────────────────────────────────────────────────────
  const runWallet = useCallback(async () => {
    dispatch({ type: 'WALLET_LOADING' })
    log({ level: 'info', step: 'wallet', message: 'Connecting wallet…' })
    try {
      if (!SDK.session) await SDK.login()
      if (!SDK.session?.auth) throw new Error('No session after login')
      const actor = SDK.session.auth.actor.toString()
      const perm  = SDK.session.auth.permission.toString()
      reduxDispatch(setUser({ actor, permission: perm, accountData: undefined, cooldownRefreshAt: 0 }))
      dispatch({ type: 'WALLET_SUCCESS', actor })
      log({ level: 'success', step: 'wallet', message: `Connected as ${actor}`, data: { actor, permission: perm } })
      return true
    } catch (err) {
      const e = classifyError(err)
      dispatch({ type: 'WALLET_ERROR', error: e })
      log({ level: 'error', step: 'wallet', message: e.message, data: { code: e.code, detail: e.detail } })
      return false
    }
  }, [reduxDispatch])

  // ── Step 2 — tokens ────────────────────────────────────────────────────────
  const runTokens = useCallback(async () => {
    if (!SDK.session) return false
    dispatch({ type: 'TOKENS_LOADING' })
    log({ level: 'info', step: 'tokens', message: 'Fetching token balances…' })
    try {
      const result = await SDK.session.client.get_table_rows({
        code: 'eosio.token',
        scope: SDK.session.auth.actor.toString(),
        table: 'accounts',
        limit: 100,
      })
      const balances: string[] = (result.rows as Array<{ balance: string }>).map(r => r.balance)
      dispatch({ type: 'TOKENS_SUCCESS', balances })
      log({ level: 'success', step: 'tokens', message: `Found ${balances.length} token(s)`, data: balances })
      return true
    } catch (err) {
      const e = classifyError(err)
      dispatch({ type: 'TOKENS_ERROR', error: e })
      log({ level: 'error', step: 'tokens', message: e.message, data: { code: e.code, detail: e.detail } })
      return false
    }
  }, [])

  // ── Step 3 — status ────────────────────────────────────────────────────────
  const runStatus = useCallback(async () => {
    if (!SDK.session) return false
    dispatch({ type: 'STATUS_LOADING' })
    log({ level: 'info', step: 'status', message: 'Checking on-chain respawn status…' })
    try {
      const data = await checkRespawnStatus(SDK.session, RESPAWN_CONFIG)
      dispatch({ type: 'STATUS_SUCCESS', data })
      log({ level: 'success', step: 'status', message: 'Status fetched', data: {
        canRespawnFree: data.canRespawnFree,
        xprBalance:     data.xprBalance?.amount ?? '0',
        hasEnoughXpr:   data.hasEnoughXpr,
        cooldownEnds:   data.cooldownEnds?.toISOString(),
      }})
      return true
    } catch (err) {
      const e = classifyError(err)
      dispatch({ type: 'STATUS_ERROR', error: e })
      log({ level: 'error', step: 'status', message: e.message, data: { code: e.code, detail: e.detail } })
      return false
    }
  }, [])

  // ── Step 5 — execute ───────────────────────────────────────────────────────
  const runExecute = useCallback(async (choice: PathChoice) => {
    if (!SDK.session || !choice) return false
    dispatch({ type: 'EXECUTE_LOADING' })
    log({ level: 'info', step: 'execute', message: `Executing ${choice === 'pay' ? 'XPR payment' : 'free access record'}…` })

    // Demo mode: simulate success without hitting placeholder contracts
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 800))
      const txId = `demo-${Date.now()}`
      dispatch({ type: 'EXECUTE_SUCCESS', txId })
      reduxDispatch(bumpCooldown())
      log({ level: 'warn', step: 'execute', message: '[DEMO] Transaction simulated — deploy contracts to go live', data: { choice, txId } })
      return true
    }

    try {
      let txResult: Awaited<ReturnType<typeof payForAccess>> | undefined
      if (choice === 'pay') {
        txResult = await payForAccess(SDK.session, RESPAWN_CONFIG)
      } else {
        txResult = await recordFreeAccess(SDK.session, RESPAWN_CONFIG)
      }
      const txId = (txResult?.payload as Record<string, unknown>)?.tx as string | undefined
      dispatch({ type: 'EXECUTE_SUCCESS', txId })
      reduxDispatch(bumpCooldown())
      log({ level: 'success', step: 'execute', message: 'Transaction broadcast', data: { choice, txId: txId ?? 'n/a' } })
      return true
    } catch (err) {
      const e = classifyError(err)
      dispatch({ type: 'EXECUTE_ERROR', error: e })
      log({ level: 'error', step: 'execute', message: e.message, data: { code: e.code, detail: e.detail } })
      return false
    }
  }, [reduxDispatch])

  // ── Main trigger ───────────────────────────────────────────────────────────
  const startJourney = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    log({ level: 'info', step: 'journey', message: '─── Journey started ───────────────────' })
    try {
      if (!(await runWallet()))  return
      if (!(await runTokens()))  return
      if (!(await runStatus()))  return
      // Step 4 (path selection) is user-driven — journey pauses here
      log({ level: 'info', step: 'journey', message: 'Waiting for path selection…' })
    } finally {
      runningRef.current = false
    }
  }, [runWallet, runTokens, runStatus])

  // ── Path selection (step 4) ────────────────────────────────────────────────
  const selectPath = useCallback(async (choice: PathChoice) => {
    if (!stepDone('status') || busy) return
    const statusData = j.status.data!
    if (choice === 'pay' && !statusData.hasEnoughXpr) return
    if (choice === 'free' && !statusData.canRespawnFree) return

    dispatch({ type: 'PATH_SELECT', choice })
    log({ level: 'info', step: 'path', message: `Path selected: ${choice}`, data: { choice } })
    await runExecute(choice)
    log({ level: 'info', step: 'journey', message: '─── Journey complete ──────────────────' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [j.status, busy, runExecute])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
    log({ level: 'info', step: 'journey', message: '─── Journey reset ─────────────────────' })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  const statusData = j.status.data

  return (
    <div className="rounded-2xl shadow border border-gray-100 flex flex-col md:flex-row overflow-hidden">

      {/* ── Left: Journey Steps ── */}
      <div className="flex-1 bg-white p-6 flex flex-col gap-4 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Token Journey</h2>
            <p className="text-xs text-gray-400 mt-0.5">Gated step-by-step XPR payment flow</p>
          </div>
          {!allIdle && (
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0">
              Reset
            </button>
          )}
        </div>

        {/* Trigger */}
        {allIdle && (
          <button
            onClick={startJourney}
            className="w-full bg-purple-600 hover:bg-purple-700 active:scale-[.98] transition text-white font-semibold py-3 rounded-xl"
          >
            Start Journey
          </button>
        )}

        {/* Steps */}
        <div className="flex flex-col gap-3">
          <Step
            n={1} title="Connect Wallet"
            status={j.wallet.status}
            error={j.wallet.error}
            retry={() => { dispatch({ type: 'RESET' }); setTimeout(startJourney, 0) }}
          >
            {j.wallet.actor && <Pill>{j.wallet.actor}</Pill>}
          </Step>

          <Step
            n={2} title="Fetch Token Balances"
            status={j.tokens.status}
            error={j.tokens.error}
            retry={async () => { if (!(await runTokens())) return; await runStatus() }}
          >
            {j.tokens.balances?.map(b => <Pill key={b}>{b}</Pill>)}
            {j.tokens.balances?.length === 0 && <Dim>No tokens found</Dim>}
          </Step>

          <Step
            n={3} title="Check Respawn Status"
            status={j.status.status}
            error={j.status.error}
            retry={async () => { await runStatus() }}
          >
            {statusData && (
              <div className="text-xs space-y-0.5">
                <Kv k="XPR balance"     v={statusData.xprBalance?.amount ?? '0.0000'} />
                <Kv k="Free access"     v={statusData.canRespawnFree ? 'Available' : 'Locked'} highlight={statusData.canRespawnFree} />
                <Kv k="Enough XPR"      v={statusData.hasEnoughXpr ? 'Yes' : 'No'} highlight={statusData.hasEnoughXpr} />
                {statusData.cooldownEnds && (
                  <Kv k="Cooldown ends" v={statusData.cooldownEnds.toLocaleString()} />
                )}
              </div>
            )}
          </Step>

          <Step n={4} title="Select Access Path" status={j.path.status} error={j.path.error}>
            {j.path.choice
              ? <Pill>{j.path.choice === 'pay' ? 'Pay 1 XPR' : 'Free Access'}</Pill>
              : stepDone('status') && <Dim>Choose in vault →</Dim>
            }
          </Step>

          <Step
            n={5} title="Execute Transaction"
            status={j.execute.status}
            error={j.execute.error}
            retry={() => selectPath(j.path.choice)}
          >
            {j.execute.status === 'success' && (
              <div className="text-xs space-y-0.5">
                <Kv k="Path"  v={j.path.choice === 'pay' ? 'Paid 1 XPR' : 'Free access recorded'} highlight />
                {j.execute.txId && <Kv k="Tx ID" v={j.execute.txId} />}
              </div>
            )}
          </Step>
        </div>

        {/* Restart */}
        {j.execute.status === 'success' && (
          <button
            onClick={reset}
            className="w-full border border-purple-300 text-purple-700 hover:bg-purple-50 font-semibold py-2.5 rounded-xl text-sm transition"
          >
            Start New Journey
          </button>
        )}
      </div>

      {/* ── Right: Vault Gate — expands to hero clock after selection ── */}
      <div className={[
        'shrink-0 border-t md:border-t-0 md:border-l border-gray-100 flex flex-col transition-all duration-500',
        j.path.choice ? 'md:flex-1' : 'md:w-64',
      ].join(' ')}>
        <VaultGate
          embedded
          statusData={statusData}
          busy={busy}
          choice={j.path.choice}
          executeStatus={j.execute.status}
          onSelect={selectPath}
          config={RESPAWN_CONFIG}
        />
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_ICON: Record<StepStatus, React.ReactNode> = {
  idle:    <span className="w-5 h-5 rounded-full border-2 border-gray-200 block" />,
  loading: <Spinner />,
  success: <span className="text-green-500 text-base leading-none">✓</span>,
  error:   <span className="text-red-500 text-base leading-none">✕</span>,
}

const BORDER_COLOR: Record<StepStatus, string> = {
  idle:    'border-gray-100',
  loading: 'border-purple-300',
  success: 'border-green-400',
  error:   'border-red-400',
}

interface StepProps {
  n: number
  title: string
  status: StepStatus
  error?: JourneyError
  retry?: () => void
  children?: React.ReactNode
}

function Step({ n, title, status, error, retry, children }: StepProps) {
  return (
    <div className={`border-l-4 ${BORDER_COLOR[status]} pl-3 py-1 flex flex-col gap-1`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{n}.</span>
        <span className="text-sm font-medium text-gray-700 flex-1">{title}</span>
        <span className="shrink-0 flex items-center">{STATUS_ICON[status]}</span>
      </div>
      {children && <div className="ml-6 flex flex-wrap gap-1">{children}</div>}
      {error && (
        <div className="ml-6 flex items-start gap-2">
          <div className="flex-1">
            <span className="inline-block bg-red-50 border border-red-200 text-red-700 text-xs rounded px-1.5 py-0.5 font-mono">
              {error.code}
            </span>
            <p className="text-xs text-red-600 mt-0.5">{error.message}</p>
            <p className="text-xs text-gray-400 mt-0.5 break-all">{error.detail}</p>
          </div>
          {retry && (
            <button
              onClick={retry}
              className="shrink-0 text-xs text-purple-600 hover:underline mt-0.5"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-purple-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-purple-50 text-purple-700 text-xs rounded-full px-2 py-0.5 font-medium">
      {children}
    </span>
  )
}

function Dim({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-gray-400">{children}</span>
}

function Kv({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-24 shrink-0">{k}</span>
      <span className={highlight ? 'text-green-600 font-medium' : 'text-gray-700'}>{v}</span>
    </div>
  )
}

function ClockSegment({ value, label, active, expired }: {
  value: string
  label: string
  active: boolean
  expired: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={[
        'w-[4.5rem] h-[4.5rem] flex items-center justify-center rounded-lg border transition-colors duration-500',
        active   ? 'border-orange-900/60 bg-orange-950/30' :
        expired  ? 'border-emerald-900/60 bg-emerald-950/30' :
                   'border-gray-800 bg-gray-900/40',
      ].join(' ')}>
        <span className={[
          'font-mono text-4xl font-bold tabular-nums leading-none tracking-tight transition-colors duration-500',
          active   ? 'text-orange-300' :
          expired  ? 'text-emerald-400' :
                     'text-gray-700',
        ].join(' ')}>
          {value}
        </span>
      </div>
      <span className="text-[8px] font-mono tracking-[0.35em] text-gray-600 uppercase">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Vault Gate — always-visible Step 4 split-door UI
// ─────────────────────────────────────────────────────────────────────────────
interface VaultGateProps {
  statusData?: RespawnStatus
  busy: boolean
  choice: PathChoice
  executeStatus: StepStatus
  onSelect: (choice: PathChoice) => void
  config: RespawnConfig
  embedded?: boolean
}

function VaultGate({ statusData, busy, choice, executeStatus, onSelect, config, embedded }: VaultGateProps) {
  const engaged  = !!statusData
  const chosen   = !!choice
  const canPay   = engaged && !busy && !chosen && !!statusData?.hasEnoughXpr
  const canFree  = engaged && !busy && !chosen && !!statusData?.canRespawnFree

  const [msLeft, setMsLeft]     = useState<number>(statusData?.timeRemainingMs ?? 0)
  const [isTicking, setTicking] = useState(false)
  const seededFromExec          = useRef(false)

  // ── Seed from execute success — only for free path (paid = no wait) ─────
  useEffect(() => {
    if (executeStatus !== 'success' || seededFromExec.current) return
    if (choice !== 'free') return   // paid path: clock stays idle — you bought immediate access
    seededFromExec.current = true
    const ms = (config.cooldownHours ?? 24) * 60 * 60 * 1000
    setMsLeft(ms)
    setTicking(true)
  }, [executeStatus, choice, config.cooldownHours])

  // ── Seed from pre-existing on-chain cooldown (only before execute) ──────
  useEffect(() => {
    if (seededFromExec.current) return   // execute seed takes precedence
    if (statusData?.timeRemainingMs && statusData.timeRemainingMs > 0) {
      setMsLeft(statusData.timeRemainingMs)
      setTicking(true)
    } else {
      setMsLeft(0)
      setTicking(false)
    }
  }, [statusData?.timeRemainingMs])

  // ── Countdown tick ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTicking) return
    const id = setInterval(() => {
      setMsLeft(prev => {
        const next = Math.max(0, prev - 1000)
        if (next === 0) setTicking(false)
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isTicking])

  // ── Blinking colon — only blinks while clock is running ─────────────────
  const [colonOn, setColonOn] = useState(true)
  useEffect(() => {
    if (!isTicking) { setColonOn(true); return }
    const id = setInterval(() => setColonOn(v => !v), 500)
    return () => clearInterval(id)
  }, [isTicking])

  // Decompose ms into segments
  const hours   = Math.floor(msLeft / 3_600_000)
  const minutes = Math.floor((msLeft % 3_600_000) / 60_000)
  const seconds = Math.floor((msLeft % 60_000) / 1000)
  const hStr = String(hours).padStart(2, '0')
  const mStr = String(minutes).padStart(2, '0')
  const sStr = String(seconds).padStart(2, '0')

  const timeStr = engaged
    ? (msLeft > 0 ? formatTimeRemaining(msLeft) : (statusData?.canRespawnFree ? 'READY' : '00:00:00'))
    : '--:--:--'

  const clockActive = engaged && msLeft > 0
  const expired     = engaged && msLeft === 0

  return (
    <div className={[
      'overflow-hidden transition-all duration-500 flex flex-col flex-1 bg-gray-950',
      embedded ? '' : 'rounded-2xl border shadow-xl',
      !embedded && (chosen ? 'border-purple-800/50' : engaged ? 'border-gray-800' : 'border-gray-800/30'),
    ].join(' ')}>

      {/* ── Header ── */}
      <div className={[
        'px-4 pt-4 pb-3 border-b transition-colors duration-500',
        chosen ? 'border-purple-900/40' : 'border-gray-800/60',
      ].join(' ')}>
        <p className={[
          'text-[9px] font-mono tracking-[0.3em] uppercase transition-colors duration-500',
          engaged ? 'text-purple-500/80' : 'text-gray-700',
        ].join(' ')}>
          Access Gate
        </p>
        <p className={[
          'text-sm font-semibold mt-0.5 transition-colors duration-500 leading-snug',
          engaged ? 'text-gray-200' : 'text-gray-600',
        ].join(' ')}>
          {chosen
            ? (choice === 'pay' ? 'Vault sealed · paid' : 'Vault sealed · waiting')
            : 'Choose how you enter'}
        </p>
        {!chosen && (
          <p className={[
            'text-[10px] mt-0.5 transition-colors duration-500',
            engaged ? 'text-gray-600' : 'text-gray-800',
          ].join(' ')}>
            {engaged ? 'On-chain · irreversible' : 'Complete steps 1–3 to unlock'}
          </p>
        )}
      </div>

      {/* ── Chosen: segmented hero clock ── */}
      {chosen ? (
        <div className="flex flex-col flex-1 bg-gray-950">

          {/* Choice reinforcement header */}
          <div className="px-4 pt-3 pb-3 border-b border-gray-800/60 space-y-2">

            {/* Tx status */}
            <div className="flex items-center gap-2">
              <span className={[
                'w-1.5 h-1.5 rounded-full shrink-0',
                executeStatus === 'loading' ? 'bg-purple-400 animate-pulse' :
                executeStatus === 'success' ? 'bg-emerald-400' :
                executeStatus === 'error'   ? 'bg-red-400' : 'bg-gray-600',
              ].join(' ')} />
              <span className="text-[10px] font-mono text-gray-500 tracking-widest uppercase">
                {executeStatus === 'loading' ? 'broadcasting…' :
                 executeStatus === 'success' ? 'confirmed on-chain' :
                 executeStatus === 'error'   ? 'tx failed' :
                 choice === 'pay' ? 'payment queued' : 'access queued'}
              </span>
            </div>

            {/* Choice badge + amount — always visible as a reminder */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={[
                'text-[9px] font-mono font-bold tracking-[0.25em] uppercase px-2.5 py-1 border rounded',
                choice === 'pay'
                  ? 'border-purple-700/60 text-purple-300 bg-purple-950/50'
                  : 'border-gray-700/60 text-gray-400 bg-gray-900/50',
              ].join(' ')}>
                {choice === 'pay' ? 'PAID ACCESS' : 'FREE ACCESS'}
              </span>

              {choice === 'pay' && (
                <span className="font-mono text-sm font-bold text-white tabular-nums tracking-tight">
                  {config.paymentAmount}
                </span>
              )}
            </div>
          </div>

          {choice === 'pay' ? (
            /* ── Paid: access granted — no clock ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8">
              <div className="text-center space-y-1">
                <p className="text-[8px] font-mono tracking-[0.5em] text-gray-600 uppercase">
                  Payment Confirmed
                </p>
                <p className="text-[9px] font-mono text-gray-700">instant · no wait required</p>
              </div>

              {/* Access granted display */}
              <div className="w-full flex flex-col items-center gap-3 border border-emerald-900/50 bg-emerald-950/20 rounded-xl py-8 px-4">
                <p className="text-[8px] font-mono tracking-[0.4em] text-emerald-700 uppercase">
                  Access Granted
                </p>
                <p className="font-mono text-5xl font-bold text-emerald-400 tracking-tight">
                  {config.paymentAmount.split(' ')[0]}
                </p>
                <p className="text-[9px] font-mono text-emerald-700 tracking-widest uppercase">
                  {config.paymentAmount.split(' ')[1]}
                </p>
              </div>

              <p className="text-[9px] font-mono text-gray-700 text-center">
                cooldown resets in {config.cooldownHours ?? 24}h
              </p>
            </div>
          ) : (
            /* ── Free: countdown clock ── */
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-8">
              <div className="text-center space-y-1">
                <p className="text-[8px] font-mono tracking-[0.5em] text-gray-600 uppercase">
                  On-Chain Cooldown
                </p>
                <p className="text-[9px] font-mono text-gray-700">free · enforced wait</p>
              </div>

              {/* Segmented display */}
              <div className="flex items-start gap-2">
                <ClockSegment value={hStr} label="HRS" active={clockActive} expired={expired} />

                <div className={[
                  'font-mono text-5xl font-bold leading-none pb-7 tabular-nums transition-all duration-100',
                  clockActive
                    ? (colonOn ? 'text-orange-400 opacity-100' : 'text-orange-400 opacity-20')
                    : expired ? 'text-emerald-400' : 'text-gray-700',
                ].join(' ')}>:</div>

                <ClockSegment value={mStr} label="MIN" active={clockActive} expired={expired} />

                <div className={[
                  'font-mono text-5xl font-bold leading-none pb-7 tabular-nums transition-all duration-100',
                  clockActive
                    ? (colonOn ? 'text-orange-400 opacity-100' : 'text-orange-400 opacity-20')
                    : expired ? 'text-emerald-400' : 'text-gray-700',
                ].join(' ')}>:</div>

                <ClockSegment value={sStr} label="SEC" active={clockActive} expired={expired} />
              </div>

              {statusData?.cooldownEnds && (
                <p className="text-[9px] font-mono text-gray-700 text-center">
                  unlocks {statusData.cooldownEnds.toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Split doors: stacked vertically in embedded column layout ── */
        <div className={[
          'flex flex-col flex-1 transition-opacity duration-500',
          engaged ? 'opacity-100' : 'opacity-25 pointer-events-none',
        ].join(' ')}>

          {/* ── PAY — premium top half ── */}
          <button
            onClick={() => onSelect('pay')}
            disabled={!canPay}
            className={[
              'group relative flex-1 flex flex-col justify-center px-4 py-6 gap-3',
              'transition-all duration-200 border-b border-gray-800',
              canPay ? 'cursor-pointer' : 'cursor-not-allowed',
            ].join(' ')}
          >
            {/* Ambient glow — always present when engaged, intensifies on hover */}
            <span className={[
              'pointer-events-none absolute inset-0 transition-opacity duration-300',
              'bg-[radial-gradient(ellipse_at_50%_100%,rgba(139,92,246,0.12),transparent_70%)]',
              canPay ? 'opacity-100 group-hover:opacity-0' : 'opacity-0',
            ].join(' ')} />
            <span className={[
              'pointer-events-none absolute inset-0 transition-opacity duration-300',
              'bg-[radial-gradient(ellipse_at_50%_100%,rgba(139,92,246,0.28),transparent_60%)]',
              canPay ? 'opacity-0 group-hover:opacity-100' : 'opacity-0',
            ].join(' ')} />

            {/* Label */}
            <p className={[
              'text-[9px] font-mono tracking-[0.3em] uppercase transition-colors duration-200',
              canPay ? 'text-purple-500 group-hover:text-purple-300' : 'text-gray-700',
            ].join(' ')}>
              Instant Access
            </p>

            {/* Hero amount */}
            <p className={[
              'font-mono font-bold tabular-nums leading-none tracking-tight transition-all duration-200',
              canPay
                ? 'text-3xl text-white group-hover:text-purple-100 group-hover:scale-[1.02] origin-left'
                : 'text-2xl text-gray-600',
            ].join(' ')}>
              {config.paymentAmount}
            </p>

            {/* Sub-copy */}
            <p className={[
              'text-[10px] transition-colors duration-200',
              canPay ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-700',
            ].join(' ')}>
              {!engaged
                ? 'awaiting wallet'
                : canPay
                  ? 'Skip the wait · enter now'
                  : `need ${config.paymentAmount} · have ${statusData?.xprBalance?.amount ?? '0.0000'} XPR`}
            </p>

            {/* CTA */}
            <span className={[
              'self-start text-[10px] font-mono font-bold tracking-widest uppercase px-3 py-1 border transition-all duration-200',
              canPay
                ? 'border-purple-600 text-purple-400 group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600'
                : 'border-gray-800 text-gray-700',
            ].join(' ')}>
              {canPay ? 'PAY NOW ›' : 'LOCKED'}
            </span>
          </button>

          {/* ── FREE — cold bottom half ── */}
          <button
            onClick={() => onSelect('free')}
            disabled={!canFree}
            className={[
              'group relative flex-1 flex flex-col justify-center px-4 py-5 gap-2',
              'transition-all duration-200',
              canFree ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-not-allowed',
            ].join(' ')}
          >
            {/* Label */}
            <p className={[
              'text-[9px] font-mono tracking-[0.3em] uppercase transition-colors duration-200',
              canFree ? 'text-gray-500 group-hover:text-gray-400' : 'text-gray-700',
            ].join(' ')}>
              {canFree ? 'Free Access' : 'Return Later'}
            </p>

            {/* Clock — always the focal point of the free side */}
            <p className={[
              'font-mono font-bold tabular-nums leading-none tracking-tight transition-colors duration-500',
              clockActive                ? 'text-2xl text-amber-500/80' :
              engaged && !clockActive   ? 'text-2xl text-emerald-500'  :
                                          'text-2xl text-gray-700',
            ].join(' ')}>
              {timeStr}
            </p>

            {/* Sub-copy */}
            <p className={[
              'text-[10px] transition-colors duration-200',
              canFree ? 'text-gray-600' : 'text-gray-700',
            ].join(' ')}>
              {!engaged
                ? 'awaiting wallet'
                : clockActive
                  ? 'on-chain cooldown · not yet'
                  : 'cooldown expired'}
            </p>

            {/* CTA */}
            <span className={[
              'self-start text-[10px] font-mono font-bold tracking-widest uppercase px-3 py-1 border transition-all duration-200',
              canFree
                ? 'border-gray-700 text-gray-500 group-hover:border-gray-500 group-hover:text-gray-300'
                : 'border-gray-800 text-gray-700',
            ].join(' ')}>
              {canFree ? 'ENTER FREE ›' : 'NOT READY'}
            </span>
          </button>
        </div>
      )}

      {/* Bottom accent */}
      <div className={[
        'h-px transition-opacity duration-500',
        engaged ? 'opacity-100' : 'opacity-10',
        'bg-gradient-to-r from-purple-700 via-violet-500 to-gray-800',
      ].join(' ')} />
    </div>
  )
}
