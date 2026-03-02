import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// === CONFIG ===
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const SLIPPAGE = parseInt(process.env.SLIPPAGE || "25");
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || "20");
const SELL_MCAP = parseFloat(process.env.SELL_MCAP || "6000");

// Fee constants (% of trade value)
const PUMP_FEE = 0.01;      // 1% pump.fun
const PUMPDEV_FEE = 0.0025; // 0.25% PumpDev
const PRIORITY_FEE = 0.001; // SOL per tx
const TOTAL_FEE_PCT = PUMP_FEE + PUMPDEV_FEE; // ~1.25%

const conn = new Connection(RPC_URL, "confirmed");

// Load results — focus on top 3 engaged tokens
const launchResults = JSON.parse(fs.readFileSync(path.join(__dirname, "mass-launch-results.json"), "utf8"));
const ALL_TOKENS = launchResults.filter(r => r.mint).map(r => ({ mint: r.mint, symbol: r.symbol, wallet: r.wallet }));

// Prioritize by engagement (CSIGN, TRELAY, SWARM have most replies)
const FOCUS_TOKENS = ALL_TOKENS.filter(t => ["CSIGN", "TRELAY", "SWARM"].includes(t.symbol));
const SECONDARY_TOKENS = ALL_TOKENS.filter(t => ["MDAO", "SEEDG", "SEEKBOT"].includes(t.symbol));

// P&L tracking
let totalSpent = 0;
let totalFeesEstimated = 0;
let totalBuys = 0;
let cycleCount = 0;

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(`${FLEET_DIR}/wallet-${num}.json`, "utf8"))));
}

async function getSolPrice() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const d = await r.json();
    return parseFloat(d?.solana?.usd || "80");
  } catch { return 80; }
}

async function getTokenMcap(mint) {
  try {
    const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`);
    if (!r.ok) return { mcap: 0, vSol: 0, rSol: 0 };
    const d = await r.json();
    const vSol = (d.virtual_sol_reserves || 0) / LAMPORTS_PER_SOL;
    const rSol = (d.real_sol_reserves || 0) / LAMPORTS_PER_SOL;
    const solPrice = await getSolPrice();
    return { mcap: vSol * solPrice * 2, vSol, rSol };
  } catch { return { mcap: 0, vSol: 0, rSol: 0 }; }
}

async function buyFromWallet(walletNum, mint, amount) {
  const wallet = loadWallet(walletNum);
  try {
    const resp = await fetch("https://pumpdev.io/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "buy",
        mint,
        denominatedInSol: "true",
        amount,
        slippage: SLIPPAGE,
        priorityFee: PRIORITY_FEE,
        pool: "pump",
      }),
    });
    if (resp.status !== 200) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const tx = VersionedTransaction.deserialize(new Uint8Array(buf));
    tx.sign([wallet]);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
    return sig;
  } catch { return null; }
}

async function sellAllFromWallet(walletNum, mint) {
  const wallet = loadWallet(walletNum);
  try {
    const resp = await fetch("https://pumpdev.io/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "sell",
        mint,
        denominatedInSol: "false",
        amount: "100%",
        slippage: SLIPPAGE,
        priorityFee: PRIORITY_FEE,
        pool: "pump",
      }),
    });
    if (resp.status !== 200) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const tx = VersionedTransaction.deserialize(new Uint8Array(buf));
    tx.sign([wallet]);
    return conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  } catch { return null; }
}

async function claimFees(walletNum, mint) {
  const wallet = loadWallet(walletNum);
  try {
    const resp = await fetch("https://pumpdev.io/api/claim-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        mint,
        priorityFee: 0.0005,
      }),
    });
    if (resp.status !== 200) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0) return null;
    const tx = VersionedTransaction.deserialize(new Uint8Array(buf));
    tx.sign([wallet]);
    return conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
  } catch { return null; }
}

async function getFleetBalance() {
  let total = 0;
  for (let i = 1; i <= 10; i++) {
    const w = loadWallet(i);
    const bal = await conn.getBalance(w.publicKey);
    total += bal / LAMPORTS_PER_SOL;
    await new Promise(r => setTimeout(r, 200));
  }
  return total;
}

// === STRATEGY ===
// 1. BUY ONLY on focus tokens (no wash trading)
// 2. Larger buys (0.08-0.12 SOL) for more price impact per fee dollar
// 3. Space buys 45-90s apart (look organic, not botty)
// 4. After every 5 buys, claim fees to recover some costs
// 5. Auto-sell at SELL_MCAP target
// 6. Track exact P&L

async function smartCycle(tokens) {
  cycleCount++;
  const token = tokens[cycleCount % tokens.length];
  const now = new Date().toLocaleTimeString();

  // Check mcap first — sell if above target
  const { mcap, vSol, rSol } = await getTokenMcap(token.mint);

  if (mcap >= SELL_MCAP) {
    console.log(`\n[${now}] ${token.symbol} HIT $${mcap.toFixed(0)} >= $${SELL_MCAP} — SELLING ALL`);
    // Sell from all wallets that might hold this token
    for (let w = 1; w <= 10; w++) {
      const sig = await sellAllFromWallet(w, token.mint);
      if (sig) console.log(`  wallet-${w}: SOLD ${sig.slice(0, 25)}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
    return;
  }

  // Calculate optimal buy size
  // Want each buy to move mcap meaningfully (at least 0.5% of current mcap)
  // But not so large that slippage eats us
  // With 30 vSOL, a 0.1 SOL buy is ~0.33% of reserves — reasonable
  const buyAmount = 0.08 + Math.random() * 0.04; // 0.08-0.12 SOL (randomized)
  const feeCost = buyAmount * TOTAL_FEE_PCT + PRIORITY_FEE;

  // Pick wallet with enough balance (prefer non-creator wallets for distribution)
  let bestWallet = null;
  let bestBalance = 0;
  const walletOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].sort(() => Math.random() - 0.5);

  for (const wNum of walletOrder) {
    const w = loadWallet(wNum);
    const bal = await conn.getBalance(w.publicKey);
    const solBal = bal / LAMPORTS_PER_SOL;
    if (solBal >= buyAmount + 0.01 && solBal > bestBalance) {
      bestWallet = wNum;
      bestBalance = solBal;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  if (!bestWallet) {
    console.log(`[${now}] #${cycleCount} ${token.symbol}: No wallet with ${buyAmount.toFixed(3)}+ SOL — skipping`);
    return;
  }

  console.log(`[${now}] #${cycleCount} ${token.symbol} | mcap: $${mcap.toFixed(0)} | BUY ${buyAmount.toFixed(3)} SOL from wallet-${bestWallet}`);
  console.log(`  Est. fee: ${feeCost.toFixed(4)} SOL (${(TOTAL_FEE_PCT * 100).toFixed(2)}% + ${PRIORITY_FEE} priority)`);

  const sig = await buyFromWallet(bestWallet, token.mint, buyAmount);
  if (sig) {
    totalBuys++;
    totalSpent += buyAmount;
    totalFeesEstimated += feeCost;
    console.log(`  OK: ${sig.slice(0, 30)}...`);
  } else {
    console.log(`  FAILED — API error or insufficient balance`);
  }

  // After every 5 buys, claim fees on all focus tokens
  if (totalBuys > 0 && totalBuys % 5 === 0) {
    console.log(`\n  --- Fee claim round (after ${totalBuys} buys) ---`);
    for (const t of tokens) {
      const sig = await claimFees(t.wallet, t.mint);
      if (sig) console.log(`  ${t.symbol}: claimed ${sig.slice(0, 20)}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`  Running P&L: spent ${totalSpent.toFixed(4)} SOL, est. fees ${totalFeesEstimated.toFixed(4)} SOL, ${totalBuys} buys\n`);
}

async function main() {
  console.log("=== Smart Trader — Fee-Aware Strategy ===\n");
  console.log("Strategy: Buy-only on high-engagement tokens. No wash trading.");
  console.log(`Sell target: $${SELL_MCAP} mcap`);
  console.log(`Fee budget: ${(TOTAL_FEE_PCT * 100).toFixed(2)}% + ${PRIORITY_FEE} SOL/tx\n`);
  console.log("Focus tokens (most engagement):");
  FOCUS_TOKENS.forEach(t => console.log(`  ${t.symbol} (wallet-${t.wallet})`));
  console.log("\nSecondary tokens (occasional buys):");
  SECONDARY_TOKENS.forEach(t => console.log(`  ${t.symbol} (wallet-${t.wallet})`));

  const startBalance = await getFleetBalance();
  console.log(`\nFleet SOL: ${startBalance.toFixed(4)}`);
  console.log(`Max cycles: ${MAX_CYCLES}\n`);
  console.log("Starting...\n");

  for (let i = 0; i < MAX_CYCLES; i++) {
    // 75% of buys go to focus tokens, 25% to secondary
    const pool = Math.random() < 0.75 ? FOCUS_TOKENS : SECONDARY_TOKENS;
    await smartCycle(pool);

    if (i < MAX_CYCLES - 1) {
      // 45-90s between buys (look organic)
      const delay = 45000 + Math.random() * 45000;
      console.log(`  Next buy in ${(delay / 1000).toFixed(0)}s...\n`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  // Final P&L
  const endBalance = await getFleetBalance();
  console.log("\n=== Session Summary ===");
  console.log(`Buys: ${totalBuys}`);
  console.log(`Total spent: ${totalSpent.toFixed(4)} SOL`);
  console.log(`Est. fees paid: ${totalFeesEstimated.toFixed(4)} SOL`);
  console.log(`Fleet SOL: ${startBalance.toFixed(4)} → ${endBalance.toFixed(4)} (Δ ${(endBalance - startBalance).toFixed(4)})`);
  console.log(`Net SOL change: ${(endBalance - startBalance).toFixed(4)} SOL`);
  console.log(`Tokens held: check with sell-all.mjs or check-mcaps.mjs`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
