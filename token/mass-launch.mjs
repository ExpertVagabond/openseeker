import { Connection, Keypair, SystemProgram, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const BURNER_PATH = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/openseeker-burner.json";
const IMAGES_DIR = path.join(__dirname, "images");
const TARGET_BAL = 0.2;
const BUY_AMOUNT = 0.1;

const conn = new Connection(RPC_URL, "confirmed");

// 10 unique AI agent themed tokens with custom images
const TOKENS = [
  { name: "SeekBot", symbol: "SEEKBOT", image: "seekbot.png", desc: "Autonomous trading bot for Solana Seeker. Executes Jupiter swaps, monitors DeFi positions, and manages portfolio from your pocket." },
  { name: "AgentVault", symbol: "AVAULT", image: "agentvault.png", desc: "Secure AI vault agent with hardware-backed key storage. Air-gapped transaction signing meets mobile convenience." },
  { name: "NeuralSwap", symbol: "NSWAP", image: "neuralswap.png", desc: "Neural network powered swap optimizer. Finds best routes across DEXs using on-device ML inference on Seeker hardware." },
  { name: "PhoneChain", symbol: "PCHAIN", image: "phonechain.png", desc: "Mobile-first blockchain agent. Full node validation, transaction relay, and consensus participation from Solana Seeker." },
  { name: "SeedGuard", symbol: "SEEDG", image: "seedguard.png", desc: "Seed Vault security agent. Monitors wallet activity, flags suspicious transactions, and enforces spending policies on-device." },
  { name: "SkillNet", symbol: "SKNET", image: "skillnet.png", desc: "Modular AI skill marketplace for mobile agents. 42+ composable skills from DeFi to social to analytics." },
  { name: "MobileDAO", symbol: "MDAO", image: "mobiledao.png", desc: "Governance agent for mobile-native DAOs. Vote, propose, and delegate from your Seeker phone with biometric auth." },
  { name: "TeleRelay", symbol: "TRELAY", image: "telerelay.png", desc: "Telegram relay agent bridging mobile AI to messaging. Natural language commands for swaps, transfers, and monitoring." },
  { name: "ColdSign", symbol: "CSIGN", image: "coldsign.png", desc: "Cold signing protocol for mobile transactions. Hardware isolation meets instant execution on Solana Seeker." },
  { name: "SwarmNode", symbol: "SWARM", image: "swarmnode.png", desc: "Distributed AI swarm node running on Seeker hardware. Coordinated multi-agent intelligence across mobile devices." },
];

function loadWallet(fp) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(fp, "utf8"))));
}

async function topUpWallet(burner, target, amount) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: burner.publicKey,
      toPubkey: target.publicKey,
      lamports: Math.floor(amount * LAMPORTS_PER_SOL),
    })
  );
  tx.feePayer = burner.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(burner);
  return conn.sendRawTransaction(tx.serialize());
}

async function uploadMetadata(token) {
  const imagePath = path.join(IMAGES_DIR, token.image);
  const formData = new FormData();
  formData.append("file", new Blob([fs.readFileSync(imagePath)]), token.image);
  formData.append("name", token.name);
  formData.append("symbol", token.symbol);
  formData.append("description", token.desc + " Part of the OpenSeeker agent fleet. https://openseeker.pages.dev");
  formData.append("twitter", "https://x.com/squirrel_eth");
  formData.append("website", "https://openseeker.pages.dev");
  formData.append("showName", "true");

  const resp = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: formData });
  if (!resp.ok) throw new Error(`IPFS failed: ${resp.status}`);
  const data = await resp.json();
  return data.metadataUri;
}

async function launchToken(wallet, token, metadataUri) {
  const mintKeypair = Keypair.generate();

  // Create token
  const createResp = await fetch("https://pumpdev.io/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "create",
      tokenMetadata: { name: token.name, symbol: token.symbol, uri: metadataUri },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: 0,
      slippage: 10,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (createResp.status !== 200) {
    throw new Error(`Create API ${createResp.status}: ${await createResp.text()}`);
  }

  const createTx = VersionedTransaction.deserialize(new Uint8Array(await createResp.arrayBuffer()));
  createTx.sign([mintKeypair, wallet]);
  const createSig = await conn.sendRawTransaction(createTx.serialize(), { skipPreflight: false, maxRetries: 3 });

  // Wait for confirmation
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: createSig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });

  return { mint: mintKeypair.publicKey.toBase58(), sig: createSig };
}

async function buyToken(wallet, mint, amount) {
  const resp = await fetch("https://pumpdev.io/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "buy",
      mint,
      denominatedInSol: "true",
      amount,
      slippage: 25,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (resp.status !== 200) throw new Error(`Buy API ${resp.status}`);
  const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
  tx.sign([wallet]);
  return conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
}

async function main() {
  console.log("=== Mass Token Launch ===\n");
  console.log("Launching 10 unique tokens from 10 fleet wallets\n");

  const burner = loadWallet(BURNER_PATH);
  const results = [];

  // Phase 1: Top up wallets
  console.log("[Phase 1] Topping up wallets to 0.2 SOL each...\n");
  for (let i = 1; i <= 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i}.json`);
    const wallet = loadWallet(fp);
    const bal = await conn.getBalance(wallet.publicKey);
    const needed = TARGET_BAL - (bal / LAMPORTS_PER_SOL);

    if (needed > 0.01) {
      const sig = await topUpWallet(burner, wallet, needed);
      console.log(`  wallet-${i}: topped up +${needed.toFixed(4)} SOL — ${sig.slice(0, 20)}...`);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      console.log(`  wallet-${i}: already has ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
    }
  }

  console.log("\n  Waiting 5s for confirmations...\n");
  await new Promise(r => setTimeout(r, 5000));

  // Phase 2: Upload metadata for all 10 tokens
  console.log("[Phase 2] Uploading metadata to IPFS...\n");
  const metadataUris = [];
  for (let i = 0; i < 10; i++) {
    const uri = await uploadMetadata(TOKENS[i]);
    metadataUris.push(uri);
    console.log(`  ${TOKENS[i].symbol}: ${uri}`);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Phase 3: Launch tokens
  console.log("\n[Phase 3] Launching tokens...\n");
  for (let i = 0; i < 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i + 1}.json`);
    const wallet = loadWallet(fp);

    try {
      console.log(`  wallet-${i + 1}: Creating ${TOKENS[i].name} ($${TOKENS[i].symbol})...`);
      const { mint, sig } = await launchToken(wallet, TOKENS[i], metadataUris[i]);
      console.log(`    CREATED! Mint: ${mint}`);
      console.log(`    https://pump.fun/coin/${mint}`);
      results.push({ wallet: i + 1, ...TOKENS[i], mint, createSig: sig });
    } catch (e) {
      console.log(`    FAILED: ${e.message.slice(0, 80)}`);
      results.push({ wallet: i + 1, ...TOKENS[i], mint: null, error: e.message });
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  // Phase 4: Buy 0.1 SOL on each launched token
  console.log("\n[Phase 4] Buying 0.1 SOL on each token...\n");
  for (const r of results) {
    if (!r.mint) { console.log(`  ${r.symbol}: skipped (no mint)`); continue; }

    const fp = path.join(FLEET_DIR, `wallet-${r.wallet}.json`);
    const wallet = loadWallet(fp);

    try {
      const sig = await buyToken(wallet, r.mint, BUY_AMOUNT);
      console.log(`  ${r.symbol}: bought ${BUY_AMOUNT} SOL — ${sig.slice(0, 20)}...`);
      r.buySig = sig;
    } catch (e) {
      console.log(`  ${r.symbol}: buy failed — ${e.message.slice(0, 60)}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  console.log("\n=== LAUNCH COMPLETE ===\n");
  const successCount = results.filter(r => r.mint).length;
  console.log(`${successCount}/10 tokens launched successfully\n`);

  for (const r of results) {
    if (r.mint) {
      console.log(`${r.name} ($${r.symbol})`);
      console.log(`  Mint: ${r.mint}`);
      console.log(`  Pump: https://pump.fun/coin/${r.mint}`);
      console.log();
    }
  }

  fs.writeFileSync(path.join(__dirname, "mass-launch-results.json"), JSON.stringify(results, null, 2));
  console.log("Results saved to token/mass-launch-results.json");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
