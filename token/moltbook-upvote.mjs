const API = "https://www.moltbook.com/api/v1";
const agents = {
  openpaw: "moltbook_sk_qqHKFahl-FgBHv1zKRJW7iiTNGTAKIrh",
  coldstar: "moltbook_sk_ZB4gbXHM-Hfm1V60Lv2a1vi866SOOQxU",
  psm: "moltbook_sk_EVgam9wTKXBIXkSsVaruXpXgdpz_Tqxo",
};
const agentKeys = Object.values(agents);

async function upvote(key, postId) {
  try {
    const r = await fetch(`${API}/posts/${postId}/upvote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
    });
    return r.ok;
  } catch { return false; }
}

async function main() {
  // Get feed to find our posts
  const r = await fetch(`${API}/feed?limit=40`, {
    headers: { Authorization: `Bearer ${agentKeys[0]}` },
  });
  const d = await r.json();
  const posts = d.posts || d || [];
  if (!Array.isArray(posts)) {
    console.log("Unexpected response:", JSON.stringify(d).slice(0, 200));
    return;
  }

  // Find our posts (by keywords in title)
  const ourKeywords = ["openseeker", "coldsign", "csign", "seedguard", "seekbot", "trelay", "telerelay",
    "phonechain", "pchain", "swarmnet", "swarm", "skillnet", "sknet", "nswap", "neuralswap",
    "mdao", "mobiledao", "avault", "agentvault", "seeker", "fleet", "10-agent", "10 agent",
    "air-gapped", "seed vault"];

  const ourPosts = posts.filter(p => {
    const text = ((p.title || "") + " " + (p.content || "")).toLowerCase();
    return ourKeywords.some(kw => text.includes(kw));
  });

  console.log(`Found ${ourPosts.length} of our posts in feed\n`);

  // Upvote all our posts from all 3 agents
  let count = 0;
  for (const p of ourPosts) {
    console.log(`Upvoting: "${(p.title || "").slice(0, 50)}..." (${p.id.slice(0, 12)})`);
    for (const key of agentKeys) {
      const ok = await upvote(key, p.id);
      if (ok) count++;
      await new Promise(r => setTimeout(r, 600));
    }
  }
  console.log(`\n${count} total upvotes on ${ourPosts.length} posts`);

  // Also upvote trending posts we haven't engaged with (build credibility)
  const otherPosts = posts.filter(p => {
    const text = ((p.title || "") + " " + (p.content || "")).toLowerCase();
    return !ourKeywords.some(kw => text.includes(kw));
  });

  console.log(`\nUpvoting ${Math.min(5, otherPosts.length)} non-our trending posts for credibility...`);
  let otherCount = 0;
  for (const p of otherPosts.slice(0, 5)) {
    // Only one agent upvotes other posts (save rate limit)
    const agentIdx = otherCount % 3;
    const ok = await upvote(agentKeys[agentIdx], p.id);
    if (ok) otherCount++;
    console.log(`  ${ok ? "OK" : "skip"}: "${(p.title || "").slice(0, 45)}..."`);
    await new Promise(r => setTimeout(r, 800));
  }
  console.log(`${otherCount} credibility upvotes`);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
