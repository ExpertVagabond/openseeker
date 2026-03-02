import { Connection, Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const BURNER_PATH = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/openseeker-burner.json";

function loadWallet(filePath) {
  const secret = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(new Uint8Array(secret));
}

function loadFleet() {
  const wallets = [];
  for (let i = 1; i <= 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i}.json`);
    if (fs.existsSync(fp)) {
      wallets.push({ id: i, keypair: loadWallet(fp) });
    }
  }
  return wallets;
}

const conn = new Connection(RPC_URL, "confirmed");

// --- COMMANDS ---

async function balances() {
  console.log("=== Fleet Wallet Balances ===\n");
  const fleet = loadFleet();
  const burner = loadWallet(BURNER_PATH);

  const burnerBal = await conn.getBalance(burner.publicKey);
  console.log(`BURNER: ${burner.publicKey.toBase58()}  ${(burnerBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  console.log("---");

  let total = burnerBal;
  for (const w of fleet) {
    const bal = await conn.getBalance(w.keypair.publicKey);
    total += bal;
    console.log(`wallet-${w.id}: ${w.keypair.publicKey.toBase58()}  ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  }
  console.log(`\nTotal fleet: ${(total / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
}

async function distribute(totalSol) {
  console.log(`=== Distributing ${totalSol} SOL across fleet ===\n`);
  const burner = loadWallet(BURNER_PATH);
  const fleet = loadFleet();
  const perWallet = Math.floor((totalSol * LAMPORTS_PER_SOL) / fleet.length);

  const burnerBal = await conn.getBalance(burner.publicKey);
  const needed = perWallet * fleet.length + 50000; // + fees
  if (burnerBal < needed) {
    console.error(`Insufficient balance. Have ${burnerBal / LAMPORTS_PER_SOL} SOL, need ~${needed / LAMPORTS_PER_SOL} SOL`);
    return;
  }

  for (const w of fleet) {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: burner.publicKey,
        toPubkey: w.keypair.publicKey,
        lamports: perWallet,
      })
    );
    tx.feePayer = burner.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(burner);

    const sig = await conn.sendRawTransaction(tx.serialize());
    console.log(`wallet-${w.id}: sent ${(perWallet / LAMPORTS_PER_SOL).toFixed(6)} SOL — ${sig}`);
  }
  console.log("\nDone. Run 'balances' to verify.");
}

async function collect() {
  console.log("=== Collecting all SOL back to burner ===\n");
  const burner = loadWallet(BURNER_PATH);
  const fleet = loadFleet();

  for (const w of fleet) {
    const bal = await conn.getBalance(w.keypair.publicKey);
    if (bal <= 5000) {
      console.log(`wallet-${w.id}: empty, skipping`);
      continue;
    }
    const sendAmount = bal - 5000; // leave rent
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: w.keypair.publicKey,
        toPubkey: burner.publicKey,
        lamports: sendAmount,
      })
    );
    tx.feePayer = w.keypair.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(w.keypair);

    const sig = await conn.sendRawTransaction(tx.serialize());
    console.log(`wallet-${w.id}: collected ${(sendAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL — ${sig}`);
  }
  console.log("\nDone.");
}

async function buyAll(mint, solPerWallet, slippage = 25) {
  console.log(`=== Fleet buy: ${solPerWallet} SOL each into ${mint} ===\n`);
  const fleet = loadFleet();

  for (const w of fleet) {
    const bal = await conn.getBalance(w.keypair.publicKey);
    if (bal / LAMPORTS_PER_SOL < solPerWallet + 0.002) {
      console.log(`wallet-${w.id}: insufficient balance (${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL), skipping`);
      continue;
    }

    try {
      const resp = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: w.keypair.publicKey.toBase58(),
          action: "buy",
          mint,
          denominatedInSol: "true",
          amount: solPerWallet,
          slippage,
          priorityFee: 0.0005,
          pool: "pump",
        }),
      });

      if (resp.status !== 200) {
        console.log(`wallet-${w.id}: API error ${resp.status}`);
        continue;
      }

      const txData = await resp.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([w.keypair]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      console.log(`wallet-${w.id}: bought ${solPerWallet} SOL worth — ${sig}`);
    } catch (e) {
      console.log(`wallet-${w.id}: error — ${e.message}`);
    }

    // Small delay between buys
    await new Promise(r => setTimeout(r, 500));
  }
  console.log("\nDone.");
}

async function sellAll(mint, slippage = 25) {
  console.log(`=== Fleet sell: dumping all ${mint} ===\n`);
  const fleet = loadFleet();

  for (const w of fleet) {
    try {
      const resp = await fetch("https://pumpportal.fun/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: w.keypair.publicKey.toBase58(),
          action: "sell",
          mint,
          denominatedInSol: "false",
          amount: "100%",
          slippage,
          priorityFee: 0.0005,
          pool: "pump",
        }),
      });

      if (resp.status !== 200) {
        console.log(`wallet-${w.id}: no position or API error`);
        continue;
      }

      const txData = await resp.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
      tx.sign([w.keypair]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      console.log(`wallet-${w.id}: sold all — ${sig}`);
    } catch (e) {
      console.log(`wallet-${w.id}: error — ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 500));
  }
  console.log("\nDone.");
}

async function exportAll() {
  console.log("=== Fleet Wallet Export ===\n");
  const fleet = loadFleet();
  const burner = loadWallet(BURNER_PATH);

  const bs58chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function toBase58(bytes) {
    let num = BigInt(0);
    for (const b of bytes) num = num * 256n + BigInt(b);
    let encoded = "";
    while (num > 0n) { encoded = bs58chars[Number(num % 58n)] + encoded; num = num / 58n; }
    for (const b of bytes) { if (b === 0) encoded = "1" + encoded; else break; }
    return encoded;
  }

  let output = "OpenSeeker Fleet Wallets\n========================\n\n";
  output += `BURNER: ${burner.publicKey.toBase58()}\nPrivate: ${toBase58(Array.from(burner.secretKey))}\n\n`;

  for (const w of fleet) {
    output += `wallet-${w.id}: ${w.keypair.publicKey.toBase58()}\nPrivate: ${toBase58(Array.from(w.keypair.secretKey))}\n\n`;
  }

  output += "DELETE THIS FILE AFTER IMPORTING\n";
  const outPath = "/Users/matthewkarsten/Desktop/openseeker-fleet-keys.txt";
  fs.writeFileSync(outPath, output);
  console.log(`Exported to ${outPath}`);
}

// --- CLI ---
const cmd = process.argv[2];
const args = process.argv.slice(3);

switch (cmd) {
  case "balances":
    await balances();
    break;
  case "distribute":
    await distribute(parseFloat(args[0] || "0"));
    break;
  case "collect":
    await collect();
    break;
  case "buy":
    await buyAll(args[0], parseFloat(args[1] || "0.1"), parseInt(args[2] || "25"));
    break;
  case "sell":
    await sellAll(args[0], parseInt(args[1] || "25"));
    break;
  case "export":
    await exportAll();
    break;
  default:
    console.log(`
OpenSeeker Fleet Manager
========================

Usage: node fleet.mjs <command> [args]

Commands:
  balances                         Show all wallet balances
  distribute <totalSOL>            Split SOL from burner across 10 wallets
  collect                          Sweep all SOL back to burner
  buy <mint> <solPerWallet> [slip]  Buy on pump.fun from all wallets
  sell <mint> [slippage]           Sell 100% from all wallets
  export                          Export all private keys to Desktop

Examples:
  node fleet.mjs balances
  node fleet.mjs distribute 1.0
  node fleet.mjs buy H8oBZ3Fa6WJjpxeEwCr4gRP3SF96B1s3b49knipohRqt 0.1
  node fleet.mjs sell H8oBZ3Fa6WJjpxeEwCr4gRP3SF96B1s3b49knipohRqt
  node fleet.mjs collect
`);
}
