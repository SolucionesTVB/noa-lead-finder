import Link from "next/link";
import { headers } from "next/headers";
import { supabaseAdmin } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

type Analysis = {
  summary: string;
  quality_score: number; // 0–100
  conversion_probability: number; // 0–100
  reasoning: string;
  missing_info: string[];
  next_steps: string[];
};

function clamp(n: number, min = 0, max = 100) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function scoreLabel(quality: number, prob: number) {
  if (quality >= 70 || prob >= 60) return { label: "Prioridad Alta", tone: "good" as const };
  if (quality >= 40 || prob >= 25) return { label: "Prioridad Media", tone: "warn" as const };
  return { label: "Prioridad Baja", tone: "low" as const };
}

function isIncomplete(missing: string[]) {
  const hit = (k: string) => missing.some((m) => m.toLowerCase().includes(k.toLowerCase()));
  let count = 0;
  if (hit("nombre")) count++;
  if (hit("empresa")) count++;
  if (hit("tel")) count++;
  if (hit("correo") || hit("email")) count++;
  return count >= 2;
}

function badgeStyle(tone: "good" | "warn" | "low") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.03)",
  };
  if (tone === "good") return { ...base, background: "rgba(0, 128, 0, 0.08)" };
  if (tone === "warn") return { ...base, background: "rgba(255, 165, 0, 0.12)" };
  return { ...base, background: "rgba(255, 0, 0, 0.07)" };
}

function toDigits(v: any) {
  return String(v ?? "").replace(/\D+/g, "");
}

function toE164CR(v: any) {
  const d = toDigits(v);
  if (!d) return "";
  // 506 + 8 dígitos = 11
  if (d.startsWith("506") && d.length === 11) return `+${d}`;
  // 8 dígitos local CR
  if (d.length === 8) return `+506${d}`;
  // fallback
  return `+${d}`;
}

function isBadEmail(email: any) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return true;

  // Formato básico
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return true;

  const domain = e.split("@").pop() || "";

  // Dominios "placeholder"
  const placeholder = new Set([
    "example.com", "example.org", "example.net",
    "test.com", "test.org", "test.net",
    "email.com", "mail.com"
  ]);

  // Dominios temporales / desechables (lista corta pero efectiva)
  const disposable = new Set([
    "mailinator.com", "yopmail.com", "yopmail.fr", "yopmail.net",
    "guerrillamail.com", "guerrillamail.net",
    "temp-mail.org", "tempmail.com", "10minutemail.com", "10minutemail.net",
    "minuteinbox.com", "dispostable.com", "getnada.com", "trashmail.com",
    "fakeinbox.com", "maildrop.cc"
  ]);

  if (placeholder.has(domain)) return true;
  if (disposable.has(domain)) return true;

  // Cualquier dominio "example.*"
  if (domain.startswith("example.")) return true;

  // Correos demasiado obvios
  const local = e.split("@")[0] || "";
  const badLocals = ["test", "testing", "demo", "fake", "correo", "mail", "no-reply", "noreply"];
  if (badLocals.includes(local)) return true;

  return false;
}

function btnStyle(kind: "primary" | "ghost") {
  const base: React.CSSProperties = {
    borderRadius: 12,
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
    border: "1px solid rgba(0,0,0,0.15)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
  if (kind === "primary") return { ...base, background: "rgba(0,0,0,0.92)", color: "white" };
  return { ...base, background: "white", color: "black" };
}

async function getBaseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return host ? `${proto}://${host}` : "";
}

async function fetchLead(id: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Supabase error: ${error.message}`);
  if (!data) return null;
  return data as Record<string, any>;
}

async function fetchAI(id: string, lead: any) {
  const base = await getBaseUrl();
  const url = `${base}/api/leads/${encodeURIComponent(id)}/ai`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id,
      // Nivel A: SOLO datos existentes (evita inventos)
      lead: {
        full_name: lead?.full_name ?? null,
        name: lead?.name ?? lead?.nombre ?? null,
        role: lead?.role ?? lead?.cargo ?? null,
        company: lead?.company ?? lead?.empresa ?? null,
        email: lead?.email ?? null,
        phone: lead?.phone ?? lead?.whatsapp ?? null,
        whatsapp: lead?.whatsapp ?? null,
        province: lead?.province ?? lead?.provincia ?? null,
        canton: lead?.canton ?? null,
        district: lead?.district ?? null,
        source: lead?.source ?? lead?.fuente ?? null,
        notes: lead?.notes ?? lead?.notas ?? null,
        insurer: lead?.insurer ?? lead?.aseguradora ?? null,
        updated_at: lead?.updated_at ?? null,
        created_at: lead?.created_at ?? null,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`AI endpoint falló (${res.status}). ${txt?.slice(0, 240) ?? ""}`);
  }

  const data = await res.json();
  return data as { ok: boolean; id: string; analysis: Analysis; version?: string };
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let lead: Record<string, any> | null = null;
  let payload: { ok: boolean; id: string; analysis: Analysis; version?: string } | null = null;
  let errMsg = "";

  try {
    lead = await fetchLead(id);
    if (!lead) {
      errMsg = `No encontré el lead en Supabase: id = ${id}`;
    } else {
      payload = await fetchAI(id, lead);
    }
  } catch (e: any) {
    const msg = e?.message ?? "Error inesperado";
    if (String(msg).toLowerCase().includes("aborted") || String(msg).toLowerCase().includes("abort")) {
      errMsg = "NOA está analizando (tardó más de lo normal). Recargá en 10–15s.";
    } else {
      errMsg = msg;
    }
  }

  const analysis = payload?.analysis;
  const quality = clamp(analysis?.quality_score ?? 0);
  const prob = clamp(analysis?.conversion_probability ?? 0);
  const verdict = scoreLabel(quality, prob);
  const incomplete = analysis ? isIncomplete(analysis.missing_info ?? []) : false;

  const copyText = analysis
    ? [
        `NOA — Lead ${id}`,
        `Veredicto: ${verdict.label}${incomplete ? " (Incompleto)" : ""}`,
        `Quality: ${quality}/100 | Prob: ${prob}/100`,
        payload?.version ? `Versión motor: ${payload.version}` : "",
        "",
        `Resumen: ${analysis.summary}`,
        "",
        `Por qué: ${analysis.reasoning}`,
        "",
        `Faltantes:`,
        ...(analysis.missing_info ?? []).map((x) => `- ${x}`),
        "",
        `Acciones de hoy:`,
        ...(analysis.next_steps ?? []).map((x) => `- ${x}`),
      ].filter(Boolean).join("\n")
    : `NOA — Lead ${id}\nNo se pudo generar análisis.\n${errMsg}`;

  // Links de contacto (no inventa: usa lo que venga del lead)
  const phoneRaw = lead?.whatsapp ?? lead?.phone ?? "";
  const phoneE164 = toE164CR(phoneRaw);
  const wa = phoneE164 ? `https://wa.me/${phoneE164.replace("+", "")}` : "";
  const callE164 = toE164CR(lead?.phone || lead?.whatsapp);
  const tel = callE164 ? `tel:${callE164}` : "";
  const copyValue = String(callE164 || lead?.phone || lead?.whatsapp || "");

  const email = lead?.email ?? "";
  const emailOk = !!email && !isBadEmail(email);

  const subject = encodeURIComponent("NOA — Validación rápida de tu solicitud");
  const body = encodeURIComponent(
    `Hola ${lead?.full_name ?? ""},\n\nSoy [TU NOMBRE] de NOA. Solo para confirmar: ¿cuál es tu empresa y tu rol?\n\n¿Te sirve una llamada de 10 min hoy o mañana?\n\nPura vida.`
  );
  const mail = emailOk ? `mailto:${email}?subject=${subject}&body=${body}` : "";

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Lead: {id}</h1>
            {analysis && <span style={badgeStyle(verdict.tone)}>{verdict.label}</span>}
            {analysis && incomplete && <span style={{ ...badgeStyle("warn"), fontWeight: 900 }}>Incompleto</span>}
          </div>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Detalle del Lead (Nivel A): datos existentes + detección de faltantes. Sin scraping activo.
          </p>
        </div>

        <Link href="/leads" style={{ textDecoration: "none" }}>
          <button style={{ border: "1px solid rgba(0,0,0,0.15)", background: "white", padding: "10px 12px", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>
            ← Volver
          </button>
        </Link>
      </div>

      {lead && (
        <section style={{ marginTop: 12, padding: 14, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontWeight: 950 }}>Acciones rápidas</div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                1 clic para contactar. WhatsApp abre sin texto. Llamar usa teléfono o WhatsApp. Si el correo es “example.com”, no lo usamos.
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              Contacto: <b>{lead.full_name ?? "—"}</b>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={wa || "#"} rel="noreferrer" style={btnStyle("primary")} aria-disabled={!wa}>
              💬 WhatsApp
            </a>

            <a href={tel || "#"} style={btnStyle("ghost")} aria-disabled={!tel}>
              📞 Llamar
            </a>

            <button
              type="button"
              style={btnStyle("ghost")}
              disabled={!copyValue}
              onClick={async () => {
                if (!copyValue) return;
                try {
                  await navigator.clipboard.writeText(copyValue);
                } catch (e) {
                  // si clipboard falla, no rompemos UX
                }
              }}
            >
              📋 Copiar número
            </button>


            {emailOk ? (
              <a href={mail} style={btnStyle("ghost")}>
                ✉️ Correo
              </a>
            ) : (
              <span style={{ fontSize: 12, opacity: 0.75, padding: "10px 12px" }}>
                ✉️ Correo: <b>no usable</b> (example.com)
              </span>
            )}

            {!callE164 && (
              <span style={{ fontSize: 12, opacity: 0.75, padding: "10px 12px" }}>
                ⚠️ Sin teléfono válido
              </span>
            )}
          </div>
        </section>
      )}

      {!analysis ? (
        <section style={{ marginTop: 16, padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(255,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>No se pudo generar el análisis</h2>
          <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>{errMsg}</p>
        </section>
      ) : (
        <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 16 }}>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>QUALITY SCORE</div>
              <div style={{ fontSize: 42, fontWeight: 950, marginTop: 6 }}>{quality}</div>
              <div style={{ opacity: 0.75 }}>de 100</div>
            </div>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>PROBABILIDAD DE CONVERSIÓN</div>
              <div style={{ fontSize: 42, fontWeight: 950, marginTop: 6 }}>{prob}</div>
              <div style={{ opacity: 0.75 }}>de 100</div>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>¿Vale la pena?</h2>
              <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>{analysis.summary}</p>
            </div>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>¿Por qué?</h2>
              <p style={{ marginTop: 8, marginBottom: 0, opacity: 0.85 }}>{analysis.reasoning}</p>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 }}>
            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>¿Qué info falta?</h2>
              <ul style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                {(analysis.missing_info ?? []).map((x, i) => (
                  <li key={i} style={{ opacity: 0.9 }}>{x}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>¿Qué hacer hoy?</h2>
              <ol style={{ marginTop: 10, marginBottom: 0, paddingLeft: 18, lineHeight: 1.55 }}>
                {(analysis.next_steps ?? []).map((x, i) => (
                  <li key={i} style={{ opacity: 0.9, marginBottom: 6 }}>{x}</li>
                ))}
              </ol>
            </div>
          </section>

          <section style={{ marginTop: 12, padding: 16, borderRadius: 16, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 950 }}>Resumen para copiar</h2>
            <textarea
              readOnly
              value={copyText}
              style={{
                width: "100%",
                height: 220,
                marginTop: 10,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.45,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
              }}
            />
          </section>
        </>
      )}

      <footer style={{ marginTop: 18, paddingTop: 14, opacity: 0.65, fontSize: 12 }}>
        No somos un software, somos productividad inteligente.
      </footer>
    </main>
  );
}
