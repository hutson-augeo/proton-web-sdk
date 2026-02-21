# Token Journey — React Demo

A live demonstration of gated XPR Network access using `@proton/respawn`. The experience guides users through wallet connection, token balance inspection, and a two-path access gate enforced by an on-chain 24-hour cooldown.

---

## The experience

Once a wallet is connected, the app checks the on-chain access table for the user's last entry timestamp. From that point, two doors open:

**Pay now** — send `1.0000 XPR` to the payment contract and enter immediately. No wait. The panel shows an emerald confirmation and clears.

**Wait it out** — if the cooldown window has already expired, free access is available. If not, a live segmented clock (`HH : MM : SS`) counts down every second of the remaining lockout. Each tick is a reminder that the paid option exists.

The clock is the mechanic. Seeing `23:41:07` draining in real time creates a decision: spend a fraction of XPR to enter now, or sit on the other side of a 24-hour gate. The paid door is lit. The free door shows the time you owe.

After a choice is made, the right panel expands to a full-width hero display. Paid users see access confirmed in green. Free users keep watching the clock.

---

## Architecture

```
src/
├── components/
│   ├── TokenJourney.tsx    # 5-step gated flow + VaultGate state machine
│   ├── CooldownStrip.tsx   # Persistent top bar — live countdown when locked
│   ├── Avatar.tsx          # Wallet connect / disconnect
│   └── Transfer.tsx        # XPR transfer form (collapsible left tray)
├── store/
│   └── slices/user.slice.ts  # Actor, avatar, cooldownRefreshAt
├── webSdk.ts               # SDK session, login, reconnect, transfer
└── utils/log.ts            # Dual logger — browser console + Vite terminal
```

### State machine (TokenJourney)

The journey runs as a `useReducer` state machine with 5 steps:

| Step | Description | Gate |
|------|-------------|------|
| 1 | Connect Wallet | Always available |
| 2 | Fetch Token Balances | Requires step 1 |
| 3 | Check Respawn Status | Requires step 2 |
| 4 | Vault Gate — path selection | Requires step 3 |
| 5 | Execute Transaction | Triggered by path selection |

Each step has `idle → loading → success / error` states. Errors are classified by type (`WALLET_REJECTED`, `HTTP_400`, `INSUFFICIENT_BALANCE`, etc.) with inline retry buttons.

### VaultGate

The Vault Gate is always rendered to the right of the journey steps, regardless of progress. Before step 3 completes it is dimmed and non-interactive. After status resolves:

- **Pay door** — purple ambient glow, hero payment amount, `PAY NOW ›` CTA. Active only if XPR balance ≥ payment amount.
- **Free door** — amber countdown clock as deterrent. Active only if the on-chain cooldown has expired.

After selection the panel expands to fill the remaining width. Paid path shows emerald "Access Granted". Free path shows the full segmented cooldown clock in orange that counts down live from the configured cooldown hours.

### CooldownStrip

A persistent dark bar at the top of the page that:
- Shows a pulsing orange dot + live `HH:MM:SS` countdown when the user is locked
- Switches to emerald "Access Available" when the cooldown expires
- Always renders at fixed height — no layout shifts during wallet reconnect or state transitions

---

## Demo mode

Set `DEMO_MODE = true` (default) in [TokenJourney.tsx](src/components/TokenJourney.tsx) to run the full journey without deployed contracts. Step 5 simulates an 800ms broadcast delay and generates a fake transaction ID. All other steps hit the real chain.

Set to `false` once your contracts are deployed.

---

## Running locally

```bash
pnpm install
pnpm dev
```

The Vite dev server starts on `http://localhost:5173`. Terminal output is color-coded by step via a custom logger plugin (`vite.config.ts`).

---

## Configuration

Edit the `RESPAWN_CONFIG` constant at the top of [TokenJourney.tsx](src/components/TokenJourney.tsx) and [CooldownStrip.tsx](src/components/CooldownStrip.tsx):

```typescript
const RESPAWN_CONFIG = {
  accessContract:  'myapp.access',   // your deployed access-tracking contract
  accessTable:     'accounts',
  accessAction:    'setaccess',
  paymentContract: 'myapp.pay',      // your payment contract
  paymentAction:   'unlock',
  paymentAmount:   '1.0000 XPR',     // cost to skip the cooldown
  cooldownHours:   24,               // lockout window
}
```

---

## Building for production

```bash
pnpm build
```
