import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "ai-normalizer-v9-supabase-cache-24h-2026-02-10-CR";
const CACHE_TTL_HOURS = 24;

type Analysis = {
  summary: string;
  quality_score: number; // 0–100
  conversion_probability: number; // 0–100
  reasoning: string;
  missing_info: string[];
  next_steps: string[];
};

function clamp100(n: any, fallback = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(100, x));
}
function toInt100(n: any, fallback = 0) {
  return Math.round(clamp100(n, fallback));
}
function safeArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).map((s) => s.trim()).filter(Boolean);
}
function coerceAnalysis(obj: any): Analysis {
  return {
    summary: String(obj?.summary ?? "").trim() || "Sin resumen.",
    quality_score: toInt100(obj?.quality_score ?? obj?.qualityScore ?? 0, 0),
    conversion_probability: toInt100(obj?.conversion_probability ?? obj?.conversionProbability ?? 0, 0),
    reasoning: String(obj?.reasoning ?? "").trim() || "Sin razonamiento.",
    missing_info: safeArray(obj?.missing_info ?? obj?.missingInfo),
    next_steps: safeArray(obj?.next_steps ?? obj?.nextSteps),
  };
}
function getOutputText(resp: any): string {
  if (typeof resp?.output_text === "string" && resp.output_text.trim()) return resp.output_text.trim();
  const out = resp?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) return t.trim();
        }
      }
    }
  }
  return "";
}
function jsonFromText(text: string): any {
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const chunk = text.slice(start, end + 1);
    try {
      return JSON.parse(chunk);
    } catch {}
  }
  return null;
}
function isFresh(ts: any, ttlHours: number): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  const ageMs = Date.now() - d.getTime();
  return ageMs >= 0 && ageMs <= ttlHours * 60 * 60 * 1000;
}

async function loadLead(id: string) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Supabase error: ${error.message}`);
  return data ?? null;
}

async function saveCache(id: string, analysis: Analysis) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("leads")
    .update({
      analysis_json: analysis,
      analysis_version: VERSION,
      analyzed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // No rompemos la respuesta por un fallo de cacheo; solo registramos en server logs.
    console.warn("[NOA] No se pudo guardar cache:", error.message);
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "Falta OPENAI_API_KEY", version: VERSION }, { status: 500 });
    }

    const leadRow = await loadLead(id);
    if (!leadRow) {
      // Sin lead en DB: devolvemos análisis mínimo sin llamar AI (barato y honesto)
      const analysis: Analysis = {
        summary: `No encontré el lead en la base para id ${id}.`,
        quality_score: 0,
        conversion_probability: 0,
        reasoning: "Sin registro no hay datos para evaluar.",
        missing_info: ["Registro del lead en la base (leads)"],
        next_steps: ["Verificar el ID", "Revisar si es duplicado o si se creó en otro sistema", "Reintentar cuando exista en DB"],
      };
      return NextResponse.json({ ok: true, id, analysis, version: VERSION, cache: "miss" });
    }

    // 1) Cache hit si está fresco
    if (leadRow.analysis_json && isFresh(leadRow.analyzed_at, CACHE_TTL_HOURS)) {
      const cached = coerceAnalysis(leadRow.analysis_json);
      cached.quality_score = toInt100(cached.quality_score, 0);
      cached.conversion_probability = toInt100(cached.conversion_probability, 0);
      return NextResponse.json({
        ok: true,
        id,
        analysis: cached,
        version: leadRow.analysis_version ?? VERSION,
        cache: "hit",
        analyzed_at: leadRow.analyzed_at,
      });
    }

    // 2) Cache miss: AI con fuente de verdad Supabase
    const leadFacts = {
      id,
      name: leadRow?.name ?? leadRow?.nombre ?? null,
      role: leadRow?.role ?? leadRow?.cargo ?? null,
      company: leadRow?.company ?? leadRow?.empresa ?? null,
      email: leadRow?.email ?? null,
      phone: leadRow?.phone ?? leadRow?.telefono ?? leadRow?.whatsapp ?? null,
      province: leadRow?.province ?? leadRow?.provincia ?? null,
      canton: leadRow?.canton ?? null,
      district: leadRow?.district ?? null,
      source: leadRow?.source ?? leadRow?.fuente ?? null,
      insurer: leadRow?.insurer ?? leadRow?.aseguradora ?? null,
      notes: leadRow?.notes ?? leadRow?.notas ?? null,
      created_at: leadRow?.created_at ?? null,
      updated_at: leadRow?.updated_at ?? null,
    };

    const system = `
Sos NOA, asesor B2B. Regla #1: NO inventés datos.
Usá ÚNICAMENTE los hechos en leadFacts. Si falta algo, decí “no disponible”.
Objetivo: decir si vale la pena, por qué, qué falta y qué hacer HOY.
Devolvé SOLO JSON válido (sin texto extra) con este formato:

{
  "summary": "string",
  "quality_score": 0-100,
  "conversion_probability": 0-100,
  "reasoning": "string",
  "missing_info": ["..."],
  "next_steps": ["..."]
}

Notas:
- quality_score y conversion_probability SIEMPRE 0–100 (enteros).
- “Qué hacer hoy” = acciones concretas ejecutables en 30–60 min.
`.trim();

    const user = `leadFacts (fuente de verdad):\n${JSON.stringify(leadFacts, null, 2)}`;

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await client.responses.create({
      model: "gpt-5",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const text = getOutputText(resp);
    const raw = jsonFromText(text) ?? {};
    const analysis = coerceAnalysis(raw);

    analysis.quality_score = toInt100(analysis.quality_score, 0);
    analysis.conversion_probability = toInt100(analysis.conversion_probability, 0);

    // Guardar cache (best-effort)
    await saveCache(id, analysis);

    return NextResponse.json({ ok: true, id, analysis, version: VERSION, cache: "miss" });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error inesperado", version: VERSION },
      { status: 500 }
    );
  }
}
