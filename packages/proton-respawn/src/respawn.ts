import type {LinkSession} from '@proton/link'
import type {RespawnConfig, RespawnStatus} from './types'
import {getWalletTokens} from './tokens'

/**
 * Query the on-chain access table to determine respawn eligibility.
 *
 * The access-tracking contract is expected to have a table with this row shape:
 *   { account: name, last_access: uint32 }   (last_access is unix seconds)
 *
 * Scoped to the contract account itself (scope === accessContract).
 *
 * @param session - Active LinkSession
 * @param config  - RespawnConfig with contract/table details
 */
export async function checkRespawnStatus(
  session: LinkSession,
  config: RespawnConfig
): Promise<RespawnStatus> {
  const actor = session.auth.actor.toString()
  const cooldownMs = (config.cooldownHours ?? 24) * 60 * 60 * 1000
  const payAmount = parseFloat(config.paymentAmount)

  // Fetch token balances — if the token contract is also not deployed yet, default to empty
  const tokens = await getWalletTokens(session, config.tokenContract).catch(() => [])
  const xprBalance = tokens.find((t) => t.symbol === 'XPR')
  const hasEnoughXpr = (xprBalance?.value ?? 0) >= payAmount

  let rows: Array<{account: string; last_access: number}> = []
  try {
    const result = await session.client.get_table_rows({
      code: config.accessContract,
      scope: config.accessContract,
      table: config.accessTable,
      lower_bound: actor,
      upper_bound: actor,
      limit: 1,
    })
    rows = result.rows
  } catch {
    // Contract not deployed yet or network error — treat as no record (free access)
    rows = []
  }

  // No on-chain record → user may access freely
  if (rows.length === 0 || rows[0].account !== actor) {
    return {canRespawnFree: true, tokens, xprBalance, hasEnoughXpr}
  }

  const lastAccessSec: number = rows[0].last_access
  const lastAccessTime = new Date(lastAccessSec * 1000)
  const cooldownEnds = new Date(lastAccessTime.getTime() + cooldownMs)
  const now = Date.now()
  const canRespawnFree = now >= cooldownEnds.getTime()
  const timeRemainingMs = canRespawnFree ? 0 : cooldownEnds.getTime() - now

  return {
    canRespawnFree,
    lastAccessTime,
    cooldownEnds,
    timeRemainingMs,
    tokens,
    xprBalance,
    hasEnoughXpr,
  }
}

/**
 * Record a free access on-chain by calling the configured accessAction.
 *
 * Call this after confirming canRespawnFree === true (cooldown expired or no record).
 * Action data sent: { account: name }
 *
 * @param session - Active LinkSession
 * @param config  - RespawnConfig
 */
export async function recordFreeAccess(session: LinkSession, config: RespawnConfig) {
  return session.transact(
    {
      actions: [
        {
          account: config.accessContract,
          name: config.accessAction,
          data: {account: session.auth.actor.toString()},
          authorization: [session.auth],
        },
      ],
    },
    {broadcast: true}
  )
}

/**
 * Pay the configured XPR amount to the payment contract to bypass the cooldown.
 *
 * Action data sent: { account: name, quantity: asset, memo: string }
 *
 * @param session - Active LinkSession
 * @param config  - RespawnConfig
 */
export async function payForAccess(session: LinkSession, config: RespawnConfig) {
  return session.transact(
    {
      actions: [
        {
          account: config.paymentContract,
          name: config.paymentAction,
          data: {
            account: session.auth.actor.toString(),
            quantity: config.paymentAmount,
            memo: config.paymentMemo ?? 'respawn',
          },
          authorization: [session.auth],
        },
      ],
    },
    {broadcast: true}
  )
}

/**
 * Format milliseconds into HH:MM:SS display string.
 */
export function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
}
