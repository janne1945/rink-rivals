import { fetchPublicChallenge, modeLabel } from "../server/publicChallenge";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  let challenge;
  try { challenge = await fetchPublicChallenge(slug); }
  catch { challenge = { status: "missing" as const }; }
  const active = challenge.status === "active";
  const creator = escapeHtml(challenge.creator_label ?? "A rival");
  const title = active ? `${creator} challenged you in Rink Rivals` : "Ghost Rivalry unavailable";
  const description = active
    ? `Five choices are locked. Bring your ${modeLabel(challenge.mode)} lineup and beat a ${challenge.challenge_strength ?? 0} OVR ghost.`
    : "This Ghost Rivalry has expired, was revoked, or could not be found.";
  const canonical = `${url.origin}/c/${encodeURIComponent(slug.toLowerCase())}`;
  const ogImage = `${url.origin}/api/challenge-og?slug=${encodeURIComponent(slug.toLowerCase())}`;
  const action = active ? `/accept/${encodeURIComponent(slug.toLowerCase())}` : "/";
  const actionLabel = active ? "Sign in to face the ghost" : "Open Rink Rivals";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Rink Rivals"><meta property="og:title" content="${title}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${escapeHtml(description)}"><meta name="twitter:image" content="${ogImage}">
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:#f5fbff;background:radial-gradient(circle at 20% 15%,#123a55,#030912 45%,#07111c);font-family:system-ui,sans-serif}.card{width:min(760px,100%);padding:clamp(32px,8vw,72px);border:1px solid #244b60;border-radius:32px;background:#071521eF;box-shadow:0 40px 120px #0009;text-align:center}.mark{display:inline-grid;width:52px;aspect-ratio:1;place-items:center;border:1px solid #79e5f466;border-radius:15px;color:#79e5f4;font-weight:900}.kicker{margin:25px 0 8px;color:#f6d98b;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;font-size:clamp(42px,9vw,82px);line-height:.83;text-transform:uppercase}p{margin:22px auto;color:#9cb8c6;line-height:1.6}.cta{display:inline-grid;min-height:52px;padding:0 24px;place-items:center;border-radius:999px;color:#031018;background:#79e5f4;font-weight:900;text-decoration:none;text-transform:uppercase}.note{font-size:11px;color:#64808e}</style></head>
<body><main class="card"><span class="mark">RR</span><p class="kicker">Ghost Rivalry</p><h1>${active ? `${creator}'s five await.` : "Final horn."}</h1><p>${escapeHtml(description)}</p><a class="cta" href="${action}">${actionLabel}</a><p class="note">No entry fee · no economy rewards · hidden server-locked choices</p></main></body></html>`;
  return new Response(html, { status: active ? 200 : 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600", "X-Content-Type-Options": "nosniff" } });
}
