import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Config
const RPC_URL = "https://api.mainnet-beta.solana.com";
const KEYPAIR_PATH = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/openseeker-burner.json";
const LOGO_PATH = path.join(__dirname, "logo.png");
const BUY_SOL = 1; // Buy 1 SOL worth after launch

async function main() {
  console.log("=== OpenSeeker $SEEK Token Launch ===\n");

  // Load wallet
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"));
  const wallet = Keypair.fromSecretKey(new Uint8Array(secret));
  console.log("Wallet:", wallet.publicKey.toBase58());

  // Generate mint keypair
  const mintKeypair = Keypair.generate();
  console.log("Mint:", mintKeypair.publicKey.toBase58());

  const connection = new Connection(RPC_URL, "confirmed");

  // Step 1: Upload metadata to IPFS via pump.fun
  console.log("\n[1/4] Uploading metadata to IPFS...");
  const formData = new FormData();
  formData.append("file", new Blob([fs.readFileSync(LOGO_PATH)]), "logo.png");
  formData.append("name", "OpenSeeker");
  formData.append("symbol", "SEEK");
  formData.append("description", "The AI Agent Layer for Solana Seeker. Autonomous AI agent running natively on the Solana Seeker phone with Seed Vault wallet access, Jupiter swaps, Telegram relay, cold signing security, and 42+ modular skills. Built by Purple Squirrel Media. https://openseeker.pages.dev");
  formData.append("twitter", "https://x.com/squirrel_eth");
  formData.append("website", "https://openseeker.pages.dev");
  formData.append("showName", "true");

  const ipfsResp = await fetch("https://pump.fun/api/ipfs", {
    method: "POST",
    body: formData,
  });

  if (!ipfsResp.ok) {
    const errText = await ipfsResp.text();
    throw new Error(`IPFS upload failed (${ipfsResp.status}): ${errText}`);
  }

  const ipfsData = await ipfsResp.json();
  console.log("IPFS URI:", ipfsData.metadataUri);

  // Step 2: Create token (no dev buy - separate step)
  console.log("\n[2/4] Creating token on pump.fun...");
  const createResp = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "create",
      tokenMetadata: {
        name: "OpenSeeker",
        symbol: "SEEK",
        uri: ipfsData.metadataUri,
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: 0,
      slippage: 10,
      priorityFee: 0.0005,
      pool: "pump",
    }),
  });

  if (createResp.status !== 200) {
    const errText = await createResp.text();
    throw new Error(`Create API failed (${createResp.status}): ${errText}`);
  }

  // Sign and send create tx
  console.log("\n[3/4] Signing and sending create transaction...");
  const createTxData = await createResp.arrayBuffer();
  const createTx = VersionedTransaction.deserialize(new Uint8Array(createTxData));
  createTx.sign([mintKeypair, wallet]);

  const createSig = await connection.sendRawTransaction(createTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });

  console.log("Create TX:", createSig);
  console.log("Waiting for confirmation...");

  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature: createSig,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  });

  console.log("Token CREATED successfully!");
  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log("Pump.fun:", `https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);

  // Step 4: Buy 1 SOL worth
  console.log(`\n[4/4] Buying ${BUY_SOL} SOL worth of $SEEK...`);

  // Small delay to let the token propagate
  await new Promise(r => setTimeout(r, 3000));

  const buyResp = await fetch("https://pumpportal.fun/api/trade-local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "buy",
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: "true",
      amount: BUY_SOL,
      slippage: 25,
      priorityFee: 0.001,
      pool: "pump",
    }),
  });

  if (buyResp.status !== 200) {
    const errText = await buyResp.text();
    console.error(`Buy failed (${buyResp.status}): ${errText}`);
    console.log("\nToken was created but buy failed. You can buy manually at:");
    console.log(`https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);
  } else {
    const buyTxData = await buyResp.arrayBuffer();
    const buyTx = VersionedTransaction.deserialize(new Uint8Array(buyTxData));
    buyTx.sign([wallet]);

    const buySig = await connection.sendRawTransaction(buyTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log("Buy TX:", buySig);

    const buyBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: buySig,
      blockhash: buyBlockhash.blockhash,
      lastValidBlockHeight: buyBlockhash.lastValidBlockHeight,
    });

    console.log("Buy confirmed! Purchased", BUY_SOL, "SOL worth of $SEEK");
  }

  // Save results
  console.log("\n=== LAUNCH COMPLETE ===");
  console.log("Token: OpenSeeker ($SEEK)");
  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log("Create TX:", createSig);
  console.log("Pump.fun:", `https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);
  console.log("Solscan:", `https://solscan.io/tx/${createSig}`);

  const results = {
    token: "OpenSeeker",
    symbol: "SEEK",
    mint: mintKeypair.publicKey.toBase58(),
    createSignature: createSig,
    metadataUri: ipfsData.metadataUri,
    wallet: wallet.publicKey.toBase58(),
    buyAmount: BUY_SOL + " SOL",
    launchedAt: new Date().toISOString(),
    pumpFunUrl: `https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`,
    solscanUrl: `https://solscan.io/tx/${createSig}`,
  };
  fs.writeFileSync(path.join(__dirname, "launch-result.json"), JSON.stringify(results, null, 2));
  console.log("\nResults saved to token/launch-result.json");
}

main().catch((err) => {
  console.error("LAUNCH FAILED:", err.message);
  process.exit(1);
});
