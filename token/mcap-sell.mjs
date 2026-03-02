import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const SELL_MCAP = parseFloat(process.env.SELL_MCAP || "25000"); // $25K market cap trigger (baseline is ~$8.4K)
const SLIPPAGE = parseInt(process.env.SLIPPAGE || "30");
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || "15"); // seconds between price checks

const conn = new Connection(RPC_URL, "confirmed");

// Load results from mass launch
const results = JSON.parse(fs.readFileSync(path.join(__dirname, "mass-launch-results.json"), "utf8"));
const activeTokens = new Map(); // mint -> { token info, sold: false }

for (const r of results) {
  if (r.mint) {
    activeTokens.set(r.mint, { ...r, sold: false });
  }
}

function loadWallet(walletNum) {
  const fp = path.join(FLEET_DIR, `wallet-${walletNum}.json`);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(fp, "utf8"))));
}

async function getSolPrice() {
  try {
    const resp = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112");
    const data = await resp.json();
    return parseFloat(data.data?.["So11111111111111111111111111111111111111112"]?.price || "140");
  } catch {
    return 140;
  }
}

async function getTokenMcap(mint, solPrice) {
  // Use pump.fun coin data API to get market cap
  try {
    const resp = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`);
    if (!resp.ok) return 0;
    const data = await resp.json();
    // market_cap is in USD from their API, or calculate from virtual reserves
    if (data.market_cap) return data.market_cap;
    // Fallback: bonding curve calculation
    const vSol = (data.virtual_sol_reserves || 0) / LAMPORTS_PER_SOL;
    return vSol * solPrice * 2;
  } catch {
    return 0;
  }
}

async function sellAll(walletNum, mint) {
  const wallet = loadWallet(walletNum);
  try {
    const resp = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "sell",
        mint,
        denominatedInSol: "false",
        amount: "100%",
        slippage: SLIPPAGE,
        priorityFee: 0.001,
        pool: "pump",
      }),
    });
    if (resp.status !== 200) {
      console.log(`    Sell API error: ${resp.status}`);
      return null;
    }
    const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
    tx.sign([wallet]);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
    return sig;
  } catch (e) {
    console.log(`    Sell error: ${e.message.slice(0, 60)}`);
    return null;
  }
}

async function checkAndSell() {
  const solPrice = await getSolPrice();
  const remaining = [...activeTokens.values()].filter(t => !t.sold);

  if (remaining.length === 0) {
    console.log("\nAll tokens sold! Exiting.");
    process.exit(0);
  }

  for (const token of remaining) {
    try {
      const mcap = await getTokenMcap(token.mint, solPrice);
      const time = new Date().toLocaleTimeString();

      if (mcap >= SELL_MCAP) {
        console.log(`\n[${time}] ${token.symbol} MCAP: $${mcap.toFixed(0)} >= $${SELL_MCAP} — SELLING!`);
        const sig = await sellAll(token.wallet, token.mint);
        if (sig) {
          console.log(`  SOLD from wallet-${token.wallet}: ${sig.slice(0, 30)}...`);
          token.sold = true;
        }
      } else if (mcap > 0) {
        console.log(`  [${time}] ${token.symbol}: $${mcap.toFixed(0)} mcap (target: $${SELL_MCAP})`);
      }

      await new Promise(r => setTimeout(r, 1500)); // rate limit
    } catch (e) {
      // skip errors on individual tokens
    }
  }
}

// Also listen to WebSocket for real-time trade events on our tokens
function startWsMonitor() {
  const ws = new WebSocket("wss://pumpportal.fun/api/data");

  ws.on("open", () => {
    console.log("WebSocket connected — subscribing to token trades...");
    // Subscribe to trade events for all our tokens
    for (const [mint] of activeTokens) {
      ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
    }
  });

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg.mint || !activeTokens.has(msg.mint)) return;

      const token = activeTokens.get(msg.mint);
      if (token.sold) return;

      // Check market cap from the trade event
      const mcap = msg.marketCapSol ? msg.marketCapSol * (await getSolPrice()) : 0;
      const time = new Date().toLocaleTimeString();

      if (mcap > 0) {
        console.log(`  [${time}] ${token.symbol} trade: mcap ~$${mcap.toFixed(0)} (${msg.txType || "trade"})`);
      }

      if (mcap >= SELL_MCAP) {
        console.log(`\n  >>> ${token.symbol} HIT $${SELL_MCAP} MCAP — AUTO-SELLING <<<`);
        const sig = await sellAll(token.wallet, token.mint);
        if (sig) {
          console.log(`  SOLD from wallet-${token.wallet}: ${sig.slice(0, 30)}...`);
          token.sold = true;

          // Unsubscribe
          ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [token.mint] }));
        }
      }
    } catch {
      // ignore
    }
  });

  ws.on("close", () => {
    const remaining = [...activeTokens.values()].filter(t => !t.sold).length;
    if (remaining > 0) {
      console.log("WebSocket closed. Reconnecting in 3s...");
      setTimeout(startWsMonitor, 3000);
    }
  });

  ws.on("error", (e) => console.error("WS error:", e.message));
}

// === MAIN ===
console.log("=== Market Cap Auto-Sell Monitor ===\n");
console.log(`Sell trigger: $${SELL_MCAP} market cap`);
console.log(`Monitoring ${activeTokens.size} tokens:\n`);

for (const [mint, t] of activeTokens) {
  console.log(`  ${t.symbol} (wallet-${t.wallet}): ${mint.slice(0, 12)}...`);
}

console.log(`\nStarting monitor (polling every ${CHECK_INTERVAL}s + WebSocket)...\n`);

// Start WebSocket real-time monitor
startWsMonitor();

// Also poll periodically as backup
const poll = async () => {
  await checkAndSell();
  const remaining = [...activeTokens.values()].filter(t => !t.sold).length;
  if (remaining > 0) {
    setTimeout(poll, CHECK_INTERVAL * 1000);
  }
};

// Start first poll after 5s (let WS connect first)
setTimeout(poll, 5000);
