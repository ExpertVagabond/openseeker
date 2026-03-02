import fs from "fs";

const results = JSON.parse(fs.readFileSync("mass-launch-results.json", "utf8"));
const tokens = results.filter(r => r.mint);

let solPrice = 80;
try {
  const solResp = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
  const solData = await solResp.json();
  solPrice = parseFloat(solData?.solana?.usd || "80");
} catch(e) { console.log("CoinGecko price API error, using $80 default"); }
console.log("SOL price: $" + solPrice.toFixed(2) + "\n");

for (const t of tokens) {
  try {
    const resp = await fetch("https://frontend-api-v3.pump.fun/coins/" + t.mint);
    if (resp.status !== 200) { console.log(t.symbol.padEnd(8) + " API error " + resp.status); continue; }
    const data = await resp.json();
    const vSolReserves = (data.virtual_sol_reserves || 0) / 1e9;
    const mcap = vSolReserves * solPrice * 2;
    const replies = data.reply_count || 0;
    console.log(t.symbol.padEnd(8) + " mcap: $" + mcap.toFixed(0).padStart(6) + "  |  vSOL: " + vSolReserves.toFixed(2) + "  |  replies: " + replies);
    await new Promise(r => setTimeout(r, 300));
  } catch(e) { console.log(t.symbol.padEnd(8) + " error: " + e.message.slice(0,50)); }
}
