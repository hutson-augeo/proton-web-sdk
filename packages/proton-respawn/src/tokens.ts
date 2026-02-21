import type {LinkSession} from '@proton/link'
import type {TokenBalance} from './types'

/**
 * Fetch all token balances held by the connected account from the given token contract.
 *
 * Uses the standard `eosio.token` accounts table shape:
 *   { balance: "5.2300 XPR" }
 *
 * @param session  - Active LinkSession from @proton/link
 * @param tokenContract - Token contract to query. Defaults to 'eosio.token'
 */
export async function getWalletTokens(
  session: LinkSession,
  tokenContract = 'eosio.token'
): Promise<TokenBalance[]> {
  const actor = session.auth.actor.toString()

  let rows: Array<{balance: string}> = []
  try {
    const result = await session.client.get_table_rows({
      code: tokenContract,
      scope: actor,
      table: 'accounts',
      limit: 100,
    })
    rows = result.rows as Array<{balance: string}>
  } catch {
    // Network error or contract unavailable — return empty list
    return []
  }

  return rows.map((row) => {
    const [amount, symbol] = row.balance.split(' ')
    const decimalPart = amount.split('.')[1] ?? ''
    return {
      contract: tokenContract,
      symbol,
      precision: decimalPart.length,
      amount,
      value: parseFloat(amount),
    }
  })
}
