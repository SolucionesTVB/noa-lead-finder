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
  if (d.startsWith("506") && d.length === 11) return `+${d}`;
  if (d.length === 8) return `+506${d}`;
  return `+${d}`;
}

function firstName(name: any) {
  const first = String(name ?? "").trim().split(" ")[0] || "";
  if (!first || first.toLowerCase() === "lead") return "mucho gusto";
  return first;
}

function buildMessage(lead: any) {
  const name = firstName(lead.full_name);
  const status = String(lead.status ?? "NEW");

  if (status === "EVALUATING") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Quería darle seguimiento con calma para entender mejor qué está valorando y poder orientarle mejor.

Si gusta, me cuenta qué opción está revisando o qué duda principal tiene.`;
  }

  if (status === "QUOTED") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Le escribo para confirmar si pudo revisar la propuesta y si tiene alguna duda sobre cobertura, precio o condiciones.

Con gusto le ayudo a revisarlo por aquí.`;
  }

  if (status === "NEGOTIATING") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Quería retomar el punto que quedó pendiente para ayudarle a tomar una decisión con claridad.

Si le parece, revisamos juntos qué ajuste o condición falta para avanzar.`;
  }

  if (status === "INTERESTED") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Gracias por el interés. Para orientarle mejor, me gustaría entender qué necesita resolver o qué tipo de protección está valorando.

Si gusta, me cuenta por aquí y avanzamos paso a paso.`;
  }

  if (status === "CONTACTED") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Le escribo para dar seguimiento a nuestro contacto anterior, sin compromiso.

Si todavía está valorando opciones, con gusto le ayudo por aquí.`;
  }

  if (status === "CLOSED") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Quería agradecerle la confianza y quedo atento por si necesita apoyo adicional o seguimiento posterior.`;
  }

  if (status === "LOST") {
    return `Hola ${name}, le saluda Tony Villalobos de NOA.

Le agradezco el espacio. Si más adelante desea retomar el tema o revisar opciones, con gusto quedo a la orden.`;
  }

  return `Hola ${name}, le saluda Tony Villalobos de NOA.

Quería ponerme a la orden por si está valorando opciones de seguro o tiene alguna consulta.

Si gusta, me cuenta por aquí y con gusto le ayudo.`;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const sb = supabaseAdmin();

    const { data, error } = await sb
      .from("leads")
      .select("id,full_name,phone,whatsapp,status")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Supabase error: ${error.message}`);
    if (!data) return NextResponse.json({ ok: false, error: "Lead no encontrado", id }, { status: 404 });

    const phoneRaw = (data as any)?.whatsapp ?? (data as any)?.phone ?? "";
    const phoneE164 = toE164CR(phoneRaw);

    if (!phoneE164) {
      return NextResponse.json({ ok: false, error: "Lead sin teléfono/WhatsApp", id }, { status: 400 });
    }

    const message = buildMessage(data);

    await sb.from("lead_history").insert({
      lead_id: id,
      type: "whatsapp_opened",
      value: {
        mode: "pipeline_message",
        status: data.status,
        phone: phoneE164,
        message,
        at: new Date().toISOString(),
      },
    });

    const wa = `https://wa.me/${phoneE164.replace("+", "")}?text=${encodeURIComponent(message)}`;
    return NextResponse.redirect(wa, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Error" }, { status: 500 });
  }
}
