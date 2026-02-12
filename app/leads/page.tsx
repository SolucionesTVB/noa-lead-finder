import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabase-server";

export const dynamic = "force-dynamic";

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function badge(text: string, tone: "good" | "warn" | "low") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(0,0,0,0.03)",
    whiteSpace: "nowrap",
  };
  if (tone === "good") return <span style={{ ...base, background: "rgba(0, 128, 0, 0.08)" }}>{text}</span>;
  if (tone === "warn") return <span style={{ ...base, background: "rgba(255, 165, 0, 0.12)" }}>{text}</span>;
  return <span style={{ ...base, background: "rgba(255, 0, 0, 0.07)" }}>{text}</span>;
}

function qualityTone(q: number) {
  if (q >= 70) return "good";
  if (q >= 40) return "warn";
  return "low";
}

export default async function LeadsHome() {
  const sb = supabaseAdmin();

  // ✅ Selección “segura”: solo campos que sabemos que existen en tu tabla actual
  const { data, error } = await sb
    .from("leads")
    .select("id,full_name,phone,email,province,canton,source,created_at,analysis_json,analysis_version,analyzed_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const leads = data ?? [];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Leads</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Últimos 50 (ordenados por fecha de creación). Click para ver detalle y análisis.
          </p>
        </div>

        <div style={{ opacity: 0.7, fontSize: 12 }}>
          {error ? `Error Supabase: ${error.message}` : `Total mostrado: ${leads.length}`}
        </div>
      </div>

      <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "rgba(0,0,0,0.03)", border: "1px solid rgba(0,0,0,0.08)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {badge("Fuente: Supabase", "warn")}
          {badge("AI: cache 24h", "good")}
          <span style={{ opacity: 0.8, fontSize: 12 }}>
            Tip: si un lead tarda en cargar en detalle, es porque está generando el análisis (solo la primera vez).
          </span>
        </div>
      </div>

      <div style={{ marginTop: 14, overflowX: "auto", borderRadius: 14, border: "1px solid rgba(0,0,0,0.10)", background: "white" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.03)" }}>
              {["Lead", "Contacto", "Ubicación", "Canales", "AI", "Creado"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 12, borderBottom: "1px solid rgba(0,0,0,0.10)", fontSize: 12, letterSpacing: 0.3, opacity: 0.8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {leads.map((l: any) => {
              const id = l.id as string;

              const analyzedAt = l.analyzed_at ? new Date(l.analyzed_at).toLocaleString() : null;
              const analysis = l.analysis_json as any;
              const q = analysis?.quality_score;
              const p = analysis?.conversion_probability;

              const qn = Number(q);
              const pn = Number(p);

              let prioridad = "Sin análisis";
              let tone: "good" | "warn" | "low" = "low";

              if (Number.isFinite(qn) && Number.isFinite(pn)) {
                if (qn >= 70 && pn >= 40) { prioridad = "Prioridad Alta"; tone = "good"; }
                else if (qn >= 40 && pn >= 20) { prioridad = "Prioridad Media"; tone = "warn"; }
                else { prioridad = "Prioridad Baja"; tone = "low"; }
              }

              const aiStatus = Number.isFinite(qn) && Number.isFinite(pn)
                ? (
                    <div>
                      {badge(prioridad, tone)}
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>Calidad: {Math.round(qn)}/100</div>
                      <div style={{ marginTop: 2, fontSize: 11, opacity: 0.85 }}>Prob. conversión: {Math.round(pn)}/100</div>
                      <div
                        style={{ marginTop: 2, fontSize: 11, opacity: 0.55 }}
                        title="Calidad: completitud/encaje del lead. Prob. conversión: probabilidad estimada de que avance."
                      >
                        ¿Qué significa?
                      </div>
                    </div>
                  )
                : badge("Sin análisis", "low");

              const createdAt = l.created_at ? new Date(l.created_at).toLocaleString() : "—";

              return (
                <tr key={id}>
                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <Link href={`/leads/${encodeURIComponent(id)}`} style={{ fontWeight: 900, textDecoration: "none" }}>
                      {id.slice(0, 8)}…
                    </Link>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.7 }}>Fuente: {fmt(l.source)}</div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <div style={{ fontWeight: 800 }}>{fmt(l.full_name)}</div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <div style={{ fontWeight: 800 }}>{fmt(l.province)}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{fmt(l.canton)}</div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>📧 {fmt(l.email)}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>📱 {fmt(l.phone)}</div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    {aiStatus}
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>{analyzedAt ? `Cache: ${analyzedAt}` : "—"}</div>
                  </td>

                  <td style={{ padding: 12, borderBottom: "1px solid rgba(0,0,0,0.08)" }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{createdAt}</div>
                  </td>
                </tr>
              );
            })}

            {leads.length === 0 && !error && (
              <tr>
                <td colSpan={6} style={{ padding: 16, opacity: 0.8 }}>
                  No hay leads para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer style={{ marginTop: 18, paddingTop: 14, opacity: 0.65, fontSize: 12 }}>
        No somos un software, somos productividad inteligente.
      </footer>
    </main>
  );
}
