import {mount, unmount} from 'svelte'
import type {LinkSession} from '@proton/link'
import type {RespawnConfig, RespawnResult, RespawnStatus} from './types'
import {checkRespawnStatus, recordFreeAccess, payForAccess} from './respawn'
import RespawnModal from './ui/RespawnModal.svelte'

/**
 * Mount and show the respawn modal, then execute the chosen on-chain action.
 *
 * Returns a RespawnResult once the user completes (or dismisses) the flow.
 * If the user closes the modal without choosing, the promise rejects with 'cancelled'.
 *
 * @param session - Active LinkSession from @proton/link
 * @param config  - RespawnConfig describing the on-chain contracts/actions
 * @param status  - Optional pre-fetched RespawnStatus. Fetched automatically if omitted.
 */
export async function showRespawnModal(
  session: LinkSession,
  config: RespawnConfig,
  status?: RespawnStatus
): Promise<RespawnResult> {
  const resolvedStatus = status ?? (await checkRespawnStatus(session, config))

  return new Promise((resolve, reject) => {
    let holder: HTMLElement | undefined
    let widget: ReturnType<typeof mount> | undefined

    const cleanup = () => {
      if (widget) {
        unmount(widget)
        widget = undefined
      }
      if (holder) {
        holder.remove()
        holder = undefined
      }
    }

    const onClose = () => {
      cleanup()
      reject(new Error('cancelled'))
    }

    const onChoose = async (option: 'wait' | 'pay') => {
      cleanup()
      try {
        if (option === 'pay') {
          const transactResult = await payForAccess(session, config)
          resolve({option, success: true, transactResult})
        } else {
          // 'wait' path: only execute the free-access record action if cooldown has expired
          if (resolvedStatus.canRespawnFree) {
            await recordFreeAccess(session, config)
          }
          resolve({option, success: true})
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        resolve({option, success: false, error: message})
      }
    }

    holder = document.createElement('div')
    document.body.appendChild(holder)

    widget = mount(RespawnModal, {
      target: holder,
      props: {
        show: true,
        status: resolvedStatus,
        paymentAmount: config.paymentAmount,
        onChoose,
        onClose,
      },
    })
  })
}
