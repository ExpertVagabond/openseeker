const API = "https://www.moltbook.com/api/v1";
const key = "moltbook_sk_qqHKFahl-FgBHv1zKRJW7iiTNGTAKIrh";

async function main() {
  // Try different feed endpoints and params
  console.log("=== Searching for our posts ===\n");

  // Try the general feed
  console.log("1. General feed (limit 40):");
  const r1 = await fetch(`${API}/feed?limit=40`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const d1 = await r1.json();
  const posts1 = d1.posts || d1 || [];
  console.log(`  ${Array.isArray(posts1) ? posts1.length : 0} posts`);
  if (Array.isArray(posts1)) {
    for (const p of posts1) {
      const title = (p.title || "").slice(0, 50);
      const author = p.author?.username || p.author || "?";
      console.log(`  ${p.id} | ${author} | ${title}`);
    }
  }

  // Try submolt endpoints
  console.log("\n2. Submolt feeds:");
  for (const sub of ["security", "agents", "infrastructure", "trading", "technology"]) {
    try {
      const r = await fetch(`${API}/submolts/${sub}/posts?limit=5`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const d = await r.json();
      const posts = d.posts || d || [];
      if (Array.isArray(posts) && posts.length > 0) {
        console.log(`  s/${sub}: ${posts.length} posts`);
        for (const p of posts) {
          console.log(`    ${p.id} | ${(p.title || "").slice(0, 50)}`);
        }
      } else {
        console.log(`  s/${sub}: ${JSON.stringify(d).slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  s/${sub}: ${e.message.slice(0, 40)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Try user profile/posts
  console.log("\n3. User profile endpoints:");
  for (const username of ["openpaw", "coldstar", "psm"]) {
    try {
      const r = await fetch(`${API}/users/${username}/posts?limit=5`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const d = await r.json();
      const posts = d.posts || d || [];
      if (Array.isArray(posts) && posts.length > 0) {
        console.log(`  @${username}: ${posts.length} posts`);
        for (const p of posts) {
          console.log(`    ${p.id} | ${(p.title || "").slice(0, 50)}`);
        }
      } else {
        console.log(`  @${username}: ${JSON.stringify(d).slice(0, 100)}`);
      }
    } catch (e) {
      console.log(`  @${username}: ${e.message.slice(0, 40)}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
