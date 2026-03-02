import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";

const RPC_URL = "https://api.mainnet-beta.solana.com";
const WALLET_PATH = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/luna-wallet.json";
const LOGO_PATH = "/Volumes/Virtual Server/projects/tuluminati-vapi/luna-token.png";
const BUY_SOL = 1;

const APIS = [
  "https://pumpportal.fun/api/trade-local",
  "https://pumpdev.io/api/trade-local",
];

async function tryCreate(wallet, mintKeypair, metadataUri) {
  const payload = {
    publicKey: wallet.publicKey.toBase58(),
    action: "create",
    tokenMetadata: { name: "Luna AI", symbol: "LUNA", uri: metadataUri },
    mint: mintKeypair.publicKey.toBase58(),
    denominatedInSol: "true",
    amount: 0,
    slippage: 10,
    priorityFee: 0.0005,
    pool: "pump",
  };

  for (const api of APIS) {
    console.log(`  Trying ${api.split("//")[1].split("/")[0]}...`);
    try {
      const resp = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status === 200) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 0) {
          console.log(`  OK from ${api.split("//")[1].split("/")[0]}`);
          return { buf, api };
        }
      }
      console.log(`  ${resp.status}: ${(await resp.text()).slice(0, 80)}`);
    } catch (e) {
      console.log(`  Error: ${e.message.slice(0, 60)}`);
    }
  }
  return null;
}

async function tryBuy(wallet, mint, amount) {
  const payload = {
    publicKey: wallet.publicKey.toBase58(),
    action: "buy",
    mint,
    denominatedInSol: "true",
    amount,
    slippage: 25,
    priorityFee: 0.001,
    pool: "pump",
  };

  for (const api of APIS) {
    try {
      const resp = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (resp.status === 200) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 0) return buf;
      }
    } catch {}
  }
  return null;
}

async function main() {
  console.log("=== Luna AI Token Launch ===\n");

  const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"))));
  const mintKeypair = Keypair.generate();
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Mint:", mintKeypair.publicKey.toBase58());

  // Step 1: Upload metadata
  console.log("\n[1/4] Uploading metadata to IPFS...");
  const formData = new FormData();
  formData.append("file", new Blob([fs.readFileSync(LOGO_PATH)]), "luna-token.png");
  formData.append("name", "Luna AI");
  formData.append("symbol", "LUNA");
  formData.append("description", "Luna is an AI real estate agent for the Riviera Maya. She handles property matching, investment analysis, market comparisons, showing scheduling, and cross-border buying guidance — 24/7 in English and Spanish. Powered by voice AI with deep knowledge of Tulum, Playa del Carmen, Puerto Morelos, Cancun, and the entire Riviera Maya coast. Now accepting property listings for rental and sale. Talk to Luna at tuluminatirealestate.com");
  formData.append("twitter", "https://x.com/squirrel_eth");
  formData.append("website", "https://tuluminatirealestate.com");
  formData.append("showName", "true");

  const ipfsResp = await fetch("https://pump.fun/api/ipfs", { method: "POST", body: formData });
  if (!ipfsResp.ok) throw new Error(`IPFS upload failed (${ipfsResp.status}): ${await ipfsResp.text()}`);
  const ipfsData = await ipfsResp.json();
  console.log("IPFS URI:", ipfsData.metadataUri);

  // Step 2: Create token
  console.log("\n[2/4] Creating token...");
  const createResult = await tryCreate(wallet, mintKeypair, ipfsData.metadataUri);
  if (!createResult) throw new Error("All create APIs failed");

  // Step 3: Sign and send
  console.log("\n[3/4] Signing and sending...");
  const createTx = VersionedTransaction.deserialize(new Uint8Array(createResult.buf));
  createTx.sign([mintKeypair, wallet]);

  const createSig = await connection.sendRawTransaction(createTx.serialize(), { skipPreflight: false, maxRetries: 3 });
  console.log("Create TX:", createSig);
  console.log("Confirming...");

  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: createSig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });

  console.log("Token CREATED!");
  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log(`Pump.fun: https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);

  // Step 4: Initial buy
  console.log(`\n[4/4] Buying ${BUY_SOL} SOL worth of $LUNA...`);
  await new Promise(r => setTimeout(r, 3000));

  const buyBuf = await tryBuy(wallet, mintKeypair.publicKey.toBase58(), BUY_SOL);
  if (!buyBuf) {
    console.log("Buy failed on all APIs. Buy manually at:");
    console.log(`https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);
  } else {
    const buyTx = VersionedTransaction.deserialize(new Uint8Array(buyBuf));
    buyTx.sign([wallet]);
    const buySig = await connection.sendRawTransaction(buyTx.serialize(), { skipPreflight: false, maxRetries: 3 });
    console.log("Buy TX:", buySig);
    const bh2 = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: buySig, blockhash: bh2.blockhash, lastValidBlockHeight: bh2.lastValidBlockHeight });
    console.log(`Bought ${BUY_SOL} SOL worth of $LUNA!`);
  }

  // Save
  console.log("\n=== LAUNCH COMPLETE ===");
  console.log("Token: Luna AI ($LUNA)");
  console.log("Mint:", mintKeypair.publicKey.toBase58());
  console.log(`Pump.fun: https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`);

  fs.writeFileSync("luna-launch-result.json", JSON.stringify({
    token: "Luna AI", symbol: "LUNA",
    mint: mintKeypair.publicKey.toBase58(),
    createSignature: createSig,
    metadataUri: ipfsData.metadataUri,
    wallet: wallet.publicKey.toBase58(),
    buyAmount: BUY_SOL + " SOL",
    launchedAt: new Date().toISOString(),
    pumpFunUrl: `https://pump.fun/coin/${mintKeypair.publicKey.toBase58()}`,
  }, null, 2));
  console.log("Results saved to luna-launch-result.json");
}

main().catch(err => { console.error("LAUNCH FAILED:", err.message); process.exit(1); });
