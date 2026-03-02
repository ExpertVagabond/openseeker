import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const results = JSON.parse(fs.readFileSync("mass-launch-results.json", "utf8"));
const tokens = results.filter(t => t.mint);

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(`${FLEET_DIR}/wallet-${num}.json`, "utf8"))));
}

async function sellAll(walletNum, mint) {
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
        slippage: 30,
        priorityFee: 0.001,
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
  } catch {
    return null;
  }
}

console.log("=== Sell All Round — 100% from every wallet ===\n");

// Phase 1: Sell from each token's creator wallet
console.log("[Phase 1] Creator wallets:\n");
for (const t of tokens) {
  const sig = await sellAll(t.wallet, t.mint);
  if (sig) {
    console.log(`  ${t.symbol.padEnd(8)} wallet-${t.wallet}: SOLD ${sig.slice(0, 25)}...`);
  } else {
    console.log(`  ${t.symbol.padEnd(8)} wallet-${t.wallet}: no tokens`);
  }
  await new Promise(r => setTimeout(r, 1500));
}

// Phase 2: Sell from all other wallets (volume bot distributed tokens)
console.log("\n[Phase 2] Cross-wallet sells:\n");
let crossSells = 0;
for (const t of tokens) {
  for (let w = 1; w <= 10; w++) {
    if (w === t.wallet) continue;
    const sig = await sellAll(w, t.mint);
    if (sig) {
      console.log(`  ${t.symbol.padEnd(8)} wallet-${w}: SOLD ${sig.slice(0, 25)}...`);
      crossSells++;
    }
    await new Promise(r => setTimeout(r, 500));
  }
}
console.log(`\n  ${crossSells} cross-wallet sells\n`);

// Phase 3: Final balances
console.log("[Phase 3] Post-sell balances:\n");
let totalSol = 0;
for (let i = 1; i <= 10; i++) {
  const wallet = loadWallet(i);
  const bal = await conn.getBalance(wallet.publicKey);
  const sol = bal / LAMPORTS_PER_SOL;
  totalSol += sol;
  console.log(`  wallet-${i}: ${sol.toFixed(4)} SOL`);
  await new Promise(r => setTimeout(r, 200));
}
console.log(`\n  Total fleet SOL: ${totalSol.toFixed(4)}`);
