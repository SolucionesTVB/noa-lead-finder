import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("leads")
      .select("id,full_name,phone,whatsapp")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "Lead no encontrado", id }, { status: 404 });

    const phoneRaw = (data as any)?.whatsapp ?? (data as any)?.phone ?? "";
    const phoneE164 = toE164CR(phoneRaw);
    if (!phoneE164) return NextResponse.json({ ok: false, error: "Lead sin teléfono/WhatsApp", id }, { status: 400 });

    // ✅ SIN TEXTO: abre WhatsApp al chat y listo
    const wa = `https://wa.me/${phoneE164.replace("+", "")}`;
    return NextResponse.redirect(wa, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
