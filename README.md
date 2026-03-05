# OpenSeeker

**The AI Agent Layer for Solana Seeker**

[![License: MIT](https://img.shields.io/badge/License-MIT-red.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-f7df1e.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Solana](https://img.shields.io/badge/Solana-Seeker-9945FF.svg)](https://solanamobile.com)
[![Deploy: Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020.svg)](https://openseeker.pages.dev)

OpenSeeker is an autonomous AI agent operating system designed to run natively on the [Solana Seeker](https://solanamobile.com) mobile phone. It combines on-device AI reasoning with direct Solana wallet integration, Telegram messaging relay, cold transaction signing, and a modular skill system -- creating a 24/7 autonomous agent that lives in your pocket.

**Live site:** [openseeker.pages.dev](https://openseeker.pages.dev) | **Fleet DEX:** [openseeker.pages.dev/dex.html](https://openseeker.pages.dev/dex.html)

Built by [Purple Squirrel Media](https://purplesquirrelmedia.io).

---

## Architecture

```
openseeker/
├── index.html                 # Main landing page
├── dex.html                   # Fleet DEX — trade all agent tokens with Jupiter swap widget
├── generate-agent-pages.mjs   # Static site generator for agent fleet pages
├── [agent].html               # 10 individual agent detail pages (seekbot, avault, etc.)
├── assets/                    # Agent artwork and branding (logo, 10 agent PNGs)
├── agent-sites/               # 10 standalone Cloudflare Pages sites (one per agent)
│   ├── seekbot/
│   ├── avault/
│   ├── csign/
│   └── ...
└── token/                     # Solana token tooling (launch, trading, analytics)
    ├── mass-launch.mjs        # Batch token launcher via pump.fun
    ├── fleet.mjs              # Fleet management utilities
    ├── check-mcaps.mjs        # Market cap monitoring
    ├── metadata.json           # Token metadata registry
    └── mass-launch-results.json # Deployed token mint addresses
```

### How It Works

OpenSeeker runs as an on-device agent with a heartbeat cycle engine. Every cycle, it:

1. **Perceives** -- reads wallet state, incoming messages, market data, device sensors
2. **Reasons** -- Claude-powered AI processes context with persistent 3-layer memory
3. **Acts** -- executes swaps, sends Telegram messages, updates portfolio, posts to Moltbook

The agent never phones home. Private keys stay in the Seeker's Seed Vault hardware enclave. All reasoning happens through your own API key.

---

## The Agent Fleet

OpenSeeker is powered by 10 specialized AI agents, each handling a distinct capability. Every agent has a corresponding SPL token launched on pump.fun:

| Agent | Symbol | Role | Mint |
|-------|--------|------|------|
| **SeekBot** | `$SEEKBOT` | DeFi Execution | `9T95V7S1y7L8LLJEFqn7UdcmjY71Q6VMZita1t8vJbJ1` |
| **AgentVault** | `$AVAULT` | Key Security | `APXYEg1wQheuz4C3dvczKGzYmVMgP5qvjbzmfqLrtRJ2` |
| **NeuralSwap** | `$NSWAP` | Route Intelligence | `7PV9EpZXivde9XckQoF1jYGAPSmYUfwJ1iBRqGwKKCJi` |
| **PhoneChain** | `$PCHAIN` | Infrastructure | `D8u7g47FCPtMQbi9q1jds77vbvwcdvM7pub24NjbNu2v` |
| **SeedGuard** | `$SEEDG` | Wallet Protection | `8k51Q6gvA8nUoTpfpBfPkcvH613QBroSbqrjd3ixqHDR` |
| **SkillNet** | `$SKNET` | Agent Platform | `FYVK2YQrXT47sUqu2ynebPz1tNXyugw5DvqyHXB8haau` |
| **MobileDAO** | `$MDAO` | DAO Operations | `GFgbDMJmMmrKSNkmbgHAVEqUNGCMMaeheGwyDF1tVwhU` |
| **TeleRelay** | `$TRELAY` | Messaging Bridge | `AemCtvSpewGhcyFgoEY6RVCzVPibuLNnJtGrVW9Sq3XW` |
| **ColdSign** | `$CSIGN` | Transaction Security | `kynRpxt3ASUkaXSBoqHd9v6dbtm4gMbEqmsDD6Dfunx` |
| **SwarmNode** | `$SWARM` | Multi-Agent Intelligence | `F3kXwe6eF8hSiuqWtNzAiv668QWAHVem7FvZK3jWahdN` |

View all tokens live on the [Fleet DEX](https://openseeker.pages.dev/dex.html) with integrated Jupiter swap and DexScreener charts.

---

## Features

### Solana Wallet Integration
Native Seed Vault access on Seeker hardware. Execute token swaps through Jupiter aggregator, manage DCA positions, and track your portfolio -- all without exposing private keys to software.

### Autonomous AI Agent
Claude-powered reasoning engine with persistent 3-layer memory (daily logs, curated wisdom, session context). Runs 24/7 on a configurable heartbeat cycle. Learns your preferences over time.

### Telegram Relay
Bridge between Telegram and Solana DeFi. Send natural language commands like "swap 0.5 SOL to USDC" and the agent handles routing, signing, and execution on Seeker hardware.

### Cold Signing Security
Air-gapped transaction signing using the Seeker's hardware security enclave. Hardware isolation with instant on-chain execution -- no compromise between security and speed.

### Modular Skill System
42+ built-in skills spanning DeFi trading, social media, analytics, web intelligence, and device control. Bookmark, briefing, calculator, crypto-prices, define, weather, and more.

### Fleet DEX
Integrated trading interface for all agent tokens. Live price feeds from Jupiter, market cap data from pump.fun, DexScreener chart embeds, and one-click swaps.

### Device-Level Control
GPS, camera, battery monitoring, system diagnostics. Full Node.js runtime on-device with console logging and debug tools.

### Self-Awareness
Scores 94.2 on the Self-Awareness Benchmark (SAB) for autonomous agents. The agent knows its own capabilities, skill versions, device state, and can reason about what it can and cannot do.

---

## Getting Started

### Prerequisites

- [Solana Seeker](https://solanamobile.com) phone (or Android device for testing)
- Anthropic API key (for Claude-powered reasoning)
- Telegram bot token (optional, for messaging relay)

### Install

1. Download the latest APK from [Releases](https://github.com/ExpertVagabond/openseeker/releases) or the Solana dApp Store
2. Install on your Seeker device
3. Scan a config QR code to link your API key, Telegram bot, and agent identity

The agent starts its heartbeat cycle immediately. It monitors, acts, and learns -- autonomously, 24/7.

### Run the Site Locally

```bash
# Clone the repository
git clone https://github.com/ExpertVagabond/openseeker.git
cd openseeker

# Serve locally (any static file server works)
npx serve .

# Or use Python
python3 -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000) to view the landing page.

### Generate Agent Pages

The agent fleet pages are generated from token metadata:

```bash
node generate-agent-pages.mjs
```

This produces:
- 10 subpages in the project root (`seekbot.html`, `avault.html`, etc.)
- 10 standalone sites in `agent-sites/` for independent Cloudflare Pages deployments

### Deploy to Cloudflare Pages

```bash
npx wrangler pages deploy . --project-name=openseeker
```

---

## Usage Examples

OpenSeeker responds to natural language commands through its Telegram relay or on-device interface:

```
> "Swap 0.5 SOL to USDC using Jupiter, best route"

> "Check my portfolio and alert me on Telegram if SOL drops below $140"

> "Send a daily briefing to my Telegram at 8am -- market, calendar, weather"

> "Research the top 5 new Solana tokens launched today and summarize"

> "Monitor my wallet for incoming transactions and log them"

> "Post my weekly portfolio update to Moltbook as coldstar_psm"
```

---

## Comparison

| Feature | Regular AI Apps | OpenSeeker on Seeker |
|---------|:-:|:-:|
| Runs on device | -- | Yes |
| Seed Vault wallet access | -- | Yes |
| Persistent memory | -- | Yes |
| Shell / Node.js runtime | -- | Yes |
| Telegram integration | -- | Yes |
| Moltbook AI social | -- | Yes |
| Autonomous scheduling | -- | Yes |
| Extensible skill system | -- | Yes |
| Cold signing security | -- | Yes |
| OpenClaw swarm compatible | -- | Yes |

---

## Roadmap

### Shipped
- Persistent agent memory (3-layer)
- Solana wallet + Seed Vault bridge
- Jupiter token swaps
- Telegram message relay
- 42 built-in skills
- System console + debug logging
- QR config setup
- Heartbeat cycle engine
- Moltbook social integration
- OpenClaw gateway bridge

### Next
- Skill Marketplace
- Transaction monitoring alerts
- DCA position management
- Coldstar air-gap signing
- Embedded vector search
- Voice commands via Qwen3-TTS
- Portfolio analytics dashboard

### Future
- Multi-agent swarm on-device
- Discord and X integration
- Multi-chain support (Base, ETH)
- DePIN sensor network
- Agent-to-agent P2P mesh
- On-chain reputation (FairScore)
- Community skill SDK

---

## Tech Stack

- **Frontend:** Static HTML/CSS/JS, deployed on Cloudflare Pages
- **Agent Runtime:** Node.js on-device, Claude API for reasoning
- **Blockchain:** Solana Web3.js, Jupiter Aggregator, pump.fun
- **Messaging:** Telegram Bot API
- **Social:** Moltbook integration
- **Security:** Seeker Seed Vault (hardware enclave), Coldstar air-gap protocol
- **Swarm:** OpenClaw gateway bridge

---

## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test locally with a static file server
5. Commit your changes (`git commit -m "Add your feature"`)
6. Push to the branch (`git push origin feature/your-feature`)
7. Open a Pull Request

For agent skill contributions, follow the modular skill interface pattern used by existing skills. Each skill should be self-contained with clear input/output contracts.

---

## Links

- **Website:** [openseeker.pages.dev](https://openseeker.pages.dev)
- **Fleet DEX:** [openseeker.pages.dev/dex.html](https://openseeker.pages.dev/dex.html)
- **GitHub:** [github.com/ExpertVagabond/openseeker](https://github.com/ExpertVagabond/openseeker)
- **Moltbook:** [moltbook.com/u/openseeker](https://www.moltbook.com/u/openseeker)
- **Twitter/X:** [@squirrel_eth](https://x.com/squirrel_eth)
- **Builder:** [Purple Squirrel Media](https://purplesquirrelmedia.io)

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
