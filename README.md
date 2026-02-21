# Proton Web SDK

## Overview

**XPR Network** is a consumer-grade public blockchain built for fast identity-verified P2P payments. **Proton Web SDK** connects web applications to XPR Network wallets — handling authentication, session management, transaction signing, and on-chain data queries through a single unified interface.

This monorepo ships the core SDK alongside a suite of companion packages, including `@proton/respawn` — a drop-in access-gate that enforces on-chain cooldowns and drives users toward premium paid access through time-pressure UX.

---

## Packages

| Package | Description |
|---|---|
| [`@proton/web-sdk`](packages/proton-web-sdk) | Core SDK — wallet connection, session restore, transaction signing |
| [`@proton/link`](packages/proton-link) | Low-level link protocol and session management |
| [`@proton/browser-transport`](packages/proton-browser-transport) | Browser modal UI for wallet selection and signing requests |
| [`@proton/respawn`](packages/proton-respawn) | On-chain access gate with cooldown enforcement and pay-or-wait flow |

---

## @proton/respawn — Gated Access with Time-Pressure

The respawn package implements a two-path entry model built for apps that want to monetize access without hard paywalls.

### The mechanic

Every user gets one free entry per cooldown window (default 24 hours). Once used, the on-chain access table records their last entry timestamp and the clock starts. Until that window expires, they face a choice:

**Pay to enter now** — skip the wait entirely by sending XPR to your payment contract. Immediate access, no countdown.

**Wait it out** — a live segmented clock (`HH : MM : SS`) counts down the remaining lockout in real time. Every second the clock ticks is a second of friction designed to make the paid option feel cheap by comparison.

The tension is intentional. Watching `23:41:07` count down is designed to create urgency. The paid door glows.

### Configuration

```typescript
import { checkRespawnStatus, recordFreeAccess, payForAccess } from '@proton/respawn'

const config = {
  accessContract:  'myapp.access',   // contract that tracks last-access timestamps
  accessTable:     'accounts',       // table name
  accessAction:    'setaccess',      // action to record free access
  paymentContract: 'myapp.pay',      // contract that processes XPR payment
  paymentAction:   'unlock',         // payment action name
  paymentAmount:   '1.0000 XPR',     // cost to skip the cooldown
  cooldownHours:   24,               // lockout window in hours
}

// Check if the user can enter for free
const status = await checkRespawnStatus(session, config)
// status.canRespawnFree  — true if cooldown has expired
// status.timeRemainingMs — milliseconds until free access is available
// status.hasEnoughXpr    — true if user balance >= paymentAmount

// Record a free entry (after cooldown expires)
await recordFreeAccess(session, config)

// Pay to bypass the cooldown immediately
await payForAccess(session, config)
```

### Expected on-chain table shape

```
table:  'accounts' (or configured name)
scope:  <contract account>
fields: { account: name, last_access: uint32 }  // last_access in unix seconds
```

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run the React demo
cd examples/react && pnpm dev
```

### Install core SDK

```bash
npm install @proton/web-sdk
# or
yarn add @proton/web-sdk
```

### Connect a wallet

```typescript
import ProtonWebSDK from '@proton/web-sdk'

const { link, session } = await ProtonWebSDK({
  linkOptions: {
    endpoints: ['https://proton.eosusa.io'],
    restoreSession: false,
  },
  transportOptions: {
    requestAccount: 'myapp'
  },
  selectorOptions: {
    appName: 'My App',
    appLogo: 'https://myapp.com/logo.png',
  }
})
```

### Sign a transaction

```typescript
await session.transact({
  actions: [{
    account: 'eosio.token',
    name: 'transfer',
    data: {
      from: session.auth.actor,
      to: 'recipient',
      quantity: '1.0000 XPR',
      memo: ''
    },
    authorization: [session.auth]
  }]
}, { broadcast: true })
```

---

## React Demo — Token Journey

The React example (`examples/react`) demonstrates the full respawn access flow as a live 5-step gated experience:

1. **Connect Wallet** — authenticate via XPR Network wallet
2. **Fetch Token Balances** — query on-chain `eosio.token` account balances
3. **Check Respawn Status** — read the on-chain access table for cooldown state
4. **Vault Gate** — choose your entry path (pay instantly or wait out the clock)
5. **Execute** — broadcast the chosen transaction on-chain

The Vault Gate is always visible to the right of the journey steps. Before step 3 completes it sits dormant. The moment status resolves, the two doors activate: one lit in purple for instant paid entry, one showing the amber countdown for the free path.

After selection, the right panel expands to a full hero clock display. Paid users see an emerald "Access Granted" confirmation. Free users watch the segmented orange countdown (`HH : MM : SS`) tick down the full 24-hour lockout — a persistent reminder that they could have paid to skip it.

```bash
cd examples/react
pnpm install
pnpm dev
```

Set `DEMO_MODE = true` in [TokenJourney.tsx](examples/react/src/components/TokenJourney.tsx) to simulate the full flow without deployed contracts.

---

## Monorepo Structure

```
proton-web-sdk/
├── packages/
│   ├── proton-web-sdk/          # Core SDK (npm: @proton/web-sdk)
│   ├── proton-link/             # Link protocol
│   ├── proton-browser-transport/# Browser modal UI
│   └── proton-respawn/          # Access gate + cooldown enforcement
└── examples/
    ├── react/                   # Full Token Journey demo
    ├── svelte/
    ├── vue/
    ├── angular/
    └── vanilla-html/
```

---

## Development

```bash
# Install
pnpm install

# Build all packages
pnpm run build

# Publish packages
pnpm run publish-packages
```

Node v18.19.1 is recommended. Use `nvm use` in the root to activate it (`.nvmrc` is set).

---

## Links

- [XPR Network](https://xprnetwork.org)
- [Block Explorer](https://protonscan.io)
- [Issues](https://github.com/XPRNetwork/proton-web-sdk/issues)
