import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const BUY_AMOUNT = parseFloat(process.env.BUY_SOL || "0.05");
const SLIPPAGE = 25;

const conn = new Connection(RPC_URL, "confirmed");
const results = JSON.parse(fs.readFileSync(path.join(__dirname, "mass-launch-results.json"), "utf8"));

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(path.join(FLEET_DIR, `wallet-${num}.json`), "utf8"))));
}

async function buyToken(walletNum, mint, symbol) {
  const wallet = loadWallet(walletNum);
  const bal = await conn.getBalance(wallet.publicKey);
  const solBal = bal / LAMPORTS_PER_SOL;

  if (solBal < BUY_AMOUNT + 0.005) {
    console.log(`  wallet-${walletNum} (${symbol}): Skip — only ${solBal.toFixed(4)} SOL`);
    return null;
  }

  try {
    const resp = await fetch("https://pumpdev.io/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "buy",
        mint,
        denominatedInSol: "true",
        amount: BUY_AMOUNT,
        slippage: SLIPPAGE,
        priorityFee: 0.0005,
        pool: "pump",
      }),
    });
    if (resp.status !== 200) {
      console.log(`  wallet-${walletNum} (${symbol}): API error ${resp.status}`);
      return null;
    }
    const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
    tx.sign([wallet]);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
    console.log(`  wallet-${walletNum} (${symbol}): Bought ${BUY_AMOUNT} SOL — ${sig.slice(0, 25)}...`);
    return sig;
  } catch (e) {
    console.log(`  wallet-${walletNum} (${symbol}): Error — ${e.message.slice(0, 50)}`);
    return null;
  }
}

console.log(`=== Rebuy All Fleet Tokens ===\n`);
console.log(`Buy amount: ${BUY_AMOUNT} SOL per token\n`);

let success = 0;
for (const r of results) {
  if (!r.mint) continue;
  const sig = await buyToken(r.wallet, r.mint, r.symbol);
  if (sig) success++;
  await new Promise(r => setTimeout(r, 2000));
}

console.log(`\nDone: ${success}/10 tokens rebought`);
