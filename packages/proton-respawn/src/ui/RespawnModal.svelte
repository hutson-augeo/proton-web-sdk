<script lang="ts">
  import type {RespawnStatus, RespawnOption} from '../types'
  import {formatTimeRemaining} from '../respawn'

  let {
    show = false,
    status,
    paymentAmount = '1.0000 XPR',
    onChoose,
    onClose,
  }: {
    show?: boolean
    status: RespawnStatus
    paymentAmount?: string
    onChoose: (option: RespawnOption) => void
    onClose: () => void
  } = $props()

  let countdown = $state(status.timeRemainingMs ? formatTimeRemaining(status.timeRemainingMs) : '')
  let timer: ReturnType<typeof setInterval> | undefined

  $effect(() => {
    if (show && !status.canRespawnFree && status.cooldownEnds) {
      const end = status.cooldownEnds.getTime()
      const tick = () => {
        const remaining = end - Date.now()
        countdown = remaining > 0 ? formatTimeRemaining(remaining) : '00:00:00'
        if (remaining <= 0 && timer) {
          clearInterval(timer)
          timer = undefined
        }
      }
      tick()
      timer = setInterval(tick, 1000)
      return () => {
        if (timer) clearInterval(timer)
      }
    }
  })

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      e.stopPropagation()
      onClose()
    }
  }

  const choosePay = () => onChoose('pay')
  const chooseWait = () => onChoose('wait')
</script>

<div
  role="presentation"
  class="pr-respawn"
  class:is-active={show}
  onclick={handleBackdropClick}
>
  <div class="pr-respawn-inner">
    <div class="pr-respawn-nav">
      <span class="pr-respawn-header">Respawn Access</span>
      <div class="pr-respawn-close" role="button" tabindex="0" onclick={onClose}></div>
    </div>

    <div class="pr-respawn-body">
      <p class="pr-respawn-subtitle">
        {#if status.canRespawnFree}
          You have free access available. Continue to record your session on-chain.
        {:else}
          Your free respawn cooldown is active. Wait for it to expire or pay to access now.
        {/if}
      </p>

      {#if !status.canRespawnFree && countdown}
        <div class="pr-respawn-countdown">{countdown}</div>
        <p class="pr-respawn-countdown-label">until free access</p>
      {/if}

      <div class="pr-respawn-balance">
        <span class="pr-respawn-balance-label">XPR Balance</span>
        <span class="pr-respawn-balance-value">
          {status.xprBalance ? `${status.xprBalance.amount} XPR` : '0.0000 XPR'}
        </span>
      </div>

      <hr class="pr-respawn-divider" />

      <div class="pr-respawn-options">
        <button
          class="pr-respawn-btn pr-respawn-btn--pay"
          onclick={choosePay}
          disabled={!status.hasEnoughXpr}
          title={!status.hasEnoughXpr ? 'Insufficient XPR balance' : ''}
        >
          <span class="pr-respawn-btn-title">Pay {paymentAmount}</span>
          <span class="pr-respawn-btn-sub">Instant access</span>
        </button>

        <button
          class="pr-respawn-btn pr-respawn-btn--wait"
          onclick={chooseWait}
        >
          <span class="pr-respawn-btn-title">
            {status.canRespawnFree ? 'Free Access' : 'Wait'}
          </span>
          <span class="pr-respawn-btn-sub">
            {status.canRespawnFree ? 'Record access on-chain' : countdown + ' remaining'}
          </span>
        </button>
      </div>
    </div>
  </div>
</div>

<style lang="scss" global>
  .pr-respawn {
    font-family: 'Circular Std Book', -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI',
      Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    background: rgba(0, 0, 0, 0.65);
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;

    * {
      box-sizing: border-box;
    }

    &.is-active {
      display: flex;
    }

    &-inner {
      background: #752eeb;
      color: #fff;
      margin: 20px;
      position: relative;
      border-radius: 20px;
      box-shadow: 0 4px 100px rgba(0, 0, 0, 0.5);
      width: 360px;
    }

    &-nav {
      height: 55px;
      display: flex;
      position: relative;
      border-radius: 20px 20px 0 0;
      justify-content: center;
      align-items: center;
      padding: 0 16px;
      background-color: rgba(0, 0, 0, 0.2);
    }

    &-header {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: 0.2px;
    }

    &-close {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      width: 24px;
      height: 24px;
      cursor: pointer;
      opacity: 0.7;

      &::before,
      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        width: 100%;
        height: 2px;
        background: #fff;
        border-radius: 1px;
      }

      &::before {
        transform: rotate(45deg);
      }
      &::after {
        transform: rotate(-45deg);
      }

      &:hover {
        opacity: 1;
      }
    }

    &-body {
      padding: 24px 32px 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    &-subtitle {
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
      opacity: 0.85;
      margin: 0 0 20px;
    }

    &-countdown {
      font-size: 40px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      letter-spacing: 2px;
      background: rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 16px 24px;
      margin-bottom: 8px;
    }

    &-countdown-label {
      font-size: 12px;
      opacity: 0.7;
      margin: 0 0 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    &-balance {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      background: rgba(0, 0, 0, 0.15);
      border-radius: 10px;
      padding: 10px 16px;
      margin-bottom: 4px;
    }

    &-balance-label {
      font-size: 13px;
      opacity: 0.75;
    }

    &-balance-value {
      font-size: 14px;
      font-weight: 600;
    }

    &-divider {
      width: 100%;
      border: none;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
      margin: 20px 0 16px;
    }

    &-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    &-btn {
      width: 100%;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 14px 20px;
      transition: opacity 0.15s ease, transform 0.1s ease;
      gap: 4px;

      &:active {
        transform: scale(0.98);
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }

      &-title {
        font-size: 15px;
        font-weight: 700;
      }

      &-sub {
        font-size: 12px;
        opacity: 0.8;
      }

      &--pay {
        background: #fff;
        color: #752eeb;

        &:not(:disabled):hover {
          opacity: 0.92;
        }
      }

      &--wait {
        background: rgba(255, 255, 255, 0.15);
        color: #fff;

        &:hover {
          background: rgba(255, 255, 255, 0.22);
        }
      }
    }
  }
</style>
