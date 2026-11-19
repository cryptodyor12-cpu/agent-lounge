/* =====================================================================
 * Agent Lounge — frontend logic
 *
 * CONFIG — EDIT THESE TWO VALUES BEFORE GOING LIVE:
 *
 *   LOUNGE_ADDRESS:  >>> PLACEHOLDER — paste the deployed AgentLounge
 *                    contract address here after running the deploy
 *                    script (see README.md). Until then, write actions
 *                    stay disabled and reads will fail gracefully.
 *
 *   REGISTRY_ADDRESS: the official Agent ID registry (ERC-721) on
 *                    BNB Chain mainnet. Holding check = balanceOf > 0.
 * ===================================================================== */
const CONFIG = {
  LOUNGE_ADDRESS: "0x3c4184a1705751770433e052618268b0f24c0f70", // <<< CONFIG: deployed AgentLounge address (BNB Chain, 2026-11-19)
  REGISTRY_ADDRESS: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F",
  CHAIN_ID: 56,
  CHAIN_ID_HEX: "0x38",
  READ_RPC: "https://bsc-dataseed.binance.org", // public read-only fallback
  WALL_PAGE_SIZE: 20,
};

const REGISTRY_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
];

const LOUNGE_ABI = [
  "function checkIn()",
  "function postMessage(string text)",
  "function claimBadge()",
  "function badgeLevel(address user) view returns (uint256)",
  "function memberStats(address user) view returns (uint256 totalCheckIns, uint256 currentStreak, uint256 bestStreak, uint256 points, uint256 earnedBadgeLevel, uint256 claimedBadgeLevel, uint256 lastCheckInDay)",
  "function messageCount() view returns (uint256)",
  "function getMessages(uint256 offset, uint256 limit) view returns (tuple(address author, uint256 timestamp, string text)[])",
];

const BADGE_NAMES = ["No badge", "Newcomer", "Regular", "Lounge Fixture", "Lounge Legend"];
const BADGE_THRESHOLDS = [0, 3, 7, 14, 30];

let walletProvider = null; // ethers BrowserProvider when a wallet connects
let signer = null;
let account = null;
let isHolder = false;

const readProvider = new ethers.JsonRpcProvider(CONFIG.READ_RPC);
const registryRead = new ethers.Contract(CONFIG.REGISTRY_ADDRESS, REGISTRY_ABI, readProvider);
const loungeRead = new ethers.Contract(CONFIG.LOUNGE_ADDRESS, LOUNGE_ABI, readProvider);

const $ = (id) => document.getElementById(id);

function setStatus(el, text, kind) {
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function shortAddr(a) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}

function loungeWritable() {
  if (!signer) return null;
  return new ethers.Contract(CONFIG.LOUNGE_ADDRESS, LOUNGE_ABI, signer);
}

function loungeConfigured() {
  return CONFIG.LOUNGE_ADDRESS !== "0x0000000000000000000000000000000000000000";
}

/* ---------------------------- wallet ---------------------------- */

async function ensureChain() {
  const current = await window.ethereum.request({ method: "eth_chainId" });
  if (current === CONFIG.CHAIN_ID_HEX) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CONFIG.CHAIN_ID_HEX }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CONFIG.CHAIN_ID_HEX,
          chainName: "BNB Chain",
          nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
          rpcUrls: [CONFIG.READ_RPC],
          blockExplorerUrls: ["https://bscscan.com"],
        }],
      });
    } else {
      throw err;
    }
  }
}

async function connect() {
  if (!window.ethereum) {
    setStatus($("walletStatus"),
      "No injected wallet found. You can still browse stats and the wall below.",
      "error");
    return;
  }
  try {
    await ensureChain();
    walletProvider = new ethers.BrowserProvider(window.ethereum);
    signer = await walletProvider.getSigner();
    account = await signer.getAddress();
    $("connectBtn").textContent = shortAddr(account);
    setStatus($("walletStatus"), "Connected: " + account, "ok");
    await refreshMember();
  } catch (err) {
    setStatus($("walletStatus"), "Connection failed: " + (err.shortMessage || err.message), "error");
  }
}

/* ---------------------------- member ---------------------------- */

async function refreshMember() {
  if (!account) return;
  try {
    const bal = await registryRead.balanceOf(account);
    isHolder = bal > 0n;
    setStatus($("holderStatus"),
      isHolder
        ? "✔ Agent ID holder — full lounge access."
        : "✖ Not an Agent ID holder — check-in, posting and badges are locked for this address.",
      isHolder ? "ok" : "error");

    if (!loungeConfigured()) {
      setStatus($("actionStatus"),
        "Lounge contract address is not configured yet (see CONFIG in app.js).", "error");
      return;
    }

    const provider = walletProvider || readProvider;
    const lounge = new ethers.Contract(CONFIG.LOUNGE_ADDRESS, LOUNGE_ABI, provider);
    const s = await lounge.memberStats(account);
    $("statCheckIns").textContent = s.totalCheckIns.toString();
    $("statStreak").textContent = s.currentStreak.toString();
    $("statBest").textContent = s.bestStreak.toString();
    $("statPoints").textContent = s.points.toString();
    $("statBadge").textContent =
      BADGE_NAMES[Number(s.claimedBadgeLevel)] + " (L" + s.claimedBadgeLevel.toString() + ")";

    const earned = Number(s.earnedBadgeLevel);
    const claimed = Number(s.claimedBadgeLevel);
    if (earned > claimed) {
      $("badgeHint").textContent =
        "You earned badge level " + earned + " (" + BADGE_NAMES[earned] + ") — claim it below.";
    } else if (earned < 4) {
      $("badgeHint").textContent =
        "Next badge (" + BADGE_NAMES[earned + 1] + ") at " +
        BADGE_THRESHOLDS[earned + 1] + " check-ins.";
    } else {
      $("badgeHint").textContent = "You hold the highest badge level.";
    }

    const today = BigInt(Math.floor(Date.now() / 86400000));
    const alreadyToday = s.totalCheckIns > 0n && s.lastCheckInDay === today;
    $("checkInBtn").disabled = !isHolder || alreadyToday;
    $("checkInBtn").textContent = alreadyToday ? "Checked in ✓ (come back tomorrow)" : "Check in today";
    $("claimBadgeBtn").disabled = !isHolder || earned <= claimed;
    $("postBtn").disabled = !isHolder;
  } catch (err) {
    setStatus($("actionStatus"), "Could not load member stats: " + (err.shortMessage || err.message), "error");
  }
}

async function doCheckIn() {
  const lounge = loungeWritable();
  if (!lounge) return;
  try {
    setStatus($("actionStatus"), "Sending check-in… confirm in your wallet.");
    const tx = await lounge.checkIn();
    await tx.wait();
    setStatus($("actionStatus"), "Checked in. See you tomorrow!", "ok");
    await refreshMember();
  } catch (err) {
    setStatus($("actionStatus"), "Check-in failed: " + (err.shortMessage || err.message), "error");
  }
}

async function doClaimBadge() {
  const lounge = loungeWritable();
  if (!lounge) return;
  try {
    setStatus($("actionStatus"), "Sending badge claim… confirm in your wallet.");
    const tx = await lounge.claimBadge();
    await tx.wait();
    setStatus($("actionStatus"), "Badge claimed.", "ok");
    await refreshMember();
  } catch (err) {
    setStatus($("actionStatus"), "Badge claim failed: " + (err.shortMessage || err.message), "error");
  }
}

/* ---------------------------- guest wall ---------------------------- */

async function refreshWall() {
  const list = $("wallList");
  if (!loungeConfigured()) {
    list.innerHTML = "<li class='muted'>Lounge contract address is not configured yet (see CONFIG in app.js).</li>";
    return;
  }
  try {
    const count = await loungeRead.messageCount();
    if (count === 0n) {
      list.innerHTML = "<li class='muted'>The wall is empty. Be the first to write on it.</li>";
      return;
    }
    const msgs = await loungeRead.getMessages(0, CONFIG.WALL_PAGE_SIZE);
    list.innerHTML = "";
    for (const m of msgs) {
      const li = document.createElement("li");
      const when = new Date(Number(m.timestamp) * 1000).toLocaleString();
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = shortAddr(m.author) + " · " + when;
      const text = document.createElement("div");
      text.className = "text";
      text.textContent = m.text;
      li.appendChild(meta);
      li.appendChild(text);
      list.appendChild(li);
    }
  } catch (err) {
    list.innerHTML = "<li class='muted'>Could not load the wall: " +
      (err.shortMessage || err.message) + "</li>";
  }
}

async function doPost(evt) {
  evt.preventDefault();
  const lounge = loungeWritable();
  if (!lounge) return;
  const text = $("postText").value.trim();
  if (!text) return;
  try {
    setStatus($("postStatus"), "Posting… confirm in your wallet.");
    const tx = await lounge.postMessage(text);
    await tx.wait();
    $("postText").value = "";
    updateCharCount();
    setStatus($("postStatus"), "Posted to the wall.", "ok");
    await refreshWall();
  } catch (err) {
    setStatus($("postStatus"), "Post failed: " + (err.shortMessage || err.message), "error");
  }
}

function updateCharCount() {
  const bytes = new TextEncoder().encode($("postText").value).length;
  $("charCount").textContent = bytes + " / 280 bytes";
}

/* ---------------------------- lookup (read-only) ---------------------------- */

async function doLookup() {
  const addr = $("lookupInput").value.trim();
  const out = $("lookupResult");
  if (!ethers.isAddress(addr)) {
    out.innerHTML = "<p class='status error'>That does not look like a valid address.</p>";
    return;
  }
  try {
    const bal = await registryRead.balanceOf(addr);
    const holderText = bal > 0n ? "Agent ID holder ✔" : "Not an Agent ID holder ✖";
    if (!loungeConfigured()) {
      out.innerHTML = "<p class='status'>" + holderText +
        ". Lounge stats unavailable until the contract address is configured.</p>";
      return;
    }
    const s = await loungeRead.memberStats(addr);
    out.innerHTML =
      "<p class='status'>" + holderText + "</p>" +
      "<p class='muted'>Check-ins: " + s.totalCheckIns.toString() +
      " · Streak: " + s.currentStreak.toString() +
      " · Best: " + s.bestStreak.toString() +
      " · Points: " + s.points.toString() +
      " · Badge: " + BADGE_NAMES[Number(s.claimedBadgeLevel)] +
      " (claimed L" + s.claimedBadgeLevel.toString() +
      ", earned L" + s.earnedBadgeLevel.toString() + ")</p>";
  } catch (err) {
    out.innerHTML = "<p class='status error'>Lookup failed: " +
      (err.shortMessage || err.message) + "</p>";
  }
}

/* ---------------------------- wiring ---------------------------- */

$("connectBtn").addEventListener("click", connect);
$("checkInBtn").addEventListener("click", doCheckIn);
$("claimBadgeBtn").addEventListener("click", doClaimBadge);
$("postForm").addEventListener("submit", doPost);
$("postText").addEventListener("input", updateCharCount);
$("refreshWallBtn").addEventListener("click", refreshWall);
$("lookupBtn").addEventListener("click", doLookup);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

refreshWall();
