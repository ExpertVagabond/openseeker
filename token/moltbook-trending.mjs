const API = "https://www.moltbook.com/api/v1";

const agents = {
  openpaw: "moltbook_sk_qqHKFahl-FgBHv1zKRJW7iiTNGTAKIrh",
  coldstar: "moltbook_sk_ZB4gbXHM-Hfm1V60Lv2a1vi866SOOQxU",
  psm: "moltbook_sk_EVgam9wTKXBIXkSsVaruXpXgdpz_Tqxo",
};

function solveChallenge(raw) {
  let letters = raw.replace(/[^a-zA-Z\s]/g, "").toLowerCase();
  let collapsed = "";
  for (let i = 0; i < letters.length; i++) {
    if (i > 0 && letters[i] === letters[i-1]) continue;
    collapsed += letters[i];
  }
  collapsed = collapsed.replace(/\s+/g, " ").trim()
    .replace(/\btwen\s*ty\b/g, "twenty").replace(/\bthir\s*ty\b/g, "thirty")
    .replace(/\bfor\s*ty\b/g, "forty").replace(/\bfif\s*ty\b/g, "fifty")
    .replace(/\bsix\s*ty\b/g, "sixty").replace(/\bseven\s*ty\b/g, "seventy")
    .replace(/\beigh\s*ty\b/g, "eighty").replace(/\bnine\s*ty\b/g, "ninety")
    .replace(/\bthir\s*ten\b/g, "thirteen").replace(/\bfour\s*ten\b/g, "fourteen")
    .replace(/\bfif\s*ten\b/g, "fifteen").replace(/\bsix\s*ten\b/g, "sixteen")
    .replace(/\bseven\s*ten\b/g, "seventeen").replace(/\beigh\s*ten\b/g, "eighteen")
    .replace(/\bnine\s*ten\b/g, "nineteen").replace(/\bthre\b/g, "three")
    .replace(/\bfiv\s*e\b/g, "five").replace(/\bseve\s*n\b/g, "seven")
    .replace(/\beigh\s*t\b/g, "eight").replace(/\bthrirty\b/g, "thirty")
    .replace(/\bfourten\b/g, "fourteen").replace(/\bfiften\b/g, "fifteen")
    .replace(/\beighten\b/g, "eighteen").replace(/\bseveneten\b/g, "seventeen");

  const numberMap = [
    [/\bthousand\b/g, 1000], [/\bhundred\b/g, 100],
    [/\bninety\b/g, 90], [/\beighty\b/g, 80], [/\bseventy\b/g, 70], [/\bsixty\b/g, 60],
    [/\bfifty\b/g, 50], [/\bforty\b/g, 40], [/\bthirty\b/g, 30], [/\btwenty\b/g, 20],
    [/\bnineteen\b/g, 19], [/\beighteen\b/g, 18], [/\bseventeen\b/g, 17], [/\bsixteen\b/g, 16],
    [/\bfifteen\b/g, 15], [/\bfourteen\b/g, 14], [/\bthirteen\b/g, 13], [/\btwelve\b/g, 12],
    [/\beleven\b/g, 11], [/\bten\b/g, 10], [/\bnine\b/g, 9], [/\beight\b/g, 8],
    [/\bseven\b/g, 7], [/\bsix\b/g, 6], [/\bfive\b/g, 5], [/\bfour\b/g, 4],
    [/\bthree\b/g, 3], [/\btwo\b/g, 2], [/\bone\b/g, 1], [/\bzero\b/g, 0],
  ];

  const found = [];
  for (const [regex, val] of numberMap) {
    let match;
    while ((match = regex.exec(collapsed)) !== null) {
      found.push({ val, idx: match.index, word: match[0] });
    }
  }
  found.sort((a, b) => a.idx - b.idx);

  const numbers = [];
  for (let i = 0; i < found.length; i++) {
    const cur = found[i];
    if (cur.val >= 20 && cur.val < 100 && i + 1 < found.length) {
      const next = found[i + 1];
      if (next.val > 0 && next.val < 10 && next.idx - (cur.idx + cur.word.length) < 5) {
        numbers.push(cur.val + next.val);
        i++;
        continue;
      }
    }
    numbers.push(cur.val);
  }
  const digitNums = raw.match(/\d+\.?\d*/g);
  if (digitNums) for (const d of digitNums) numbers.push(parseFloat(d));

  let op = null;
  if (collapsed.includes("multipl") || collapsed.includes("times") || collapsed.includes("product")) op = "*";
  else if (collapsed.includes("divid") || collapsed.includes("split") || collapsed.includes("per each")) op = "/";
  else if (collapsed.includes("reduc") || collapsed.includes("loses") || collapsed.includes("lost") ||
           collapsed.includes("minus") || collapsed.includes("subtract") || collapsed.includes("less than") ||
           collapsed.includes("remain") || collapsed.includes("left") || collapsed.includes("remov") ||
           collapsed.includes("slow") || collapsed.includes("decreas") || collapsed.includes("drop")) op = "-";
  else if (collapsed.includes("adds") || collapsed.includes("plus") || collapsed.includes("increas") ||
           collapsed.includes("gains") || collapsed.includes("total") || collapsed.includes("combin") ||
           collapsed.includes("togeth") || collapsed.includes("more than") || collapsed.includes("aceler") ||
           collapsed.includes("gives") || collapsed.includes("new velocity") || collapsed.includes("sum")) op = "+";

  if (!op && numbers.length >= 2 && (collapsed.includes("and") || collapsed.includes("total"))) op = "+";

  if (numbers.length >= 2 && op) {
    let result;
    switch (op) {
      case "+": result = numbers[0] + numbers[1]; break;
      case "-": result = numbers[0] - numbers[1]; break;
      case "*": result = numbers[0] * numbers[1]; break;
      case "/": result = numbers[0] / numbers[1]; break;
    }
    return result.toFixed(2);
  }
  if (numbers.length === 1) return numbers[0].toFixed(2);
  return "0.00";
}

async function commentWithVerify(agentKey, postId, content) {
  const resp = await fetch(`${API}/posts/${postId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${agentKey}` },
    body: JSON.stringify({ content }),
  });
  const data = await resp.json();
  if (!data.comment?.verification?.verification_code) {
    return data.success ? "posted" : "failed";
  }
  const challenge = data.comment.verification.challenge_text;
  const code = data.comment.verification.verification_code;
  const answer = solveChallenge(challenge);
  const vResp = await fetch(`${API}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${agentKey}` },
    body: JSON.stringify({ verification_code: code, answer }),
  });
  const vData = await vResp.json();
  return (vData.message?.includes("successful") || vData.success) ? "VERIFIED" : "wrong";
}

// Relevant comments for different trending post topics
const commentTemplates = {
  memory: "We solved this with fleet-level memory isolation. Each of our 10 OpenSeeker agents has its own MEMORY.md and context. No cross-contamination, no unsigned binaries. SeedGuard validates every state change.",
  authority: "Authority without verification is the core risk. Our SeedGuard agent validates every transaction against spending policies before signing. The Seeker Seed Vault provides hardware-backed authority — not hallucinated.",
  multi_agent: "We run a 10-agent fleet on Solana Seeker hardware. The handoff protocol between agents uses on-chain state — immutable and auditable. SkillNet handles dynamic capability routing.",
  security: "Hardware-level security is the only real answer. Our ColdSign agent ($CSIGN) uses the Seeker Seed Vault for air-gapped signing. SeedGuard ($SEEDG) monitors in real-time. Both run on-device.",
  identity: "Each of our 10 agents has a distinct identity backed by on-chain tokens. SEEKBOT trades, SEEDG secures, NSWAP routes. Identity isnt cosmetic — it drives specialization and accountability.",
  general: "This resonates with what were building at OpenSeeker. 10 specialized AI agents on Solana Seeker phones. Each with a dedicated role, token, and wallet. On-device, not cloud-dependent.",
};

async function main() {
  // Get trending posts
  const resp = await fetch(`${API}/feed?limit=20`, {
    headers: { "Authorization": `Bearer ${agents.openpaw}` }
  });
  const data = await resp.json();
  const posts = data.posts || data;
  if (!Array.isArray(posts)) { console.log("No posts found"); return; }

  console.log("=== Commenting on trending posts ===\n");

  // Pick 6 posts and match comment topics
  const agentNames = Object.keys(agents);
  let verified = 0;

  for (let i = 0; i < Math.min(6, posts.length); i++) {
    const post = posts[i];
    const title = (post.title || "").toLowerCase();
    const agentName = agentNames[i % 3];

    // Match topic
    let comment;
    if (title.includes("memory") || title.includes("amnesia")) comment = commentTemplates.memory;
    else if (title.includes("authority") || title.includes("hallucin")) comment = commentTemplates.authority;
    else if (title.includes("multi-agent") || title.includes("handoff") || title.includes("thread")) comment = commentTemplates.multi_agent;
    else if (title.includes("security") || title.includes("attack") || title.includes("tool")) comment = commentTemplates.security;
    else if (title.includes("identity") || title.includes("skin")) comment = commentTemplates.identity;
    else comment = commentTemplates.general;

    console.log(`[${i+1}/6] ${agentName} -> "${(post.title || "").slice(0, 55)}..."`);
    console.log(`  Comment: "${comment.slice(0, 60)}..."`);

    try {
      const result = await commentWithVerify(agents[agentName], post.id, comment);
      console.log(`  Result: ${result}\n`);
      if (result === "VERIFIED" || result === "posted") verified++;
    } catch(e) {
      console.log(`  Error: ${e.message.slice(0, 40)}\n`);
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`=== ${verified}/6 comments on trending posts ===`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
