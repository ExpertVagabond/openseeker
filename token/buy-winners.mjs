import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const results = JSON.parse(fs.readFileSync("mass-launch-results.json", "utf8"));

const WINNERS = ["TRELAY", "CSIGN", "SWARM"];
const tokens = results.filter(t => t.mint && WINNERS.includes(t.symbol));
const SLIPPAGE = 25;
const BUY_PER_TOKEN = parseFloat(process.env.BUY_AMOUNT || "0.25"); // SOL per token

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(`${FLEET_DIR}/wallet-${num}.json`, "utf8"))));
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
        priorityFee: 0.001,
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

// Find wallets with enough SOL, sorted by balance descending
async function getRankedWallets() {
  const wallets = [];
  for (let i = 1; i <= 10; i++) {
    const w = loadWallet(i);
    const bal = await conn.getBalance(w.publicKey);
    wallets.push({ id: i, sol: bal / LAMPORTS_PER_SOL });
    await new Promise(r => setTimeout(r, 200));
  }
  return wallets.sort((a, b) => b.sol - a.sol);
}

async function main() {
  console.log(`=== Buying Winners: ${WINNERS.join(", ")} ===\n`);
  console.log(`Target: ${BUY_PER_TOKEN} SOL per token (${BUY_PER_TOKEN * 3} SOL total)\n`);

  const wallets = await getRankedWallets();
  console.log("Wallet balances:");
  wallets.forEach(w => console.log(`  wallet-${w.id}: ${w.sol.toFixed(4)} SOL`));
  console.log("");

  let totalSpent = 0;

  for (const token of tokens) {
    console.log(`--- ${token.symbol} (${token.mint.slice(0, 12)}...) ---`);

    // Split the buy across multiple wallets for distribution (2-3 buys per token)
    let remaining = BUY_PER_TOKEN;
    let buyCount = 0;

    for (const w of wallets) {
      if (remaining <= 0.01) break;
      if (w.sol < 0.03) continue; // skip nearly empty wallets

      const buyAmount = Math.min(remaining, w.sol - 0.01, 0.15); // max 0.15 per wallet, keep 0.01 for fees
      if (buyAmount < 0.02) continue;

      console.log(`  wallet-${w.id}: BUY ${buyAmount.toFixed(3)} SOL`);
      const sig = await buyFromWallet(w.id, token.mint, buyAmount);
      if (sig) {
        console.log(`    OK: ${sig.slice(0, 30)}...`);
        totalSpent += buyAmount;
        remaining -= buyAmount;
        w.sol -= buyAmount + 0.002; // account for fees
        buyCount++;
      } else {
        console.log(`    FAILED`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`  ${buyCount} buys, ${(BUY_PER_TOKEN - remaining).toFixed(3)} SOL spent\n`);
  }

  console.log(`=== Total spent: ${totalSpent.toFixed(4)} SOL across 3 tokens ===`);

  // Show final balances
  console.log("\nPost-buy balances:");
  let finalTotal = 0;
  for (let i = 1; i <= 10; i++) {
    const w = loadWallet(i);
    const bal = await conn.getBalance(w.publicKey);
    const sol = bal / LAMPORTS_PER_SOL;
    finalTotal += sol;
    if (sol > 0.005) console.log(`  wallet-${i}: ${sol.toFixed(4)} SOL`);
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`\n  Fleet SOL remaining: ${finalTotal.toFixed(4)}`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
