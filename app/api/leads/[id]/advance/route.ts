import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-server";

const allowedStatuses = new Set([
  "CONTACTED",
  "INTERESTED",
  "EVALUATING",
  "QUOTED",
  "NEGOTIATING",
  "CLOSED",
  "LOST",
]);

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const formData = await req.formData();
    const to = String(formData.get("to") ?? "").trim();

    if (!allowedStatuses.has(to)) {
      return NextResponse.json(
        { ok: false, error: "Estado no permitido" },
        { status: 400 }
      );
    }

    const sb = supabaseAdmin();

    const { data: lead, error: fetchError } = await sb
      .from("leads")
      .select("id,status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw new Error(fetchError.message);

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: "Lead no encontrado" },
        { status: 404 }
      );
    }

    const from = lead.status ?? null;

    const { error: updateError } = await sb
      .from("leads")
      .update({
        status: to,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    const { error: historyError } = await sb
      .from("lead_history")
      .insert({
        lead_id: id,
        type: "status_changed",
        value: {
          from,
          to,
          source: "manual_pipeline",
          at: new Date().toISOString(),
        },
      });

    if (historyError) throw new Error(historyError.message);

    return NextResponse.redirect(new URL(`/leads/${id}`, req.url), {
      status: 303,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Error inesperado" },
      { status: 500 }
    );
  }
}
