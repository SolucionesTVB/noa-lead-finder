// app/api/leads/[id]/brief/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = "brief-v2-b2c-agentes-2026-02-10-CR";
const MODEL = "gpt-5";
const CACHE_TTL_HOURS = 24;

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

function hoursSince(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  return (now - t) / (1000 * 60 * 60);
}

function extractTextFromResponsesAPI(resp: any): string {
  const ot = typeof resp?.output_text === "string" ? resp.output_text.trim() : "";
  if (ot) return ot;

  const out = Array.isArray(resp?.output) ? resp.output : [];
  const chunks: string[] = [];

  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      const t =
        (typeof c?.text === "string" && c.text) ||
        (typeof c?.output_text === "string" && c.output_text) ||
        "";
      if (t && t.trim()) chunks.push(t.trim());
    }
    if (typeof item?.content_text === "string" && item.content_text.trim()) chunks.push(item.content_text.trim());
    if (typeof item?.text === "string" && item.text.trim()) chunks.push(item.text.trim());
  }

  return chunks.join("\n").trim();
}

function safeJsonParse(text: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "JSON parse error" };
  }
}

function normalizeBrief(obj: any) {
  const brief = obj && typeof obj === "object" ? obj : {};
  const asStringArray = (v: any) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const asString = (v: any) => (typeof v === "string" ? v : "");

  return {
    who_is: asString(brief.who_is),
    objetivo_llamada: asString(brief.objetivo_llamada),
    preguntas_clave: asStringArray(brief.preguntas_clave),
    guion_apertura: asString(brief.guion_apertura),
    banderas_rojas: asStringArray(brief.banderas_rojas),
    proximos_pasos: asStringArray(brief.proximos_pasos),
    tono_recomendado: asString(brief.tono_recomendado),
    supuestos_y_limitaciones: asStringArray(brief.supuestos_y_limitaciones),
  };
}

// JSON schema estricto para brief
const briefSchemaName = "lead_brief_b2c_agentes";
const briefJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    who_is: { type: "string" },
    objetivo_llamada: { type: "string" },
    preguntas_clave: { type: "array", items: { type: "string" } },
    guion_apertura: { type: "string" },
    banderas_rojas: { type: "array", items: { type: "string" } },
    proximos_pasos: { type: "array", items: { type: "string" } },
    tono_recomendado: { type: "string" },
    supuestos_y_limitaciones: { type: "array", items: { type: "string" } },
  },
  required: [
    "who_is",
    "objetivo_llamada",
    "preguntas_clave",
    "guion_apertura",
    "banderas_rojas",
    "proximos_pasos",
    "tono_recomendado",
    "supuestos_y_limitaciones",
  ],
} as const;

function buildPrompt(lead: LeadRow) {
  return `
Necesito un BRIEF para llamada (B2C: agentes/corredores persona).
Respondé SOLO con JSON válido, sin texto adicional.

REGLAS:
- NO inventés vida privada ni datos no presentes.
- Si hay poca info: enfoque de descubrimiento y calificación.

DATOS DEL LEAD (reales):
- id: ${lead.id}
- nombre: ${lead.full_name || "Lead sin nombre"}
- phone: ${lead.phone || ""}
- whatsapp: ${lead.whatsapp || ""}
- email: ${lead.email || ""}

ENTREGA (JSON):
who_is, objetivo_llamada, preguntas_clave, guion_apertura, banderas_rojas, proximos_pasos, tono_recomendado, supuestos_y_limitaciones.
`.trim();
}

async function generateBrief(openai: OpenAI, prompt: string) {
  const resp1 = await openai.responses.create({
    model: MODEL,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: briefSchemaName,
        schema: briefJsonSchema,
        strict: true,
      },
    } as any,
    max_output_tokens: 700,
  });

  const text1 = extractTextFromResponsesAPI(resp1);
  if (text1) {
    const parsed = safeJsonParse(text1);
    if (parsed.ok) return { ok: true as const, value: parsed.value, debug: { mode: "json_schema", has_text: true } };
  }

  const resp2 = await openai.responses.create({
    model: MODEL,
    input: prompt + "\n\nRespondé ÚNICAMENTE con un objeto JSON válido. Sin markdown, sin texto extra.",
    text: { format: { type: "json_object" } } as any,
    max_output_tokens: 700,
  });

  const text2 = extractTextFromResponsesAPI(resp2);
  if (text2) {
    const parsed2 = safeJsonParse(text2);
    if (parsed2.ok) return { ok: true as const, value: parsed2.value, debug: { mode: "json_object", has_text: true } };
    return { ok: false as const, error: "JSON inválido del modelo", debug: { mode: "json_object", has_text: true, sample: text2.slice(0, 300) } };
  }

  return { ok: false as const, error: "Respuesta vacía del modelo", debug: { has_output: Boolean(resp1?.output || resp2?.output) } };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await (ctx?.params as any);
  const id = params?.id as string | undefined;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "Falta OPENAI_API_KEY", version: VERSION }, { status: 500 });
  }
  if (!id) {
    return NextResponse.json({ ok: false, error: "Falta id", version: VERSION }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();

    // 1) CACHE: si existe y está fresco -> HIT inmediato
    const { data: cached, error: cacheErr } = await sb
      .from("lead_briefs")
      .select("lead_id, brief_json, version, model, debug, updated_at")
      .eq("lead_id", id)
      .maybeSingle();

    if (!cacheErr && cached?.brief_json && cached.updated_at) {
      const ageHrs = hoursSince(cached.updated_at);
      if (Number.isFinite(ageHrs) && ageHrs <= CACHE_TTL_HOURS) {
        return NextResponse.json(
          {
            ok: true,
            id,
            version: cached.version || VERSION,
            brief: normalizeBrief(cached.brief_json),
            debug: {
              cache: "hit",
              age_hours: Math.round(ageHrs * 10) / 10,
              cached_version: cached.version || null,
              cached_model: cached.model || null,
              cached_debug: cached.debug || null,
            },
          },
          { status: 200 }
        );
      }
    }

    // 2) Lead
    const { data, error } = await sb
      .from("leads")
      .select("id, full_name, email, phone, whatsapp")
      .eq("id", id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: "Lead no encontrado", details: error?.message || "", version: VERSION },
        { status: 404 }
      );
    }

    const lead = data as LeadRow;
    const prompt = buildPrompt(lead);

    // 3) Generate (MISS)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const result = await generateBrief(openai, prompt);

    const briefObj = result.ok
      ? normalizeBrief(result.value)
      : normalizeBrief({
          who_is: lead.full_name ? `Persona: ${lead.full_name}` : "Lead sin nombre confirmado",
          objetivo_llamada: "Confirmar interés, necesidad y canal preferido. Calificar y definir siguiente paso.",
          preguntas_clave: [
            "¿Qué tipo de seguro o necesidad querés resolver hoy?",
            "¿Para cuándo lo necesitás?",
            "¿Cuál es tu canal preferido para seguimiento: llamada o WhatsApp?",
            "¿Tenés una póliza actual? ¿Con cuál aseguradora?",
          ],
          guion_apertura:
            "Hola, soy Tony de NOA. Vi tu contacto y quiero entender qué necesidad de seguro estás buscando resolver para ayudarte rápido. ¿Tenés 2 minutos?",
          banderas_rojas: ["Datos incompletos (falta producto/urgencia)", "Contacto no responde o número no corresponde"],
          proximos_pasos: ["Llamar y confirmar interés", "Si no contesta: abrir WhatsApp SIN texto", "Registrar resultado y siguiente acción"],
          tono_recomendado: "Cálido, directo, profesional. Enfoque de descubrimiento.",
          supuestos_y_limitaciones: ["No hay información de producto/urgencia en el lead", "No se asume nada personal fuera de los datos provistos"],
        });

    const debug = result.ok
      ? { cache: "miss", generated: true, ...(result.debug || {}) }
      : { cache: "miss", generated: false, ...(result.debug || {}), warning: result.error };

    // 4) Upsert cache
    await sb.from("lead_briefs").upsert(
      { lead_id: id, brief_json: briefObj, version: VERSION, model: MODEL, debug },
      { onConflict: "lead_id" }
    );

    return NextResponse.json({ ok: true, id, version: VERSION, brief: briefObj, debug }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Error inesperado", version: VERSION }, { status: 500 });
  }
}
