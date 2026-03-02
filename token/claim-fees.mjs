import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";

const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const results = JSON.parse(fs.readFileSync("mass-launch-results.json", "utf8"));
const tokens = results.filter(t => t.mint);

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(`${FLEET_DIR}/wallet-${num}.json`, "utf8"))));
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

console.log("=== Fee Claim Round ===\n");
let claimed = 0;
for (const t of tokens) {
  const sig = await claimFees(t.wallet, t.mint);
  if (sig) {
    console.log(`${t.symbol.padEnd(8)} wallet-${t.wallet}: ${sig.slice(0, 25)}...`);
    claimed++;
  } else {
    console.log(`${t.symbol.padEnd(8)} wallet-${t.wallet}: no fees`);
  }
  await new Promise(r => setTimeout(r, 1500));
}
console.log(`\n${claimed}/${tokens.length} tokens claimed`);
