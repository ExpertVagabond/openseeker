import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import WebSocket from "ws";
import fs from "fs";
import path from "path";

// === CONFIG ===
const RPC_URL = "https://api.mainnet-beta.solana.com";
const FLEET_DIR = "/Volumes/Virtual Server/configs/dotfiles/.solana-keys/fleet";
const BUY_SOL_PER_WALLET = parseFloat(process.env.BUY_SOL || "0.02");
const SLIPPAGE = parseInt(process.env.SLIPPAGE || "30");
const MAX_WALLETS = parseInt(process.env.MAX_WALLETS || "5"); // how many wallets to use per snipe
const MIN_DELAY_MS = 200;  // stagger between wallet buys
const COOLDOWN_MS = 30000; // 30s cooldown between snipes

// Filters
const BLOCK_KEYWORDS = (process.env.BLOCK_WORDS || "rug,scam,test,fuck,shit,nigger,fag").toLowerCase().split(",");
const REQUIRE_SOCIALS = process.env.REQUIRE_SOCIALS === "true"; // require twitter or website
const MIN_DEV_BUY_SOL = parseFloat(process.env.MIN_DEV_BUY || "0"); // min dev buy to consider

// === STATE ===
let lastSnipeTime = 0;
let totalSnipes = 0;
let activeTrades = [];
const conn = new Connection(RPC_URL, "confirmed");

function loadFleet() {
  const wallets = [];
  for (let i = 1; i <= 10; i++) {
    const fp = path.join(FLEET_DIR, `wallet-${i}.json`);
    if (fs.existsSync(fp)) {
      const secret = JSON.parse(fs.readFileSync(fp, "utf8"));
      wallets.push({ id: i, keypair: Keypair.fromSecretKey(new Uint8Array(secret)) });
    }
  }
  return wallets;
}

function passesFilter(token) {
  const name = (token.name || "").toLowerCase();
  const symbol = (token.symbol || "").toLowerCase();
  const desc = (token.description || "").toLowerCase();
  const combined = name + " " + symbol + " " + desc;

  // Block keywords
  for (const word of BLOCK_KEYWORDS) {
    if (word && combined.includes(word)) return false;
  }

  // Require socials
  if (REQUIRE_SOCIALS) {
    if (!token.twitter && !token.website) return false;
  }

  // Min dev buy
  if (MIN_DEV_BUY_SOL > 0 && (token.devBuySol || 0) < MIN_DEV_BUY_SOL) return false;

  return true;
}

async function snipeBuy(mint, wallets) {
  const results = [];
  const subset = wallets.slice(0, MAX_WALLETS);

  for (const w of subset) {
    try {
      const bal = await conn.getBalance(w.keypair.publicKey);
      if (bal / LAMPORTS_PER_SOL < BUY_SOL_PER_WALLET + 0.003) {
        console.log(`  wallet-${w.id}: skip (low bal ${(bal / LAMPORTS_PER_SOL).toFixed(4)})`);
        continue;
      }

      const resp = await fetch("https://pumpdev.io/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: w.keypair.publicKey.toBase58(),
          action: "buy",
          mint,
          denominatedInSol: "true",
          amount: BUY_SOL_PER_WALLET,
          slippage: SLIPPAGE,
          priorityFee: 0.001,
          pool: "pump",
        }),
      });

      if (resp.status !== 200) {
        console.log(`  wallet-${w.id}: API ${resp.status}`);
        continue;
      }

      const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
      tx.sign([w.keypair]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
      console.log(`  wallet-${w.id}: BOUGHT ${BUY_SOL_PER_WALLET} SOL — ${sig.slice(0, 20)}...`);
      results.push({ wallet: w.id, sig, amount: BUY_SOL_PER_WALLET });
    } catch (e) {
      console.log(`  wallet-${w.id}: ${e.message.slice(0, 60)}`);
    }

    await new Promise(r => setTimeout(r, MIN_DELAY_MS));
  }

  return results;
}

async function snipeSell(mint, wallets) {
  console.log(`\n  Selling ${mint.slice(0, 8)}... from fleet`);
  for (const w of wallets) {
    try {
      const resp = await fetch("https://pumpdev.io/api/trade-local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: w.keypair.publicKey.toBase58(),
          action: "sell",
          mint,
          denominatedInSol: "false",
          amount: "100%",
          slippage: SLIPPAGE,
          priorityFee: 0.001,
          pool: "pump",
        }),
      });
      if (resp.status !== 200) continue;
      const tx = VersionedTransaction.deserialize(new Uint8Array(await resp.arrayBuffer()));
      tx.sign([w.keypair]);
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 2 });
      console.log(`  wallet-${w.id}: SOLD — ${sig.slice(0, 20)}...`);
    } catch (e) {
      // no position, skip
    }
    await new Promise(r => setTimeout(r, MIN_DELAY_MS));
  }
}

function startWebSocket(fleet) {
  console.log("\nConnecting to pump.fun websocket...");

  const ws = new WebSocket("wss://pumpdev.io/ws");

  ws.on("open", () => {
    console.log("Connected. Subscribing to new token events...\n");
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
  });

  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // New token created
      if (msg.txType === "create" || msg.mint) {
        const now = Date.now();
        if (now - lastSnipeTime < COOLDOWN_MS) return; // cooldown

        const token = {
          mint: msg.mint,
          name: msg.name || "Unknown",
          symbol: msg.symbol || "???",
          description: msg.description || "",
          twitter: msg.twitter,
          website: msg.website,
          devBuySol: msg.solAmount || 0,
          creator: msg.traderPublicKey,
        };

        if (!passesFilter(token)) {
          return; // silently skip filtered tokens
        }

        lastSnipeTime = now;
        totalSnipes++;

        console.log(`\n[SNIPE #${totalSnipes}] ${token.name} ($${token.symbol})`);
        console.log(`  Mint: ${token.mint}`);
        console.log(`  Dev buy: ${token.devBuySol} SOL`);
        if (token.twitter) console.log(`  Twitter: ${token.twitter}`);
        if (token.website) console.log(`  Website: ${token.website}`);

        const results = await snipeBuy(token.mint, fleet);

        if (results.length > 0) {
          const trade = { ...token, buyResults: results, boughtAt: now };
          activeTrades.push(trade);

          // Auto-sell after configurable delay
          const sellDelay = parseInt(process.env.SELL_DELAY_MS || "60000"); // default 60s
          if (sellDelay > 0) {
            console.log(`  Auto-sell in ${sellDelay / 1000}s...`);
            setTimeout(async () => {
              await snipeSell(token.mint, fleet);
              activeTrades = activeTrades.filter(t => t.mint !== token.mint);
            }, sellDelay);
          }
        }
      }
    } catch (e) {
      // parse errors, ignore
    }
  });

  ws.on("close", () => {
    console.log("\nWebSocket closed. Reconnecting in 3s...");
    setTimeout(() => startWebSocket(fleet), 3000);
  });

  ws.on("error", (e) => {
    console.error("WebSocket error:", e.message);
  });
}

// === MAIN ===
console.log("=== OpenSeeker Pump.fun Sniper ===\n");
console.log("Config:");
console.log(`  Buy per wallet: ${BUY_SOL_PER_WALLET} SOL`);
console.log(`  Max wallets per snipe: ${MAX_WALLETS}`);
console.log(`  Slippage: ${SLIPPAGE}%`);
console.log(`  Cooldown: ${COOLDOWN_MS / 1000}s`);
console.log(`  Auto-sell delay: ${(process.env.SELL_DELAY_MS || 60000) / 1000}s`);
console.log(`  Blocked words: ${BLOCK_KEYWORDS.join(", ")}`);
console.log(`  Require socials: ${REQUIRE_SOCIALS}`);

const fleet = loadFleet();
console.log(`\nLoaded ${fleet.length} wallets`);

// Check balances
(async () => {
  let totalBal = 0;
  for (const w of fleet) {
    const bal = await conn.getBalance(w.keypair.publicKey);
    totalBal += bal;
  }
  console.log(`Total fleet balance: ${(totalBal / LAMPORTS_PER_SOL).toFixed(4)} SOL\n`);
  startWebSocket(fleet);
})();
