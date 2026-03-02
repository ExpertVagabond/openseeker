import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// === CONFIG ===
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const CYCLE_AMOUNT_SOL = parseFloat(process.env.AMOUNT || "0.02"); // SOL per cycle
const MIN_INTERVAL_S = parseInt(process.env.MIN_INTERVAL || "20");
const MAX_INTERVAL_S = parseInt(process.env.MAX_INTERVAL || "60");
const SLIPPAGE = parseInt(process.env.SLIPPAGE || "25");
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || "0"); // 0 = infinite

const conn = new Connection(RPC_URL, "confirmed");
let cycleCount = 0;
let totalVolume = 0;

// Load all token mints from mass launch results
const launchResults = JSON.parse(fs.readFileSync(path.join(__dirname, "mass-launch-results.json"), "utf8"));
const TOKEN_MINTS = launchResults.filter(r => r.mint).map(r => ({ mint: r.mint, symbol: r.symbol, wallet: r.wallet }));

function randomToken() {
  return TOKEN_MINTS[Math.floor(Math.random() * TOKEN_MINTS.length)];
}

function loadFleet() {
  const wallets = [];
  for (let i = 1; i <= 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i}.json`);
    if (fs.existsSync(fp)) {
      const secret = JSON.parse(fs.readFileSync(fp, "utf8"));
      wallets.push({ id: i, keypair: Keypair.fromSecretKey(new Uint8Array(secret)) });
    }
  }
  return wallets;
}

function randomInterval() {
  return (MIN_INTERVAL_S + Math.random() * (MAX_INTERVAL_S - MIN_INTERVAL_S)) * 1000;
}

function randomWallet(fleet) {
  return fleet[Math.floor(Math.random() * fleet.length)];
}

async function sellFromWallet(w, mint) {
  const resp = await fetch("https://pumpdev.io/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: w.keypair.publicKey.toBase58(),
      action: "sell",
      mint,
      denominatedInSol: "false",
      amount: "100%",
      slippage: SLIPPAGE,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });
  if (resp.status !== 200) return null;
  const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
  tx.sign([w.keypair]);
  return conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
}

async function buyFromWallet(w, mint, amount) {
  const resp = await fetch("https://pumpdev.io/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: w.keypair.publicKey.toBase58(),
      action: "buy",
      mint,
      denominatedInSol: "true",
      amount,
      slippage: SLIPPAGE,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });
  if (resp.status !== 200) return null;
  const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
  tx.sign([w.keypair]);
  return conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
}

async function runCycle(fleet) {
  cycleCount++;
  const token = randomToken();
  // Token's own wallet (guaranteed to hold tokens from initial buy)
  const tokenWallet = fleet.find(w => w.id === token.wallet);
  const buyWallet = randomWallet(fleet);
  const now = new Date().toLocaleTimeString();

  // Randomly choose pattern
  const action = Math.random();

  try {
    if (action < 0.35) {
      // Sell from token's wallet, then rebuy from random wallet
      console.log(`[${now}] Cycle #${cycleCount} $${token.symbol}: wallet-${tokenWallet.id} SELL → wallet-${buyWallet.id} BUY`);
      const sellSig = await sellFromWallet(tokenWallet, token.mint);
      if (sellSig) {
        console.log(`  Sold: ${sellSig.slice(0, 20)}...`);
        totalVolume += CYCLE_AMOUNT_SOL;
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.log(`  Sell failed (no tokens?)`);
      }
      const buySig = await buyFromWallet(buyWallet, token.mint, CYCLE_AMOUNT_SOL);
      if (buySig) {
        console.log(`  Bought ${CYCLE_AMOUNT_SOL} SOL: ${buySig.slice(0, 20)}...`);
        totalVolume += CYCLE_AMOUNT_SOL;
      }
    } else if (action < 0.55) {
      // Just buy (accumulate across wallets)
      console.log(`[${now}] Cycle #${cycleCount} wallet-${buyWallet.id} on $${token.symbol}: BUY`);
      const bal = await conn.getBalance(buyWallet.keypair.publicKey);
      if (bal / LAMPORTS_PER_SOL < CYCLE_AMOUNT_SOL + 0.005) {
        console.log(`  Skip — low balance (${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
        return;
      }
      const sig = await buyFromWallet(buyWallet, token.mint, CYCLE_AMOUNT_SOL);
      if (sig) {
        console.log(`  Bought: ${sig.slice(0, 20)}...`);
        totalVolume += CYCLE_AMOUNT_SOL;
      }
    } else if (action < 0.75) {
      // Just sell from token's wallet
      console.log(`[${now}] Cycle #${cycleCount} wallet-${tokenWallet.id} on $${token.symbol}: SELL`);
      const sig = await sellFromWallet(tokenWallet, token.mint);
      if (sig) {
        console.log(`  Sold: ${sig.slice(0, 20)}...`);
        totalVolume += CYCLE_AMOUNT_SOL;
      } else {
        console.log(`  Sell failed (no tokens?)`);
      }
    } else {
      // Cross-wallet: buy from random, sell from token's wallet simultaneously
      const otherBuyer = randomWallet(fleet.filter(x => x.id !== tokenWallet.id));
      console.log(`[${now}] Cycle #${cycleCount} $${token.symbol}: wallet-${otherBuyer.id} BUY + wallet-${tokenWallet.id} SELL`);
      const [buySig, sellSig] = await Promise.all([
        buyFromWallet(otherBuyer, token.mint, CYCLE_AMOUNT_SOL).catch(() => null),
        sellFromWallet(tokenWallet, token.mint).catch(() => null),
      ]);
      if (buySig) console.log(`  wallet-${otherBuyer.id} bought: ${buySig.slice(0, 20)}...`);
      if (sellSig) console.log(`  wallet-${tokenWallet.id} sold: ${sellSig.slice(0, 20)}...`);
      totalVolume += CYCLE_AMOUNT_SOL * 2;
    }
  } catch (e) {
    console.log(`  Error: ${e.message.slice(0, 60)}`);
  }

  console.log(`  Total volume generated: ${totalVolume.toFixed(4)} SOL\n`);
}

async function main() {
  console.log("=== Multi-Token Volume Bot ===\n");
  console.log("Config:");
  console.log(`  Tokens: ${TOKEN_MINTS.map(t => "$" + t.symbol).join(", ")}`);
  console.log(`  Amount per cycle: ${CYCLE_AMOUNT_SOL} SOL`);
  console.log(`  Interval: ${MIN_INTERVAL_S}-${MAX_INTERVAL_S}s (randomized)`);
  console.log(`  Slippage: ${SLIPPAGE}%`);
  console.log(`  Max cycles: ${MAX_CYCLES || "unlimited"}`);

  const fleet = loadFleet();
  console.log(`  Fleet: ${fleet.length} wallets\n`);

  // Check fleet has tokens
  let readyCount = 0;
  for (const w of fleet) {
    const bal = await conn.getBalance(w.keypair.publicKey);
    if (bal / LAMPORTS_PER_SOL >= CYCLE_AMOUNT_SOL + 0.003) readyCount++;
  }
  console.log(`${readyCount}/${fleet.length} wallets have enough SOL\n`);
  console.log("Starting volume cycles...\n");

  while (true) {
    await runCycle(fleet);

    if (MAX_CYCLES > 0 && cycleCount >= MAX_CYCLES) {
      console.log(`\nReached ${MAX_CYCLES} cycles. Stopping.`);
      break;
    }

    const delay = randomInterval();
    console.log(`  Next cycle in ${(delay / 1000).toFixed(0)}s...\n`);
    await new Promise(r => setTimeout(r, delay));
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
