import Link from "next/link";
import { supabaseAdmin } from "../../lib/supabase-server";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

type LeadRow = Record<string, any>;
type HistoryRow = {
  lead_id: string;
  type: string;
  created_at: string;
};

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

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function signalFromLead(lead: LeadRow, events: HistoryRow[]) {
  const score = Number(lead.analysis_json?.quality_score ?? 0);
  const prob = Number(lead.analysis_json?.conversion_probability ?? 0);

  if (lead.status === "CLOSED") return "closed";
  if (lead.status === "LOST") return "lost";
  if (score >= 80 || prob >= 70) return "hot";
  if (score >= 50 || prob >= 40) return "warm";

  const hasWA = events.some((e) => e.type === "whatsapp_opened");
  const hasAI = events.some((e) => e.type === "ai_analyzed");

  if (hasWA && hasAI) return "warm";
  return "cold";
}

function priorityFrom(signal: string, status: string | null) {
  if (status === "NEGOTIATING") {
    return {
      priority: "alta",
      urgency: "hoy",
      action: "cerrar objeciones y definir decisión",
    };
  }

  if (status === "QUOTED") {
    return {
      priority: "alta",
      urgency: "hoy",
      action: "confirmar recepción y resolver dudas",
    };
  }

  if (status === "EVALUATING") {
    return {
      priority: "media",
      urgency: "pronto",
      action: "validar necesidades y preparar cotización",
    };
  }

  if (status === "INTERESTED") {
    return {
      priority: signal === "hot" ? "alta" : "media",
      urgency: signal === "hot" ? "hoy" : "pronto",
      action: "profundizar necesidad y avanzar evaluación",
    };
  }

  if (status === "CONTACTED") {
    return {
      priority: signal === "hot" ? "alta" : "media",
      urgency: "pronto",
      action: "dar seguimiento sin presionar",
    };
  }

  if (status === "NEW") {
    return {
      priority: signal === "hot" ? "alta" : signal === "warm" ? "media" : "baja",
      urgency: signal === "hot" ? "hoy" : signal === "warm" ? "pronto" : "sin prisa",
      action: signal === "cold" ? "evaluar si vale la pena trabajar" : "hacer contacto inicial",
    };
  }

  if (status === "CLOSED") {
    return {
      priority: "baja",
      urgency: "sin prisa",
      action: "revisar postventa o referidos",
    };
  }

  if (status === "LOST") {
    return {
      priority: "baja",
      urgency: "sin prisa",
      action: "registrar motivo de pérdida",
    };
  }

  return {
    priority: "baja",
    urgency: "sin prisa",
    action: "revisar lead",
  };
}

function signalStyle(signal: string) {
  if (signal === "hot") return { text: "HOT", color: "#ff4d4f" };
  if (signal === "warm") return { text: "WARM", color: "#faad14" };
  if (signal === "closed") return { text: "CLOSED", color: "#597ef7" };
  if (signal === "lost") return { text: "LOST", color: "#ff7875" };
  return { text: "COLD", color: "#8c8c8c" };
}

function priorityStyle(priority: string) {
  if (priority === "alta") return { text: "Alta", color: "#ff4d4f" };
  if (priority === "media") return { text: "Media", color: "#faad14" };
  return { text: "Baja", color: "#8c8c8c" };
}

function minutesSince(date: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000 / 60));
}

export default async function LeadsPage() {
  const sb = supabaseAdmin();

  const { data: leadsData, error } = await sb
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main style={page}>
        <h1>Leads</h1>
        <p style={{ color: "#ff4d4f", fontWeight: 800 }}>No pude cargar la lista de leads.</p>
        <p>{error.message}</p>
      </main>
    );
  }

  const leads = (leadsData ?? []) as LeadRow[];
  const leadIds = leads.map((lead) => lead.id);

  let historyRows: HistoryRow[] = [];

  if (leadIds.length > 0) {
    const { data: historyData } = await sb
      .from("lead_history")
      .select("lead_id,type,created_at")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });

    historyRows = (historyData ?? []) as HistoryRow[];
  }

  const historyByLead = new Map<string, HistoryRow[]>();

  for (const row of historyRows) {
    const list = historyByLead.get(row.lead_id) ?? [];
    list.push(row);
    historyByLead.set(row.lead_id, list);
  }

  const enriched: any[] = leads.map((lead) => {
    const events = historyByLead.get(lead.id) ?? [];
    const signal = signalFromLead(lead, events);
    const priority = priorityFrom(signal, lead.status ?? null);

    return {
      ...lead,
      events,
      signal,
      ...priority,
    };
  });

  const followups = enriched
    .map((lead) => {
      const lastWA = lead.events.find((e: HistoryRow) => e.type === "whatsapp_opened");
      const lastStatus = lead.events.find((e: HistoryRow) => e.type === "status_changed");

      if (!lastWA) return null;

      const waTime = new Date(lastWA.created_at).getTime();
      const statusTime = lastStatus ? new Date(lastStatus.created_at).getTime() : 0;

      if (!lastStatus || waTime > statusTime) {
        return {
          id: lead.id,
          full_name: lead.full_name,
          status: lead.status,
          minutes: minutesSince(lastWA.created_at),
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 3);

  const topLeads = [...enriched]
    .sort((a, b) => {
      const statusWeight: Record<string, number> = {
        NEGOTIATING: 0,
        QUOTED: 1,
        EVALUATING: 2,
        INTERESTED: 3,
        CONTACTED: 4,
        NEW: 5,
        CLOSED: 6,
        LOST: 7,
      };

      const signalWeight: Record<string, number> = {
        hot: 0,
        warm: 1,
        cold: 2,
        closed: 3,
        lost: 4,
      };

      const aStatus = statusWeight[a.status] ?? 9;
      const bStatus = statusWeight[b.status] ?? 9;
      if (aStatus !== bStatus) return aStatus - bStatus;

      const aSignal = signalWeight[a.signal] ?? 9;
      const bSignal = signalWeight[b.signal] ?? 9;
      if (aSignal !== bSignal) return aSignal - bSignal;

      const aScore = Number(a.analysis_json?.quality_score ?? 0);
      const bScore = Number(b.analysis_json?.quality_score ?? 0);

      return bScore - aScore;
    })
    .slice(0, 3);

  return (
    <main style={page}>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>Leads</h1>
      <p style={{ marginTop: 8, opacity: 0.7 }}>Embudo comercial activo. Últimos 50 leads.</p>

      {followups.length > 0 && (
        <section style={followBox}>
          <h2 style={{ margin: 0, color: "#ffd666" }}>Seguimiento pendiente</h2>
          <p style={{ marginTop: 6, color: "#d6c7a3" }}>
            Leads contactados que siguen sin avance real en el embudo.
          </p>

          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {followups.map((lead: any) => (
              <div key={lead.id} style={followCard}>
                <div style={{ fontSize: 20, fontWeight: 900 }}>{lead.full_name ?? "Lead sin nombre"}</div>
                <div style={{ marginTop: 6, color: "#d6c7a3" }}>Estado actual: {lead.status ?? "—"}</div>
                <div style={{ marginTop: 4, color: "#f0e6d2" }}>
                  {lead.minutes < 1 ? "Recién contactado" : `Hace ${lead.minutes} min sin avance real`}
                </div>

                <a href={`/api/leads/${lead.id}/wa`} style={yellowButton}>
                  Recontactar ahora
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={sectionBox}>
        <h2 style={{ margin: 0, fontSize: 24 }}>Top 3 del día</h2>
        <p style={{ marginTop: 6, opacity: 0.65 }}>Los leads con mayor prioridad operativa hoy.</p>

        <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
          {topLeads.map((lead: any, index: number) => {
            const s = signalStyle(lead.signal);
            const p = priorityStyle(lead.priority);
            const badge = statusBadge(lead.status);

            return (
              <div key={lead.id} style={topCard}>
                <div>
                  <div style={{ color: "#8c8c8c", fontSize: 12 }}>#{index + 1} del día</div>
                  <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{lead.full_name ?? "Lead sin nombre"}</div>

                  <span style={{ ...statusPill, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
                    {badge.text}
                  </span>

                  <div style={{ marginTop: 12 }}>
                    <b>Qué hacer hoy:</b> {lead.action}
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <a href={`/api/leads/${lead.id}/wa`} style={greenButton}>
                      {lead.status === "NEW"
                        ? "Contactar ahora"
                        : lead.status === "CONTACTED"
                        ? "Dar seguimiento"
                        : lead.status === "INTERESTED"
                        ? "Profundizar necesidad"
                        : lead.status === "EVALUATING"
                        ? "Preparar seguimiento"
                        : lead.status === "QUOTED"
                        ? "Dar seguimiento a cotización"
                        : lead.status === "NEGOTIATING"
                        ? "Cerrar negociación"
                        : lead.status === "CLOSED"
                        ? "Ver postventa"
                        : lead.status === "LOST"
                        ? "Revisar pérdida"
                        : "Contactar ahora"}
                    </a>
                    <Link href={`/leads/${lead.id}`} style={whiteButton}>Ver lead</Link>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ color: s.color, fontWeight: 950, fontSize: 18 }}>{s.text}</div>
                  <div style={{ color: p.color, fontWeight: 950, marginTop: 4 }}>Prioridad {p.text}</div>
                  <div style={{ marginTop: 4, opacity: 0.8 }}>Urgencia: {lead.urgency}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <div style={{ marginBottom: 10, opacity: 0.8 }}>Mostrando: {enriched.length}</div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
          <thead>
            <tr>
              <th style={th}>Nombre</th>
              <th style={th}>Estado</th>
              <th style={th}>Señal</th>
              <th style={th}>Prioridad</th>
              <th style={th}>Urgencia</th>
              <th style={th}>Acción sugerida</th>
              <th style={th}>Acción</th>
            </tr>
          </thead>

          <tbody>
            {enriched.map((lead: any) => {
              const badge = statusBadge(lead.status);
              const s = signalStyle(lead.signal);
              const p = priorityStyle(lead.priority);

              return (
                <tr key={lead.id} style={{ borderTop: "1px solid rgba(255,255,255,0.18)" }}>
                  <td style={td}>
                    <div style={{ fontWeight: 900 }}>{lead.full_name ?? "Lead sin nombre"}</div>
                  </td>

                  <td style={td}>
                    <span style={{ ...statusPill, color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
                      {badge.text}
                    </span>
                  </td>

                  <td style={{ ...td, color: s.color, fontWeight: 900 }}>{s.text}</td>
                  <td style={{ ...td, color: p.color, fontWeight: 900 }}>{p.text}</td>
                  <td style={td}>{lead.urgency}</td>
                  <td style={td}>{lead.action}</td>
                  <td style={td}>
                    <Link href={`/leads/${lead.id}`} style={{ color: "#a855f7", fontWeight: 900 }}>
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer style={{ marginTop: 24, opacity: 0.6 }}>
        No somos un software, somos productividad inteligente.
      </footer>
    </main>
  );
}

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  padding: 24,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
};

const sectionBox: CSSProperties = {
  marginTop: 28,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 18,
  padding: 20,
  background: "#0b0b0b",
};

const followBox: CSSProperties = {
  marginTop: 24,
  border: "1px solid #3a2a12",
  borderRadius: 18,
  padding: 20,
  background: "#16110a",
};

const followCard: CSSProperties = {
  border: "1px solid #4a3720",
  borderRadius: 14,
  padding: 16,
  background: "#1b140d",
};

const topCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 18,
  background: "#111",
};

const statusPill: CSSProperties = {
  display: "inline-flex",
  marginTop: 10,
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: "0.04em",
};

const greenButton: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#73d13d",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
};

const yellowButton: CSSProperties = {
  display: "inline-block",
  marginTop: 12,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#ffd666",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
};

const whiteButton: CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fff",
  color: "#111",
  textDecoration: "none",
  fontWeight: 900,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "12px 8px",
  opacity: 0.8,
};

const td: CSSProperties = {
  padding: "12px 8px",
  verticalAlign: "top",
};
