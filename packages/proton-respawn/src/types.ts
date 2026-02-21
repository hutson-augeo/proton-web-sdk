export interface RespawnConfig {
  /**
   * Account name of the smart contract that tracks per-user last-access timestamps.
   * The contract must expose a table with rows: { account: name, last_access: uint32 }
   * and an action that accepts { account: name } to record a new access.
   *
   * Example: 'myapp.access'
   */
  accessContract: string

  /**
   * Table name inside accessContract that holds access records.
   * Expected row shape: { account: string, last_access: number } (unix seconds)
   *
   * Example: 'accounts'
   */
  accessTable: string

  /**
   * Action name on accessContract called to record a new (free) access.
   * Action data: { account: name }
   *
   * Example: 'setaccess'
   */
  accessAction: string

  /**
   * Account name of the contract that handles the XPR payment unlock.
   *
   * Example: 'myapp.pay'
   */
  paymentContract: string

  /**
   * Action name on paymentContract called when the user pays to bypass the cooldown.
   * Action data: { account: name, quantity: asset, memo: string }
   *
   * Example: 'unlock'
   */
  paymentAction: string

  /**
   * Asset string for the payment amount.
   *
   * Example: '1.0000 XPR'
   */
  paymentAmount: string

  /**
   * Optional memo attached to the payment action.
   * Defaults to 'respawn'.
   */
  paymentMemo?: string

  /**
   * Token contract used for balance lookups.
   * Defaults to 'eosio.token'.
   */
  tokenContract?: string

  /**
   * Number of hours the on-chain cooldown lasts.
   * Defaults to 24.
   */
  cooldownHours?: number
}

export interface TokenBalance {
  /** Contract account that issued this token */
  contract: string
  /** Token symbol, e.g. 'XPR' */
  symbol: string
  /** Number of decimal places */
  precision: number
  /** Amount string without symbol, e.g. '5.2300' */
  amount: string
  /** Parsed float value */
  value: number
}

export interface RespawnStatus {
  /** True when no on-chain cooldown record exists, or cooldown has already expired */
  canRespawnFree: boolean
  /** When the user last accessed (undefined if no on-chain record) */
  lastAccessTime?: Date
  /** When the free cooldown ends (undefined if no active cooldown) */
  cooldownEnds?: Date
  /** Milliseconds remaining until free access (0 or undefined when canRespawnFree is true) */
  timeRemainingMs?: number
  /** All token balances from the connected wallet */
  tokens: TokenBalance[]
  /** The user's XPR balance (undefined if they hold no XPR) */
  xprBalance?: TokenBalance
  /** True when the user holds enough XPR to cover the configured paymentAmount */
  hasEnoughXpr: boolean
}

/** Which respawn path the user chose */
export type RespawnOption = 'wait' | 'pay'

export interface RespawnResult {
  /** Which option the user selected */
  option: RespawnOption
  /** Whether the on-chain action completed successfully */
  success: boolean
  /** The raw TransactResult from @proton/link (only present for 'pay' path) */
  transactResult?: unknown
  /** Error message if success is false */
  error?: string
}
