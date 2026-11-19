/* eslint-disable react-refresh/only-export-components -- standalone MCP App entrypoint */
import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { cmsDraftSuccessMessage, reviewDeliveryState, toolResultError } from "./review-card";

type Check = { status: "pass" | "warning" | "blocker"; label: string; detail?: string };
type Destination = { id: string; display_name: string; provider: string; status: string; credential_status: "usable" | "missing" | "undecryptable" };
type Review = {
  post: { id: string; title: string; summary?: string | null; updated_at: string; web_url: string };
  source: { type: string; reference?: string | null };
  editorial: { state: string; revision_number?: number | null };
  changes: { changed_fields: string[]; word_delta: number };
  preflight: { checks: Array<Check & { message?: string }>; has_blockers: boolean };
  destinations: Destination[];
  permissions: { can_push_cms_draft: boolean };
};

function resultData(value: unknown) {
  const structured = value && typeof value === "object" ? (value as { structuredContent?: unknown }).structuredContent : null;
  if (!structured || typeof structured !== "object") return null;
  const data = (structured as { data?: unknown }).data;
  return data && typeof data === "object" ? data as Record<string, unknown> : null;
}

function ReviewCard() {
  const [review, setReview] = useState<Review | null>(null);
  const [destinationId, setDestinationId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "warning" | "error">("success");
  const [externalUrl, setExternalUrl] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const onToolResult = useCallback((result: unknown) => {
    const data = resultData(result);
    const next = data?.review as Review | undefined;
    if (next) {
      setReview(next);
      const usable = next.destinations.filter((destination) => destination.status === "connected" && destination.credential_status === "usable");
      setDestinationId(usable.length === 1 ? usable[0].id : "");
      setExternalUrl("");
      setNeedsReload(false);
      setMessage("");
    }
  }, []);
  const { app, isConnected, error } = useApp({
    appInfo: { name: "BlogFactory Review Card", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (instance) => { instance.ontoolresult = onToolResult; },
  });

  const pushDraft = async () => {
    if (!app || !review || !destinationId) return;
    setBusy(true);
    setMessage("");
    setMessageTone("error");
    try {
      const result = await app.callServerTool({
        name: "push_to_cms_draft",
        arguments: {
          post_id: review.post.id,
          integration_id: destinationId,
          expected_updated_at: review.post.updated_at,
          post_type: "post",
        },
      });
      const data = resultData(result);
      const resultError = toolResultError(result);
      if (result.isError || !data) {
        if (resultError?.code === "conflict") {
          setNeedsReload(true);
          setMessageTone("warning");
        } else setMessageTone("error");
        throw new Error(resultError ? `${resultError.message}${resultError.nextAction ? ` ${resultError.nextAction}` : ""}` : "CMS draft delivery failed. Review the provider connection and retry.");
      }
      const nextExternalUrl = data.external_edit_url || data.external_url;
      setExternalUrl(typeof nextExternalUrl === "string" && /^https?:\/\//i.test(nextExternalUrl) ? nextExternalUrl : "");
      setMessageTone("success");
      setMessage(cmsDraftSuccessMessage(Boolean(data.deduplicated)));
      setConfirming(false);
    } catch (pushError) {
      setMessage(pushError instanceof Error ? pushError.message : "CMS draft delivery failed.");
    } finally {
      setBusy(false);
    }
  };

  const reloadReview = async () => {
    if (!app || !review) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await app.callServerTool({ name: "review_post", arguments: { post_id: review.post.id } });
      const data = resultData(result);
      const next = data?.review as Review | undefined;
      if (!next) throw new Error(toolResultError(result)?.message || "Review could not be reloaded.");
      const usable = next.destinations.filter((destination) => destination.status === "connected" && destination.credential_status === "usable");
      setReview(next);
      setDestinationId(usable.length === 1 ? usable[0].id : "");
      setExternalUrl("");
      setNeedsReload(false);
      setMessageTone("success");
    } catch (reloadError) {
      setMessageTone("error");
      setMessage(reloadError instanceof Error ? reloadError.message : "Review could not be reloaded.");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <main className="state-screen error"><span className="state-dot" /><strong>Review Card could not connect</strong><p>{error.message}</p></main>;
  if (!isConnected || !review) return <main className="state-screen" aria-busy="true"><span className="spinner" /><strong>Loading review</strong><p>Reading the latest saved revision and delivery checks…</p></main>;
  const deliveryState = reviewDeliveryState({ hasPermission: review.permissions.can_push_cms_draft, hasBlockers: review.preflight.has_blockers, destinationId });
  const canPush = deliveryState.allowed;
  const selectedDestination = review.destinations.find((destination) => destination.id === destinationId);
  const deliveryLabel = deliveryState.reason === "read_only" ? "Review only" : deliveryState.reason === "blocker" ? "Blocked" : deliveryState.reason === "destination_required" ? "Choose destination" : "Ready to send";
  const deliveryDetail = deliveryState.reason === "read_only" ? "This connection does not have publish:draft permission." : deliveryState.reason === "blocker" ? "Resolve the blocker checks in BlogFactory before delivery." : deliveryState.reason === "destination_required" ? "Select one ready CMS destination to continue." : `Draft delivery to ${selectedDestination?.display_name || "the selected CMS"}.`;

  return <main aria-busy={busy}>
    <header><div className="header-rail"><span>BlogFactory · Review Card</span><b className={`state-pill ${deliveryState.reason || "ready"}`}><i />{deliveryLabel}</b></div><strong>{review.post.title}</strong><p>{review.post.summary || "No summary available."}</p></header>
    <section className={`delivery-state ${deliveryState.reason || "ready"}`}><div><small>Delivery state</small><b>{deliveryLabel}</b><span>{deliveryDetail}</span></div><span className="draft-lock">Draft only</span></section>
    <section className="facts">
      <div><small>Source & provenance</small><b>{review.source.type.replace(/_/g, " ")}</b><span>{review.source.reference || "No source reference"}</span></div>
      <div><small>Editorial</small><b>{review.editorial.state.replace(/_/g, " ")}</b><span>Revision {review.editorial.revision_number || "—"}</span></div>
      <div><small>Latest change</small><b>{review.changes.changed_fields.length ? review.changes.changed_fields.join(", ") : "No field changes"}</b><span>{review.changes.word_delta >= 0 ? "+" : ""}{review.changes.word_delta} words</span></div>
    </section>
    <section><div className="section-title"><h2>Preflight</h2><span>{review.preflight.checks.filter((check) => check.status === "pass").length}/{review.preflight.checks.length} passed</span></div><div className="check-grid">{review.preflight.checks.map((check) => <div className={`check ${check.status}`} key={check.label}><i /> <span><b>{check.label}</b>{(check.detail || check.message) && <small>{check.detail || check.message}</small>}</span></div>)}</div></section>
    <section><div className="section-title"><h2>CMS destination</h2><span>{review.destinations.filter((destination) => destination.status === "connected" && destination.credential_status === "usable").length} ready</span></div><select aria-label="CMS destination" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>
      <option value="">Choose a destination</option>
      {review.destinations.map((destination) => { const usable = destination.status === "connected" && destination.credential_status === "usable"; return <option key={destination.id} value={destination.id} disabled={!usable}>{destination.display_name} · {destination.provider}{usable ? "" : " · needs attention"}</option>; })}
    </select></section>
    <footer>
      <button className="secondary" onClick={() => app?.openLink({ url: review.post.web_url })}>Review in BlogFactory</button>
      {needsReload ? <button disabled={busy} onClick={reloadReview}>{busy ? "Reloading…" : "Reload latest revision"}</button> : !confirming ? <button disabled={!canPush} onClick={() => setConfirming(true)}>Send CMS draft</button> : <div className="confirm"><span><b>Send to {selectedDestination?.display_name}?</b><small>Creates a draft. Never publishes live.</small></span><button className="secondary" onClick={() => setConfirming(false)}>Cancel</button><button disabled={busy} onClick={pushDraft}>{busy ? "Sending…" : "Confirm draft"}</button></div>}
    </footer>
    {message && <p className={`notice ${messageTone}`} role="status" aria-live="polite">{message}</p>}
    {externalUrl && <button className="secondary external" onClick={() => app?.openLink({ url: externalUrl })}>Open CMS draft</button>}
  </main>;
}

const style = document.createElement("style");
style.textContent = `
:root{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#303235;background:#f5f5f1;color-scheme:light}
*{box-sizing:border-box}body{margin:0}button,select{font:inherit}button:focus-visible,select:focus-visible{outline:2px solid #ff5a1f;outline-offset:2px}
main{max-width:760px;margin:auto;padding:16px}header,section,footer,.notice,.external{background:#fff;border:1px solid #d7d8d4;border-radius:6px;box-shadow:0 1px 0 rgba(35,37,39,.08);margin-bottom:10px}
header{display:grid;gap:8px;padding:18px;border-top:3px solid #2f8bc8}.header-rail,.section-title{display:flex;align-items:center;justify-content:space-between;gap:12px}.header-rail>span,h2,.section-title>span,small{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:.045em;text-transform:uppercase;color:#686b70}
header>strong{font-size:22px;line-height:1.22;overflow-wrap:anywhere}p{margin:0;color:#5f6368;font-size:13px;line-height:1.55}.state-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #cfd1cd;border-radius:3px;padding:4px 7px;font-size:10px;text-transform:uppercase}.state-pill i,.state-dot{width:7px;height:7px;border-radius:50%;background:#178653}.state-pill.blocker i,.state-pill.read_only i{background:#d43e32}.state-pill.destination_required i{background:#c77900}
.delivery-state{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;border-left:3px solid #178653}.delivery-state.blocker,.delivery-state.read_only{border-left-color:#d43e32}.delivery-state.destination_required{border-left-color:#c77900}.delivery-state>div{display:grid;gap:3px}.delivery-state b{font-size:14px}.delivery-state span{font-size:12px;color:#686b70}.draft-lock{flex:none;border:1px solid #303235;border-radius:3px;padding:5px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px!important;font-weight:700;text-transform:uppercase;color:#303235!important}
section{padding:16px}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;padding:0}.facts div{display:grid;gap:4px;min-width:0;padding:14px 16px;border-right:1px solid #e4e5e1}.facts div:last-child{border-right:0}.facts b{font-size:13px;overflow-wrap:anywhere}.facts span{font-size:11px;color:#686b70;overflow-wrap:anywhere}.section-title{margin-bottom:10px}.section-title h2{margin:0;color:#303235}.section-title>span{font-weight:500}.check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid #e4e5e1;border-radius:4px;overflow:hidden}.check{display:flex;gap:9px;min-width:0;padding:10px;border-bottom:1px solid #e4e5e1}.check:nth-child(odd){border-right:1px solid #e4e5e1}.check:last-child:nth-child(odd){grid-column:1/-1;border-right:0;border-bottom:0}.check i{width:8px;height:8px;flex:none;margin-top:4px;border-radius:50%;background:#178653}.check.warning i{background:#c77900}.check.blocker i{background:#d43e32}.check span{display:grid;gap:3px;min-width:0}.check b{font-size:12px}.check small{font-family:inherit;font-size:11px;font-weight:400;line-height:1.4;letter-spacing:0;text-transform:none;overflow-wrap:anywhere}
select,button{min-height:38px;border:1px solid #aeb1ad;border-radius:4px;background:#fff;padding:0 12px;color:#303235}select{width:100%}button{background:#ff5a1f;color:#fff;border-color:#ff5a1f;font-weight:700;cursor:pointer}button:hover:not(:disabled){filter:brightness(.97)}button:disabled{opacity:.42;cursor:not-allowed}.secondary{background:#fff;color:#303235;border-color:#303235}.external{width:100%;margin-top:0}.external,.notice{padding:10px 12px}.notice{font-size:12px}.notice.success{border-color:rgba(23,134,83,.35);background:#f2faf6;color:#176b48}.notice.warning{border-color:rgba(199,121,0,.4);background:#fff8e8;color:#845300}.notice.error{border-color:rgba(212,62,50,.35);background:#fff4f2;color:#a92f27}
footer{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:12px}.confirm{display:flex;gap:8px;align-items:center}.confirm>span{display:grid;gap:2px;margin-right:4px;font-size:12px}.confirm small{font-family:inherit;font-size:10px;font-weight:400;letter-spacing:0;text-transform:none}.state-screen{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center}.state-screen.error .state-dot{background:#d43e32}.spinner{width:20px;height:20px;border:2px solid #d7d8d4;border-top-color:#2f8bc8;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:600px){main{padding:10px}.facts,.check-grid{grid-template-columns:1fr}.facts div{border-right:0;border-bottom:1px solid #e4e5e1}.facts div:last-child{border-bottom:0}.check{border-right:0!important}.check:nth-last-child(2){border-bottom:1px solid #e4e5e1}.delivery-state{align-items:flex-start}.draft-lock{margin-top:1px}footer,.confirm{align-items:stretch;flex-direction:column}.confirm>span{margin:0 0 4px}.header-rail{align-items:flex-start;flex-direction:column}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}.spinner{animation:none}}
`;
document.head.append(style);
createRoot(document.getElementById("root")!).render(<ReviewCard />);
