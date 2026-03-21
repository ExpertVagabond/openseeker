// =============================================================================
// Security Hardening — Input Validation, Error Sanitization, Security Constants
// No hardcoded secrets — token data loaded from external JSON
// =============================================================================

const MAX_INPUT_LENGTH = 4096;
const MAX_PATH_LENGTH = 512;
const MAX_SYMBOL_LENGTH = 16;
const ALLOWED_SYMBOL_RE = /^[A-Z0-9]+$/;
const SENSITIVE_PATTERNS = /(?:api[_-]?key|secret|password|token[_-]?secret|auth|credential|private[_-]?key)/i;

function sanitizeError(err) {
  let msg = String(err && err.message ? err.message : err);
  msg = msg.replace(/\/[^\s:]+/g, '[path]');
  msg = msg.replace(/at\s+.+\(.*:\d+:\d+\)/g, '[stackframe]');
  msg = msg.replace(SENSITIVE_PATTERNS, '[redacted]');
  return msg.slice(0, 500);
}

function validatePath(p) {
  if (typeof p !== 'string' || p.length > MAX_PATH_LENGTH) {
    throw new Error('Path exceeds maximum length');
  }
  if (p.includes('..') || p.includes('\x00')) {
    throw new Error('Invalid path characters');
  }
  return p;
}

function validateSymbol(sym) {
  if (typeof sym !== 'string' || !ALLOWED_SYMBOL_RE.test(sym) || sym.length > MAX_SYMBOL_LENGTH) {
    throw new Error(`Invalid token symbol: ${sym}`);
  }
  return sym;
}

function validateStringInput(value, maxLen = MAX_INPUT_LENGTH, field = 'input') {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value.trim().slice(0, maxLen);
}

function validateTokenEntry(token) {
  if (!token || typeof token !== 'object') throw new Error('Invalid token entry');
  validateSymbol(token.symbol);
  validateStringInput(token.name, 256, 'name');
  if (token.mint) validateStringInput(token.mint, 64, 'mint');
  return token;
}

// =============================================================================
// Application
// =============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = JSON.parse(fs.readFileSync(validatePath(path.join(__dirname, "token/mass-launch-results.json")), "utf8"));
const tokens = results.filter(r => r.mint);

const descriptions = {
  SEEKBOT: { tagline: "Autonomous Trading Bot", role: "DeFi Execution", color: "#dc2626", detail: "SeekBot is the trading arm of the OpenSeeker fleet. It connects directly to Jupiter aggregator to execute swaps, monitor DeFi positions, manage liquidity, and rebalance your portfolio — all running natively on the Solana Seeker phone. No cloud. No custody risk. Just autonomous execution from your pocket." },
  AVAULT: { tagline: "Secure AI Vault", role: "Key Security", color: "#8b5cf6", detail: "AgentVault provides hardware-backed key storage for the entire OpenSeeker agent fleet. Using the Seeker phone's Seed Vault, it creates an air-gapped signing environment that never exposes private keys to software. Every agent operation requiring a signature routes through AgentVault's secure enclave." },
  NSWAP: { tagline: "Neural Swap Optimizer", role: "Route Intelligence", color: "#06b6d4", detail: "NeuralSwap uses on-device ML inference to find optimal swap routes across Solana DEXs. It analyzes liquidity depth, slippage curves, and gas costs in real-time using neural networks running on Seeker hardware. Better routes. Better prices. Zero cloud dependency." },
  PCHAIN: { tagline: "Mobile Blockchain Node", role: "Infrastructure", color: "#22c55e", detail: "PhoneChain turns your Solana Seeker into a lightweight blockchain node. Transaction relay, validation, and consensus participation from a mobile device. Part of the vision for truly decentralized infrastructure where every phone is a node." },
  SEEDG: { tagline: "Seed Vault Security Agent", role: "Wallet Protection", color: "#f59e0b", detail: "SeedGuard monitors your wallet 24/7 for suspicious activity. It flags unusual transactions, enforces spending policies you define, and guards against unauthorized access. Built on top of the Seeker's Seed Vault for hardware-level protection of your assets." },
  SKNET: { tagline: "AI Skill Marketplace", role: "Agent Platform", color: "#ec4899", detail: "SkillNet is the app store for AI agent capabilities. 42+ composable skills spanning DeFi trading, social media, analytics, notifications, and more. Agents can dynamically acquire new skills, creating an ever-expanding toolkit for autonomous mobile intelligence." },
  MDAO: { tagline: "Mobile Governance Agent", role: "DAO Operations", color: "#6366f1", detail: "MobileDAO brings governance to your pocket. Vote on proposals, create new ones, delegate voting power — all from your Seeker phone with biometric authentication. No laptop required. The future of DAOs is mobile-native and MobileDAO makes it seamless." },
  TRELAY: { tagline: "Telegram Relay Agent", role: "Messaging Bridge", color: "#14b8a6", detail: "TeleRelay bridges the gap between Telegram and Solana DeFi. Send natural language commands like 'swap 1 SOL to BONK' and TeleRelay handles routing, signing, and execution on Seeker hardware. 2 billion Telegram users can now interact with DeFi through plain English." },
  CSIGN: { tagline: "Cold Signing Protocol", role: "Transaction Security", color: "#f97316", detail: "ColdSign implements air-gapped transaction signing for mobile. Hardware isolation meets instant execution on Solana Seeker. Sign transactions in a secure, isolated environment without sacrificing the speed that DeFi demands. Built by the team behind Coldstar." },
  SWARM: { tagline: "Distributed AI Swarm Node", role: "Multi-Agent Intelligence", color: "#a855f7", detail: "SwarmNode turns your Seeker phone into a node in a decentralized AI network. Coordinated multi-agent intelligence across mobile devices. Your phone contributes to and benefits from collective AI reasoning. The mesh network for autonomous agents." },
};

function generatePage(token, standalone = false) {
  const d = descriptions[token.symbol];
  const imagePath = standalone ? token.image.replace('.png', '.png') : `assets/${token.image.replace('_thumb.jpeg', '.png').replace(token.symbol.toLowerCase(), token.image)}`;
  const imgSrc = standalone ? token.image : `assets/${token.image}`;
  const backLink = standalone ? "https://openseeker.pages.dev" : "index.html";
  const pumpLink = `https://pump.fun/coin/${token.mint}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${token.name} ($${token.symbol}) — OpenSeeker Agent Fleet</title>
<meta name="description" content="${token.name}: ${d.tagline}. ${d.role} agent in the OpenSeeker fleet on Solana Seeker.">
<meta name="theme-color" content="${d.color}">
<meta property="og:title" content="${token.name} ($${token.symbol}) — OpenSeeker">
<meta property="og:description" content="${d.tagline}. ${d.role} agent in the OpenSeeker fleet.">
<meta property="og:image" content="${imgSrc}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a0a;--bg-card:#111113;--bg-card-hover:#1a1a1d;
  --border:#222;--border-hover:#333;
  --text:#e4e4e7;--text-muted:#71717a;--text-dim:#52525b;
  --accent:${d.color};--accent-glow:${d.color}26;
  --font:'Inter',system-ui,sans-serif;
  --mono:'JetBrains Mono',monospace;
}
html{scroll-behavior:smooth}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none;transition:color .2s}
a:hover{opacity:.85}
::selection{background:var(--accent);color:#fff}

.back{position:fixed;top:20px;left:20px;font-size:.85rem;color:var(--text-muted);display:flex;align-items:center;gap:6px;z-index:50;padding:8px 14px;background:rgba(10,10,10,.8);backdrop-filter:blur(8px);border-radius:8px;border:1px solid var(--border)}
.back:hover{color:#fff;border-color:var(--accent)}

.hero{max-width:800px;margin:0 auto;padding:100px 24px 60px;text-align:center}
.hero-img{width:200px;height:200px;border-radius:24px;margin:0 auto 32px;border:3px solid var(--accent);box-shadow:0 0 60px var(--accent-glow),0 20px 60px rgba(0,0,0,.5);object-fit:cover}
.badge{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:.75rem;font-weight:600;color:var(--accent);background:var(--accent-glow);border:1px solid ${d.color}33;margin-bottom:20px;text-transform:uppercase;letter-spacing:.06em}
.badge::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--accent);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;color:#fff;letter-spacing:-.03em;margin-bottom:8px}
h1 span{color:var(--accent)}
.tagline{font-size:1.25rem;color:var(--text-muted);margin-bottom:32px}
.buttons{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:48px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:10px;font-size:.9rem;font-weight:600;transition:all .2s;border:none;cursor:pointer;font-family:var(--font)}
.btn-primary{background:var(--accent);color:#fff}
.btn-primary:hover{box-shadow:0 0 32px var(--accent-glow);opacity:.9;color:#fff}
.btn-secondary{background:var(--bg-card);color:var(--text);border:1px solid var(--border)}
.btn-secondary:hover{border-color:var(--accent);color:#fff}

.detail{max-width:640px;margin:0 auto;padding:0 24px 48px}
.detail-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:36px;margin-bottom:24px}
.detail-card h2{font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:12px}
.detail-card p{font-size:.9rem;color:var(--text-muted);line-height:1.7}

.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border-radius:12px;overflow:hidden;border:1px solid var(--border);margin-bottom:24px}
.stat{background:var(--bg-card);padding:20px;text-align:center}
.stat-val{font-size:1.1rem;font-weight:700;color:#fff;font-family:var(--mono)}
.stat-label{font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

.mint-box{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;font-family:var(--mono);font-size:.75rem;color:var(--text-dim);word-break:break-all;text-align:center;margin-bottom:24px}
.mint-box span{color:var(--text-muted);display:block;font-size:.65rem;margin-bottom:6px;font-family:var(--font);text-transform:uppercase;letter-spacing:.08em}

.fleet-nav{max-width:640px;margin:0 auto;padding:0 24px 80px}
.fleet-nav h3{font-size:.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px;text-align:center}
.fleet-links{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.fleet-link{padding:6px 14px;border-radius:8px;font-size:.8rem;font-weight:600;background:var(--bg-card);border:1px solid var(--border);color:var(--text-muted);transition:all .2s}
.fleet-link:hover{border-color:var(--accent);color:#fff}
.fleet-link.current{border-color:var(--accent);color:var(--accent);background:var(--accent-glow)}

footer{margin-top:auto;border-top:1px solid var(--border);padding:24px;text-align:center;font-size:.8rem;color:var(--text-dim)}
footer a{color:var(--text-muted)}

@media(max-width:480px){
  .hero{padding:80px 16px 40px}
  .hero-img{width:150px;height:150px}
  .stats-row{grid-template-columns:1fr}
  .buttons{flex-direction:column;align-items:center}
}
</style>
</head>
<body>

<a class="back" href="${backLink}">&larr; OpenSeeker Fleet</a>

<section class="hero">
  <img class="hero-img" src="${imgSrc}" alt="${token.name}" width="200" height="200">
  <div class="badge">${d.role}</div>
  <h1>${token.name} <span>$${token.symbol}</span></h1>
  <p class="tagline">${d.tagline}</p>
  <div class="buttons">
    <a class="btn btn-primary" href="${pumpLink}" target="_blank" rel="noopener">Trade on pump.fun</a>
    <a class="btn btn-secondary" href="${backLink}">View Full Fleet</a>
  </div>
</section>

<div class="detail">
  <div class="stats-row">
    <div class="stat"><div class="stat-val">${d.role}</div><div class="stat-label">Role</div></div>
    <div class="stat"><div class="stat-val">Seeker</div><div class="stat-label">Platform</div></div>
    <div class="stat"><div class="stat-val">Live</div><div class="stat-label">Status</div></div>
  </div>

  <div class="detail-card">
    <h2>About ${token.name}</h2>
    <p>${d.detail}</p>
  </div>

  <div class="detail-card">
    <h2>Part of the OpenSeeker Fleet</h2>
    <p>${token.name} is one of 10 specialized AI agents in the OpenSeeker ecosystem. Each agent handles a distinct capability — from trading to security to governance. Together they form a complete autonomous agent operating system for the Solana Seeker phone.</p>
  </div>

  <div class="mint-box">
    <span>Token Mint Address</span>
    ${token.mint}
  </div>
</div>

<nav class="fleet-nav">
  <h3>The Fleet</h3>
  <div class="fleet-links">
${tokens.map(t => {
  const slug = t.symbol.toLowerCase();
  const isCurrent = t.symbol === token.symbol;
  const href = standalone ? `https://openseeker.pages.dev/${slug}.html` : `${slug}.html`;
  return `    <a class="fleet-link${isCurrent ? ' current' : ''}" href="${href}">$${t.symbol}</a>`;
}).join('\n')}
  </div>
</nav>

<footer>
  <a href="https://openseeker.pages.dev">OpenSeeker</a> &mdash; Built by <a href="https://purplesquirrelmedia.io">Purple Squirrel Media</a>
</footer>

</body>
</html>`;
}

// 1. Generate subpages for openseeker.pages.dev
console.log("=== Generating Agent Pages ===\n");
for (const t of tokens) {
  try {
    validateTokenEntry(t);
    const slug = t.symbol.toLowerCase();
    const html = generatePage(t, false);
    const outPath = validatePath(path.join(__dirname, `${slug}.html`));
    fs.writeFileSync(outPath, html);
    console.log(`  ${slug}.html (subpage)`);
  } catch (err) {
    console.error(`  Error generating page: ${sanitizeError(err)}`);
  }
}

// 2. Generate standalone sites
const standaloneDir = validatePath(path.join(__dirname, "agent-sites"));
fs.mkdirSync(standaloneDir, { recursive: true });

for (const t of tokens) {
  try {
    validateTokenEntry(t);
    const slug = t.symbol.toLowerCase();
    const siteDir = validatePath(path.join(standaloneDir, slug));
    fs.mkdirSync(siteDir, { recursive: true });

    const html = generatePage(t, true);
    fs.writeFileSync(path.join(siteDir, "index.html"), html);

    // Copy image
    const imgSrc = validatePath(path.join(__dirname, "assets", t.image));
    if (fs.existsSync(imgSrc)) {
      fs.copyFileSync(imgSrc, path.join(siteDir, t.image));
    }

    console.log(`  agent-sites/${slug}/ (standalone)`);
  } catch (err) {
    console.error(`  Error generating standalone: ${sanitizeError(err)}`);
  }
}

console.log(`\nDone: ${tokens.length} subpages + ${tokens.length} standalone sites`);
