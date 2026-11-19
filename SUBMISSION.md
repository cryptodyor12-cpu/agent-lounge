# Hackathon Submission — Agent Lounge

_Pre-filled submission form for the Agent ID Hackathon.
Submission period closes 2026-12-09 08:00 UTC._

---

**Project name:** Agent Lounge

**Website:** TBD (GitHub Pages after deploy)

**Contract address(es):** 0x3c4184a1705751770433e052618268b0f24c0f70 (deployed 2026-11-19, tx 0xb622997e5d31b164990989f9cc368ed06da415c78ff81d3966089ea15670b0da)

**>>> REWARD RECEIVING ADDRESS: 0x0FEc37a73dE3B681c65289b2ad507DA736bbD42b <<<**

**Description:**
Agent Lounge is an Agent ID-gated clubhouse. It turns an Agent ID into a
working membership credential: only addresses that hold an Agent ID can
check in each day, write on the shared on-chain guest wall, and claim
badge levels earned through consistent participation. Streaks, points,
messages, and badges are all stored on-chain and publicly readable, while
the contract itself holds no funds, has no owner, and can never be
reconfigured — membership is proven, never granted.

**Agent ID usage description:**
Agent ID is the product's core access-control layer. The lounge contract
is constructed with the official Agent ID registry (SPACE ID Agent ID
ERC-721, 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F on BNB Chain) as an
immutable address. Every state-changing function — daily check-in,
guest-wall posting, and badge claiming — sits behind a single modifier
that performs the documented holding check, `balanceOf(caller) > 0` on
the registry, and reverts with "Agent ID required" for non-holders.
There is no allowlist, no admin, and no way to bypass or fake the check;
losing the Agent ID immediately ends write access. The frontend performs
the same balanceOf check to show each visitor their holder status and
offers read-only stat lookups for any address.

**Source code:** public repository, MIT license (link to be added when published)

**Contract verification:** BscScan verified source (after deploy — see launch steps)

---

## Remaining launch steps (in order)

1. **Deploy** — fund a deployer with a small amount of gas, set
   `DEPLOYER_PRIVATE_KEY` and `AGENT_ID_REGISTRY` in the environment,
   run `npm run deploy:bsc`, and record the AgentLounge address.
2. **Verify on BscScan** — verify the deployed contract with the registry
   address as the constructor argument (command in README.md), so the
   source is public and readable.
3. **Publish the site** — paste the deployed address into
   `CONFIG.LOUNGE_ADDRESS` in `frontend/app.js`, then publish `frontend/`
   to GitHub Pages and note the URL.
4. **Submit the form** — fill in this file's TBD fields (website,
   contract address, repository link) and submit the project through the
   official hackathon submission channel before 2026-12-09 08:00 UTC.
5. **Drive Agent ID holders to interact** — share the site with Agent ID
   holders so real holders check in, post on the wall, and claim badges
   during the submission period (the Innovation Award requires at least
   30 distinct Agent ID addresses interacting with the contract).
