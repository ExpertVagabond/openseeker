import { Connection, Keypair, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createCloseAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";

const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const delay = ms => new Promise(r => setTimeout(r, ms));

function loadWallet(num) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(`${FLEET_DIR}/wallet-${num}.json`, "utf8"))));
}

async function processWallet(walletNum) {
  const wallet = loadWallet(walletNum);

  let accounts;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      accounts = await conn.getParsedTokenAccountsByOwner(wallet.publicKey, { programId: TOKEN_PROGRAM_ID });
      break;
    } catch (e) {
      if (attempt < 2) { await delay(5000 * (attempt + 1)); continue; }
      console.log(`  wallet-${walletNum}: RPC error, skipping`);
      return { closed: 0, rent: 0 };
    }
  }

  const empty = accounts.value.filter(a => {
    const amount = a.account.data.parsed.info.tokenAmount.uiAmount;
    return amount === 0 || amount === null;
  });

  if (empty.length === 0) {
    console.log(`  wallet-${walletNum}: no empty accounts`);
    return { closed: 0, rent: 0 };
  }

  console.log(`  wallet-${walletNum}: ${empty.length} empty accounts (~${(empty.length * 0.00203).toFixed(4)} SOL)`);

  let closed = 0;
  let rentRecovered = 0;

  // Batch up to 8 close instructions per tx
  for (let i = 0; i < empty.length; i += 8) {
    const batch = empty.slice(i, i + 8);
    const tx = new Transaction();

    for (const acct of batch) {
      tx.add(createCloseAccountInstruction(
        acct.pubkey, wallet.publicKey, wallet.publicKey, [], TOKEN_PROGRAM_ID
      ));
      rentRecovered += acct.account.lamports / LAMPORTS_PER_SOL;
    }

    try {
      await delay(2000);
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;
      tx.sign(wallet);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
      closed += batch.length;
      console.log(`    closed ${batch.length} (${sig.slice(0, 25)}...)`);
    } catch (e) {
      console.log(`    batch failed: ${e.message.slice(0, 50)}`);
    }
    await delay(2000);
  }

  return { closed, rent: rentRecovered };
}

async function main() {
  console.log("=== Closing Empty Token Accounts ===\n");

  let totalClosed = 0;
  let totalRent = 0;

  for (let i = 1; i <= 10; i++) {
    const { closed, rent } = await processWallet(i);
    totalClosed += closed;
    totalRent += rent;
    await delay(4000);
  }

  console.log(`\n=== Closed ${totalClosed} accounts, recovered ~${totalRent.toFixed(4)} SOL ===`);

  await delay(3000);
  console.log("\nPost-close balances:");
  let total = 0;
  for (let i = 1; i <= 10; i++) {
    try {
      const w = loadWallet(i);
      const bal = await conn.getBalance(w.publicKey);
      const sol = bal / LAMPORTS_PER_SOL;
      total += sol;
      console.log(`  wallet-${i}: ${sol.toFixed(4)} SOL`);
    } catch { console.log(`  wallet-${i}: RPC error`); }
    await delay(1500);
  }
  console.log(`\n  Fleet total: ${total.toFixed(4)} SOL`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
