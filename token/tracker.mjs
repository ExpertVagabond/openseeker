import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";

const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const BURNER_PATH = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/openseeker-burner.json";
const SEEK_MINT = "H8oBZ3Fa6WJjpxeEwCr4gRP3SF96B1s3b49knipohRqt";
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const conn = new Connection(RPC_URL, "confirmed");

function loadWallet(fp) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(fp, "utf8"))));
}

function loadAllWallets() {
  const wallets = [];

  // Burner
  const burner = loadWallet(BURNER_PATH);
  wallets.push({ id: "BURNER", keypair: burner });

  // Fleet
  for (let i = 1; i <= 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i}.json`);
    if (fs.existsSync(fp)) wallets.push({ id: `wallet-${i}`, keypair: loadWallet(fp) });
  }
  return wallets;
}

async function getTokenBalance(owner, mint) {
  try {
    const accounts = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) });
    if (accounts.value.length === 0) return 0;
    return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
  } catch {
    return 0;
  }
}

async function getTokenPrice(mint) {
  // Use Jupiter price API
  try {
    const resp = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    const data = await resp.json();
    return parseFloat(data.data?.[mint]?.price || "0");
  } catch {
    return 0;
  }
}

async function trackPortfolio() {
  console.log("=== OpenSeeker Fleet Tracker ===\n");
  console.log(`Token: $SEEK (${SEEK_MINT.slice(0, 8)}...)`);
  console.log(`Time: ${new Date().toLocaleString()}\n`);

  const wallets = loadAllWallets();
  const price = await getTokenPrice(SEEK_MINT);
  console.log(`$SEEK Price: $${price > 0 ? price.toFixed(8) : "N/A"}\n`);

  console.log("┌─────────────┬──────────────────────────────────────────────┬────────────┬──────────────────┬────────────────┐");
  console.log("│ Wallet      │ Address                                      │ SOL        │ $SEEK Tokens     │ Token Value    │");
  console.log("├─────────────┼──────────────────────────────────────────────┼────────────┼──────────────────┼────────────────┤");

  let totalSol = 0;
  let totalTokens = 0;
  let totalTokenValue = 0;

  for (const w of wallets) {
    const sol = await conn.getBalance(w.keypair.publicKey);
    const solAmount = sol / LAMPORTS_PER_SOL;
    const tokens = await getTokenBalance(w.keypair.publicKey, SEEK_MINT);
    const tokenValue = tokens * price;

    totalSol += solAmount;
    totalTokens += tokens;
    totalTokenValue += tokenValue;

    const addr = w.keypair.publicKey.toBase58();
    console.log(
      `│ ${w.id.padEnd(11)} │ ${addr.padEnd(44)} │ ${solAmount.toFixed(4).padStart(10)} │ ${tokens.toFixed(0).padStart(16)} │ $${tokenValue.toFixed(4).padStart(13)} │`
    );

    await new Promise(r => setTimeout(r, 1500)); // rate limit
  }

  console.log("├─────────────┼──────────────────────────────────────────────┼────────────┼──────────────────┼────────────────┤");
  console.log(
    `│ TOTAL       │                                              │ ${totalSol.toFixed(4).padStart(10)} │ ${totalTokens.toFixed(0).padStart(16)} │ $${totalTokenValue.toFixed(4).padStart(13)} │`
  );
  console.log("└─────────────┴──────────────────────────────────────────────┴────────────┴──────────────────┴────────────────┘");

  const totalValue = totalSol * (await getSolPrice()) + totalTokenValue;
  console.log(`\nTotal Portfolio Value: ~$${totalValue.toFixed(2)}`);

  // Save snapshot
  const snapshot = {
    timestamp: new Date().toISOString(),
    seekPrice: price,
    totalSol,
    totalTokens,
    totalTokenValue,
    totalValueUsd: totalValue,
    wallets: wallets.map(w => ({
      id: w.id,
      address: w.keypair.publicKey.toBase58(),
    })),
  };
  const snapshotPath = path.join(FLEET_DIR, "snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

async function getSolPrice() {
  try {
    const resp = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112");
    const data = await resp.json();
    return parseFloat(data.data?.["So11111111111111111111111111111111111111112"]?.price || "140");
  } catch {
    return 140; // fallback
  }
}

// Watch mode - refresh every N seconds
const watchMode = process.argv.includes("--watch");
const interval = parseInt(process.env.REFRESH || "30");

if (watchMode) {
  const loop = async () => {
    console.clear();
    await trackPortfolio();
    console.log(`\nRefreshing every ${interval}s... (Ctrl+C to stop)`);
    setTimeout(loop, interval * 1000);
  };
  loop();
} else {
  trackPortfolio();
}
