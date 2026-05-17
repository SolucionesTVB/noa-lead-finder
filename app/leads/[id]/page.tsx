import Link from "next/link";
import { supabaseAdmin } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

type LeadRow = Record<string, any>;

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function statusBadge(status: string | null) {
  if (status === "CLOSED") return { text: "CLOSED", color: "#d6e4ff", bg: "#10239e", border: "#597ef7" };
  if (status === "NEGOTIATING") return { text: "NEGOTIATING", color: "#ffd6e7", bg: "#3a1026", border: "#eb2f96" };
  if (status === "QUOTED") return { text: "QUOTED", color: "#ffe7ba", bg: "#3a2400", border: "#fa8c16" };
  if (status === "EVALUATING") return { text: "EVALUATING", color: "#fff1b8", bg: "#332b00", border: "#fadb14" };
  if (status === "INTERESTED") return { text: "INTERESTED", color: "#73d13d", bg: "#102a12", border: "#237b2d" };
  if (status === "CONTACTED") return { text: "CONTACTED", color: "#ffc53d", bg: "#2b2111", border: "#ad6800" };
  if (status === "LOST") return { text: "LOST", color: "#ffccc7", bg: "#2a0f0f", border: "#a8071a" };
  return { text: "NEW", color: "#cbd5e1", bg: "#111827", border: "#334155" };
}

function isValidLeadId(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (s === "ID_DEL_LEAD") return false;
  return s.includes("-");
}

function firstName(name: any) {
  return String(name ?? "").trim().split(" ")[0] || "el contacto";
}

function cleanTerm(text: any) {
  const raw = String(text ?? "").trim();

  const map: Record<string, string> = {
    role_title: "cargo",
    company: "empresa",
    district: "distrito",
    province: "provincia",
    canton: "cantón",
    notes: "notas",
    source_url: "URL de origen",
    insurance_company: "aseguradora",
    activity_level: "nivel de actividad",
    profile_completeness: "completitud del perfil",
    commercial_intent: "intención comercial",
    recommended_action: "acción recomendada",
    has_email: "tiene correo",
    has_phone: "tiene teléfono",
    has_whatsapp: "tiene WhatsApp",
    high: "alto",
    medium: "medio",
    low: "bajo",
    true: "sí",
    false: "no",
  };

  return map[raw] ?? raw.replaceAll("_", " ");
}

function cleanInternalText(text: any) {
  const raw = String(text ?? "").trim();
  if (!raw) return "Sin resumen disponible.";

  return raw
    .replaceAll("Vale la pena perseguir este lead.", "Este contacto muestra señales positivas para seguimiento.")
    .replaceAll("Sí vale la pena perseguir.", "Este contacto muestra señales positivas para seguimiento.")
    .replaceAll("lead", "contacto")
    .replaceAll("Lead", "Contacto")
    .replaceAll("[tu nombre]", "Tony")
    .replaceAll("CRM", "sistema")
    .replaceAll("máx", "máximo");
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Alto potencial";
  if (score >= 50) return "Potencial medio";
  return "Requiere validación";
}

function buildCommercialSteps(lead: LeadRow, analysis: any) {
  const name = firstName(lead.full_name);
  const phone = lead.whatsapp ?? lead.phone;
  const status = lead.status;

  if (status === "CLOSED") {
    return [
      "Registrar el cierre y conservar el historial comercial.",
      "Dar seguimiento postventa si aplica.",
      "Revisar si existe oportunidad de referidos o venta cruzada.",
    ];
  }

  if (status === "LOST") {
    return [
      "Registrar el motivo de pérdida.",
      "No seguir insistiendo salvo que exista una nueva señal de interés.",
      "Conservar el aprendizaje para mejorar futuros contactos.",
    ];
  }

  if (status === "NEGOTIATING") {
    return [
      "Confirmar cuál es el principal punto de decisión.",
      "Responder objeciones con información concreta.",
      "Definir una próxima acción con fecha clara.",
    ];
  }

  if (status === "QUOTED") {
    return [
      "Confirmar recepción de la cotización.",
      "Preguntar si hay dudas sobre cobertura, precio o condiciones.",
      "Mover a negociación si empieza a comparar o pedir ajustes.",
    ];
  }

  if (status === "EVALUATING") {
    return [
      "Entender qué opción está comparando.",
      "Aclarar necesidades principales antes de empujar una venta.",
      "Si ya hay suficiente información, pasar a cotización.",
    ];
  }

  if (status === "INTERESTED") {
    return [
      `Contactar a ${name} con tono consultivo, sin presión.`,
      "Validar qué necesita resolver realmente.",
      "Si confirma interés concreto, mover a evaluación.",
    ];
  }

  if (status === "CONTACTED") {
    return [
      "Esperar respuesta y dar seguimiento si no hay avance.",
      "Si responde con interés real, mover a interesado.",
      "Evitar insistir con tono de venta; abrir conversación útil.",
    ];
  }

  const aiSteps = Array.isArray(analysis?.next_steps) ? analysis.next_steps.slice(0, 3) : [];

  if (aiSteps.length > 0) {
    return aiSteps.map((x: any) => cleanInternalText(x));
  }

  return [
    `Contactar a ${name}${phone ? ` por WhatsApp (${phone})` : ""}.`,
    "Preguntar qué está valorando o qué necesita resolver.",
    "Registrar respuesta y mover el estado según avance real.",
  ];
}

export default async function LeadPage(props: any) {
  const rawParams = await Promise.resolve(props?.params);
  const id =
    rawParams?.id ??
    rawParams?.params?.id ??
    props?.params?.id ??
    props?.params?.params?.id ??
    props?.id ??
    undefined;

  if (!isValidLeadId(id)) {
    return (
      <main style={page}>
        <h1>Lead inválido</h1>
        <p style={{ color: "#ff4d4f", fontWeight: 800 }}>El ID recibido no es válido.</p>
        <p style={{ opacity: 0.8 }}>{fmt(id)}</p>
        <Link href="/leads" style={backLink}>← Volver</Link>
      </main>
    );
  }

  try {
    const sb = supabaseAdmin();

    const { data: lead, error } = await sb
      .from("leads")
      .select("*")
      .eq("id", id)
      .maybeSingle<LeadRow>();

    if (error) throw new Error(error.message);

    if (!lead) {
      return (
        <main style={page}>
          <h1>Lead no encontrado</h1>
          <p style={{ color: "#ff4d4f" }}>No pude cargar el lead.</p>
          <Link href="/leads" style={backLink}>← Volver</Link>
        </main>
      );
    }

    const badge = statusBadge(lead.status ?? null);
    const analysis = lead.analysis_json ?? null;

    const quality = Number(analysis?.quality_score ?? 0);
    const probability = Number(analysis?.conversion_probability ?? 0);

    const scoreLabel = getScoreLabel(quality);
    const summary = cleanInternalText(analysis?.summary);
    const nextSteps = buildCommercialSteps(lead, analysis);
    const missingInfo = Array.isArray(analysis?.missing_info)
      ? analysis.missing_info.slice(0, 6).map((x: any) => cleanTerm(x))
      : [];

    return (
      <main style={page}>
        <div style={header}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>
              {fmt(lead.full_name ?? "Lead")}
            </h1>

            <span
              style={{
                display: "inline-flex",
                marginTop: 10,
                padding: "7px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 950,
                letterSpacing: "0.04em",
                color: badge.color,
                background: badge.bg,
                border: `1px solid ${badge.border}`,
              }}
            >
              {badge.text}
            </span>

            <div style={{ marginTop: 8, opacity: 0.55, fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {id}
            </div>
          </div>

          <Link href="/leads" style={backLink}>← Volver</Link>
        </div>

        <section style={{ ...section, marginTop: 18 }}>
          <h2 style={sectionTitle}>Mover lead en el embudo</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              ["CONTACTED", "Contactado"],
              ["INTERESTED", "Interesado"],
              ["EVALUATING", "Evaluando"],
              ["QUOTED", "Cotizado"],
              ["NEGOTIATING", "Negociando"],
              ["CLOSED", "Cerrado"],
              ["LOST", "Perdido"],
            ].map(([value, label]) => {
              const b = statusBadge(value);

              return (
                <form key={value} method="POST" action={`/api/leads/${id}/advance`}>
                  <input type="hidden" name="to" value={value} />
                  <button
                    type="submit"
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: `1px solid ${b.border}`,
                      background: b.bg,
                      color: b.color,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                </form>
              );
            })}
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <section style={section}>
            <h2 style={sectionTitle}>Contacto</h2>
            <div style={line}><b>Teléfono:</b> {fmt(lead.phone ?? lead.whatsapp)}</div>
            <div style={line}><b>WhatsApp:</b> {fmt(lead.whatsapp ?? lead.phone)}</div>
            <div style={line}><b>Email:</b> {fmt(lead.email)}</div>
            <div style={line}><b>Fuente:</b> {fmt(lead.source)}</div>
          </section>

          <section style={section}>
            <h2 style={sectionTitle}>Ubicación</h2>
            <div style={line}><b>Provincia:</b> {fmt(lead.province)}</div>
            <div style={line}><b>Cantón:</b> {fmt(lead.canton)}</div>
            <div style={line}><b>Distrito:</b> {fmt(lead.district)}</div>
          </section>
        </div>

        <section style={{ ...section, marginTop: 14 }}>
          <h2 style={sectionTitle}>Lectura comercial</h2>

          {analysis ? (
            <div>
              <div style={scoreGrid}>
                <div style={scoreCard}>
                  <div style={smallLabel}>Potencial</div>
                  <div style={bigValue}>{scoreLabel}</div>
                </div>

                <div style={scoreCard}>
                  <div style={smallLabel}>Calidad</div>
                  <div style={bigValue}>{quality}/100</div>
                </div>

                <div style={scoreCard}>
                  <div style={smallLabel}>Probabilidad</div>
                  <div style={bigValue}>{probability}/100</div>
                </div>
              </div>

              <div style={{ marginTop: 18, lineHeight: 1.7 }}>
                <b>Resumen ejecutivo:</b>
                <p style={{ marginTop: 8, opacity: 0.9 }}>{summary}</p>
              </div>

              <div style={{ marginTop: 18 }}>
                <b>Qué hacer ahora:</b>
                <ul style={{ marginTop: 8 }}>
                  {nextSteps.map((x: any, i: number) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>

              <div style={{ marginTop: 18 }}>
                <b>Información pendiente:</b>
                <ul style={{ marginTop: 8, opacity: 0.85 }}>
                  {missingInfo.length > 0 ? (
                    missingInfo.map((x: any, i: number) => (
                      <li key={i}>{x}</li>
                    ))
                  ) : (
                    <li>No hay faltantes críticos registrados.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p style={{ opacity: 0.7 }}>Sin análisis todavía.</p>
          )}
        </section>

        <footer style={{ marginTop: 20, opacity: 0.6 }}>
          No somos un software, somos productividad inteligente.
        </footer>
      </main>
    );
  } catch (e: any) {
    return (
      <main style={page}>
        <p style={{ color: "#ff4d4f", fontWeight: 900 }}>No pude cargar el lead.</p>
        <p>{e?.message ?? "Error inesperado"}</p>
        <Link href="/leads" style={backLink}>← Volver</Link>
      </main>
    );
  }
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
};

const section: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 18,
  background: "#111",
};

const sectionTitle: React.CSSProperties = {
  marginTop: 0,
  fontSize: 20,
  fontWeight: 950,
};

const line: React.CSSProperties = {
  marginTop: 8,
};

const backLink: React.CSSProperties = {
  color: "#a855f7",
  fontWeight: 900,
  textDecoration: "none",
};

const scoreGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const scoreCard: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 14,
  padding: 14,
  background: "#0b0b0b",
};

const smallLabel: React.CSSProperties = {
  opacity: 0.65,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
};

const bigValue: React.CSSProperties = {
  marginTop: 6,
  fontSize: 22,
  fontWeight: 950,
};
