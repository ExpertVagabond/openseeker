import WebSocket from "ws";

// === CONFIG ===
const MIN_SCORE = parseInt(process.env.MIN_SCORE || "3"); // minimum quality score to alert
const SHOW_ALL = process.env.SHOW_ALL === "true"; // show all tokens, not just high-score

// === SCORING ===
function scoreToken(token) {
  let score = 0;
  const reasons = [];

  // Has Twitter
  if (token.twitter && token.twitter.length > 5) {
    score += 2;
    reasons.push("twitter");
  }

  // Has Website
  if (token.website && token.website.length > 5 && !token.website.includes("pump.fun")) {
    score += 2;
    reasons.push("website");
  }

  // Has Telegram
  if (token.telegram && token.telegram.length > 5) {
    score += 1;
    reasons.push("telegram");
  }

  // Dev buy > 0.5 SOL (skin in the game)
  if ((token.devBuySol || 0) >= 0.5) {
    score += 2;
    reasons.push(`devBuy:${token.devBuySol.toFixed(2)}SOL`);
  } else if ((token.devBuySol || 0) >= 0.1) {
    score += 1;
    reasons.push(`devBuy:${token.devBuySol.toFixed(2)}SOL`);
  }

  // Name quality (not random chars)
  const name = token.name || "";
  if (name.length >= 3 && name.length <= 20 && /^[A-Za-z0-9\s]+$/.test(name)) {
    score += 1;
    reasons.push("cleanName");
  }

  // Symbol quality
  const symbol = token.symbol || "";
  if (symbol.length >= 2 && symbol.length <= 6 && /^[A-Z0-9]+$/.test(symbol)) {
    score += 1;
    reasons.push("cleanSymbol");
  }

  // Description exists and is substantive
  const desc = token.description || "";
  if (desc.length > 50) {
    score += 1;
    reasons.push("description");
  }

  // Negative signals
  const combined = (name + " " + symbol + " " + desc).toLowerCase();
  const redFlags = ["rug", "scam", "test", "airdrop", "free", "guaranteed", "1000x", "moon"];
  for (const flag of redFlags) {
    if (combined.includes(flag)) {
      score -= 2;
      reasons.push(`RED:${flag}`);
    }
  }

  // Trending keywords (positive)
  const hotWords = ["ai", "agent", "solana", "defi", "dao", "nft", "meme", "pepe", "trump", "elon"];
  for (const word of hotWords) {
    if (combined.includes(word)) {
      score += 1;
      reasons.push(`trend:${word}`);
      break; // only count once
    }
  }

  return { score, reasons };
}

// === MAIN ===
console.log("=== Pump.fun Launch Scanner ===\n");
console.log(`Min score to alert: ${MIN_SCORE}`);
console.log(`Show all: ${SHOW_ALL}\n`);
console.log("Connecting...\n");

let tokenCount = 0;
let highScoreCount = 0;

const ws = new WebSocket("wss://pumpportal.fun/api/data");

ws.on("open", () => {
  console.log("Connected. Watching for new launches...\n");
  ws.send(JSON.stringify({ method: "subscribeNewToken" }));
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());

    if (msg.txType === "create" || (msg.mint && msg.name)) {
      tokenCount++;

      const token = {
        mint: msg.mint,
        name: msg.name || "Unknown",
        symbol: msg.symbol || "???",
        description: msg.description || "",
        twitter: msg.twitter || "",
        website: msg.website || "",
        telegram: msg.telegram || "",
        devBuySol: msg.solAmount || 0,
        creator: msg.traderPublicKey || "",
      };

      const { score, reasons } = scoreToken(token);

      if (score >= MIN_SCORE || SHOW_ALL) {
        const time = new Date().toLocaleTimeString();
        const stars = score >= 7 ? "★★★" : score >= 5 ? "★★" : score >= 3 ? "★" : "·";

        if (score >= MIN_SCORE) {
          highScoreCount++;
          console.log(`\n${stars} [${time}] #${tokenCount} SCORE: ${score}/10`);
        } else {
          console.log(`\n  [${time}] #${tokenCount} score: ${score}/10`);
        }

        console.log(`  ${token.name} ($${token.symbol})`);
        console.log(`  Mint: ${token.mint}`);
        console.log(`  Pump: https://pump.fun/coin/${token.mint}`);
        if (token.twitter) console.log(`  Twitter: ${token.twitter}`);
        if (token.website) console.log(`  Website: ${token.website}`);
        console.log(`  Signals: ${reasons.join(", ")}`);

        if (score >= 7) {
          console.log(`\n  >>> HIGH QUALITY - SNIPE CANDIDATE <<<`);
          console.log(`  Run: node sniper.mjs  (or manual buy below)`);
          console.log(`  node fleet.mjs buy ${token.mint} 0.05`);
        }
      }
    }
  } catch {
    // ignore parse errors
  }
});

ws.on("close", () => {
  console.log(`\nDisconnected. Scanned ${tokenCount} tokens, ${highScoreCount} high-score. Reconnecting...`);
  setTimeout(() => {
    const ws2 = new WebSocket("wss://pumpportal.fun/api/data");
    ws2.on("open", () => ws2.send(JSON.stringify({ method: "subscribeNewToken" })));
  }, 3000);
});

ws.on("error", (e) => console.error("Error:", e.message));

// Stats every 5 min
setInterval(() => {
  console.log(`\n--- Stats: ${tokenCount} tokens scanned, ${highScoreCount} high-score (${((highScoreCount/tokenCount)*100).toFixed(1)}%) ---\n`);
}, 300000);
