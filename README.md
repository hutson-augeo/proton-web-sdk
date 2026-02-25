# Proton Web SDK

## Overview

**XPR Network** is a consumer-grade public blockchain built for fast identity-verified P2P payments. **Proton Web SDK** connects web applications to XPR Network wallets — handling authentication, session management, transaction signing, and on-chain data queries through a single unified interface.

This monorepo ships the core SDK alongside a suite of companion packages, including `@proton/respawn` — a drop-in access-gate that enforces on-chain cooldowns and drives users toward premium paid access through time-pressure UX.

---

## The Problem: Gatekeeping Access by Time or Token

Most digital products face the same monetization paradox. A hard paywall turns users away before they understand the value. A free tier with no friction creates no urgency, no conversion, and no revenue. The middle ground — freemium with a meaningful cost — has historically required server-side enforcement, trust in a central authority, and constant abuse monitoring.

**Time-gated, token-backed access solves this at the protocol level.**

The premise is simple: every user gets one free entry per window. Once used, the blockchain records it. The next entry requires either waiting for the window to expire or paying to skip the wait. There is no backend to game, no admin panel to bypass, no "contact support" loophole. The contract is the gatekeeper.

This model works because it applies cost at the exact moment a user has demonstrated intent. They are already inside the experience, they already want the next step — and now they face a real decision with real consequences. That is when conversion happens.

---

## The Psychology: FOMO, Friction, and the Value of a Clock

Time scarcity is one of the oldest and most effective forces in human decision-making. We are wired to weigh losses more heavily than equivalent gains — a phenomenon behavioral economists call **loss aversion**. A countdown clock makes loss visceral. It is not an abstract "you'll have to wait." It is `23:41:07` draining in front of you, second by second, right now.

### Why the clock converts

A dollar amount in isolation is easy to dismiss. "1 XPR" means nothing without context. But `23:41:07` next to `1.0000 XPR` reframes the question entirely. You are no longer deciding whether a thing is worth a dollar. You are deciding whether the next 23 hours of your time are worth a dollar. For most people, in most contexts, they are not.

The paid option does not need to be cheap — it needs to feel cheap relative to the cost of waiting. The clock does that work automatically, and it gets more effective the longer the user stays on the page.

### The design principles at work

**Irreversibility creates commitment.** Once a choice is recorded on-chain, it cannot be undone. This is not a bug — it is what makes the decision feel real. Soft, reversible choices produce soft engagement. Hard, on-chain choices produce users who are invested.

**Friction is a filter, not a failure.** Users who bounce at the gate were not going to convert anyway. Users who stay and face the clock are already high-intent. The gate does not reduce your audience — it reveals it.

**The free path must feel costly.** If waiting is painless, paying is irrational. The clock must be prominent, persistent, and impossible to ignore. It should feel like watching something drain. Orange for urgency. Segmented digits. Blinking colons. The design should make a person feel the time, not just read it.

**Paying should feel like relief.** The paid confirmation is intentionally calm — emerald green, "Access Granted", clean. The contrast with the ticking clock is the product. The user should feel like they made a good decision the moment they pay, not anxiety about what they spent.

### The on-chain advantage

Server-side cooldowns can be reset, circumvented, or simply forgotten when the database is migrated. On-chain cooldowns are permanent, public, and enforced by the same consensus mechanism that secures the entire network. Users cannot lie to the contract, and the contract cannot lie to the user. This transparency is itself a trust signal — and trust reduces the psychological cost of paying.

---

## UI: The Token Journey

The React demo (`examples/react`) walks through the full experience as a live, step-by-step flow.

### Default layout — idle, no wallet connected

The Transfer tray sits collapsed on the left. The 5-step journey occupies the center. The Vault Gate is always visible on the right — dormant and dimmed until steps 1–3 complete.

![Token Journey — idle](docs/screenshots/01-idle.png)

### Transfer tray open

The tray slides out from the left edge without displacing the journey or vault. Transfer and access management live side by side.

![Transfer tray open](docs/screenshots/02-transfer-tray.png)

### Vault Gate — pre-journey close-up

Both doors are present from the first render, muted and locked. The structure primes the user for the decision before they reach it. `1.0000 XPR` is visible immediately — the cost of instant access is never hidden.

![Vault Gate — idle close-up](docs/screenshots/05-vault-gate-column.png)

### Post-selection — paid path

The gate confirms the payment. Clean, immediate, final. No clock. The expanded panel communicates that the wait has been bought out entirely — emerald green, "Access Granted", the amount echoed back as confirmation.

> Capture after completing the journey with a funded wallet and selecting PAY NOW.

### Post-selection — free path

The gate confirms free access and immediately starts the new cooldown clock. 24 hours, in orange, ticking. Segmented digits. Blinking colons. The unlock timestamp anchors the cost of waiting to a real calendar moment.

> Capture after completing the journey and selecting the free path.

### The persistent cooldown strip

A slim dark bar anchored to the top reflects the user's on-chain status at all times — pulsing orange with a live `HH:MM:SS` countdown when locked, switching to emerald when the window expires. Always rendered at fixed height so the layout never shifts.

> Visible in all screenshots above — top bar, dark background, Login button top-right.

---

## Packages

| Package | Description |
|---|---|
| [`@proton/web-sdk`](packages/proton-web-sdk) | Core SDK — wallet connection, session restore, transaction signing |
| [`@proton/link`](packages/proton-link) | Low-level link protocol and session management |
| [`@proton/browser-transport`](packages/proton-browser-transport) | Browser modal UI for wallet selection and signing requests |
| [`@proton/respawn`](packages/proton-respawn) | On-chain access gate with cooldown enforcement and pay-or-wait flow |

---

## @proton/respawn — API

```typescript
import { checkRespawnStatus, recordFreeAccess, payForAccess } from '@proton/respawn'

const config = {
  accessContract:  'myapp.access',   // contract that tracks last-access timestamps
  accessTable:     'accounts',
  accessAction:    'setaccess',
  paymentContract: 'myapp.pay',
  paymentAction:   'unlock',
  paymentAmount:   '1.0000 XPR',     // cost to skip the cooldown
  cooldownHours:   24,               // lockout window in hours
}

// Check current status for the connected wallet
const status = await checkRespawnStatus(session, config)
// status.canRespawnFree  — true if cooldown has expired
// status.timeRemainingMs — milliseconds until free access is available
// status.hasEnoughXpr    — true if balance >= paymentAmount
// status.xprBalance      — current XPR balance
// status.cooldownEnds    — Date when free access returns

// Record a free entry
await recordFreeAccess(session, config)

// Pay to skip the cooldown
await payForAccess(session, config)
```

### Expected on-chain table shape

```
table:  'accounts' (or configured name)
scope:  <contract account>
fields: { account: name, last_access: uint32 }   // unix seconds
```

---

## Quick Start

```bash
# 1. Use the correct Node version
nvm use

# 2. Enable pnpm
corepack enable

# 3. Install all workspace dependencies
pnpm install

# 4. Build all packages
pnpm run build

# 5. Run the React demo
cd examples/react && pnpm dev
```

Open **http://localhost:5173**. Set `DEMO_MODE = true` in [TokenJourney.tsx](examples/react/src/components/TokenJourney.tsx) to run the full journey without deployed contracts.

---

## Core SDK Usage

### Connect a wallet

```typescript
import ProtonWebSDK from '@proton/web-sdk'

const { link, session } = await ProtonWebSDK({
  linkOptions: {
    endpoints: ['https://proton.eosusa.io'],
    restoreSession: false,
  },
  transportOptions: { requestAccount: 'myapp' },
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

## Monorepo Structure

```
proton-web-sdk/
├── packages/
│   ├── proton-web-sdk/           # Core SDK (npm: @proton/web-sdk)
│   ├── proton-link/              # Link protocol
│   ├── proton-browser-transport/ # Browser modal UI
│   └── proton-respawn/           # Access gate + cooldown enforcement
└── examples/
    ├── react/                    # Full Token Journey demo
    ├── svelte/
    ├── vue/
    ├── angular/
    └── vanilla-html/
```

---

## Development

```bash
pnpm install
pnpm run build
pnpm run publish-packages
```

Node v18.19.1 is recommended. Use `nvm use` in the root (`.nvmrc` is set).

---

## Links

- [XPR Network](https://xprnetwork.org)
- [Block Explorer](https://protonscan.io)
- [Issues](https://github.com/XPRNetwork/proton-web-sdk/issues)
