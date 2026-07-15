import { ImageResponse } from "@vercel/og";
import { fetchPublicChallenge, modeLabel } from "../server/publicChallenge";

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let challenge;
  try { challenge = await fetchPublicChallenge(url.searchParams.get("slug") ?? ""); }
  catch { challenge = { status: "missing" as const }; }
  const active = challenge.status === "active";
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", alignItems: "center", justifyContent: "center", overflow: "hidden", color: "#f5fbff", background: "linear-gradient(145deg,#0a2940,#02070d 60%,#0b1725)", fontFamily: "sans-serif" }}>
      <div style={{ position: "absolute", width: 720, height: 720, left: -240, top: -300, borderRadius: 720, background: "#1b9fc955" }} />
      <div style={{ position: "absolute", width: 560, height: 560, right: -190, bottom: -330, borderRadius: 560, background: "#d6a93d33" }} />
      <div style={{ width: 1050, display: "flex", flexDirection: "column", alignItems: "center", padding: 58, border: "2px solid #79e5f444", borderRadius: 46, background: "#06131edE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#79e5f4", fontSize: 25, fontWeight: 800, letterSpacing: 5, textTransform: "uppercase" }}><span style={{ display: "flex", width: 64, height: 64, alignItems: "center", justifyContent: "center", border: "2px solid #79e5f466", borderRadius: 18 }}>RR</span> Rink Rivals</div>
        <div style={{ display: "flex", marginTop: 45, color: "#f6d98b", fontSize: 22, fontWeight: 800, letterSpacing: 7, textTransform: "uppercase" }}>Ghost Rivalry</div>
        <div style={{ display: "flex", marginTop: 15, fontSize: 72, fontWeight: 900, lineHeight: .92, textAlign: "center", textTransform: "uppercase" }}>{active ? `${challenge.creator_label ?? "A rival"}'s five await.` : "This rivalry is over."}</div>
        <div style={{ display: "flex", marginTop: 32, gap: 18, color: "#a9c6d3", fontSize: 25 }}>
          {active ? <><span>{modeLabel(challenge.mode)}</span><span>·</span><span>{challenge.challenge_strength ?? 0} OVR ghost</span><span>·</span><span>{challenge.difficulty}</span></> : <span>Open Rink Rivals for a fresh matchup.</span>}
        </div>
        <div style={{ display: "flex", marginTop: 38, color: "#7192a1", fontSize: 18, letterSpacing: 2, textTransform: "uppercase" }}>Five locked choices. Your lineup. Settle it.</div>
      </div>
    </div>,
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } },
  );
}
