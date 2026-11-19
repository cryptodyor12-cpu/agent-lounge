# Agent Lounge

An Agent ID-gated clubhouse. Agent Lounge is a small members-only space
where membership is not bought, minted, or granted by an admin — it is
**proven on-chain by holding an Agent ID**. Holders check in once a day to
build streaks and points, write on a shared on-chain guest wall, and claim
badge levels earned through consistency. Everything is recorded on-chain
and readable by anyone.

Built for the Agent ID Hackathon (submission deadline 2026-12-09).

## How Agent ID is used

Agent ID integration is the core of the product, not an add-on:

- The official Agent ID registry — the SPACE ID Agent ID ERC-721 at
  `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` on BNB Chain — is passed to
  the contract constructor and stored as an **immutable** address.
- Every write function (`checkIn`, `postMessage`, `claimBadge`) is behind
  a single modifier that performs exactly the holding check from the
  hackathon documentation:

  ```solidity
  require(agentIdRegistry.balanceOf(msg.sender) > 0, "Agent ID required");
  ```

- If an address stops holding an Agent ID, its write access stops with
  it — there is no separate membership list to maintain or manipulate.
- The frontend repeats the same `balanceOf` check so visitors immediately
  see whether their address has lounge access, and offers a read-only
  lookup for any address.

## Features

| Feature | Rule |
| --- | --- |
| Daily check-in | 1 per member per UTC day; builds consecutive-day streaks |
| Points | `10 + min(streak, 7)` per check-in (base + capped streak bonus) |
| Guest wall | Messages of 1–280 bytes, stored on-chain, newest first |
| Badges | Level 1 at 3 check-ins, 2 at 7, 3 at 14, 4 at 30; claimed on-chain, levels only increase |

## Contract permissions: none, by design

`AgentLounge` is deliberately permissionless in the strongest sense:

- **No owner, no admin roles, no privileged functions at all.**
- **No payable functions** — the contract cannot receive, hold, or move
  funds. There is no transfer, withdraw, or sweep function.
- **No mint, pause, freeze, upgrade, or configuration functions.** The
  registry address is immutable; the rules can never change after
  deployment, and nobody — including the deployer — can alter or delete
  another member's data.

## Repository layout

```
contracts/AgentLounge.sol   the lounge contract (Solidity ^0.8.20, no deps)
contracts/MockAgentID.sol   test double for the registry (tests only)
test/AgentLounge.test.js    Hardhat test suite (20 tests)
scripts/deploy.js           deployment script (key from env only)
frontend/                   static dApp (index.html + app.js + style.css)
```

## Build & test

```bash
npm install
npx hardhat compile
npx hardhat test
```

Compiled artifact (ABI + bytecode) after compiling:
`artifacts/contracts/AgentLounge.sol/AgentLounge.json`
(deployed/runtime bytecode: 3,781 bytes; compiler 0.8.20, optimizer 200 runs).

## Deploy

The deployer key is read from the environment — never commit a key.

```bash
export DEPLOYER_PRIVATE_KEY=<your deployer private key>
export AGENT_ID_REGISTRY=0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
npm run deploy:bsc
```

(`AGENT_ID_REGISTRY` defaults to the official registry address above if
unset.) Note the deployed address printed by the script, then paste it
into `CONFIG.LOUNGE_ADDRESS` at the top of `frontend/app.js`.

## Verify on BscScan

Install the verify plugin once (`npm i -D @nomicfoundation/hardhat-verify`,
add it to `hardhat.config.js` with your BscScan API key), then:

```bash
npx hardhat verify --network bsc <DEPLOYED_ADDRESS> 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
```

The constructor argument is the Agent ID registry address used at deploy
time. Alternatively, verify manually on BscScan with compiler 0.8.20,
optimizer enabled (200 runs), and the flattened `AgentLounge.sol` source
(the contract has no external dependencies).

## Frontend

Open `frontend/index.html` via any static host (e.g. GitHub Pages).
It connects an injected wallet on chainId 56, shows Agent ID holder
status, member stats, check-in and badge actions, and the guest wall.
Without a wallet it falls back to a public RPC for read-only lookups.

## Notes

- Points and badges are in-app records of participation; they are not
  tokens and carry no monetary value.
- This project is unaudited hackathon software; review the contract
  before using it for anything else.

## License

MIT — see [LICENSE](LICENSE).
