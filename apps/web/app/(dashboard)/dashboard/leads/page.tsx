import { createServerSupabaseClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

type SearchParams = {
  page?: string;
  province?: string;
  status?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
};

function safeInt(v: string | undefined, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function keep(params: Record<string, string>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== "") sp.set(k, v);
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = await createServerSupabaseClient();

  const page = safeInt(searchParams?.page, 1);
  const province = (searchParams?.province ?? "").trim();
  const status = (searchParams?.status ?? "").trim();
  const from = (searchParams?.from ?? "").trim();
  const to = (searchParams?.to ?? "").trim();

  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;

  let q = supabase
    .from("leads")
    .select("id, full_name, phone, province, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (province) q = q.eq("province", province);
  if (status) q = q.eq("status", status);

  // Fechas inclusivas (desde 00:00:00, hasta 23:59:59)
  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);

  const { data, count, error } = await q.range(fromIdx, toIdx);

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-xl font-semibold">Leads</h1>
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Error consultando Supabase</p>
          <pre className="mt-2 whitespace-pre-wrap">{error.message}</pre>
        </div>
      </div>
    );
  }

  const leads = data ?? [];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseParams = { province, status, from, to };

  const prevHref = keep({ ...baseParams, page: String(Math.max(1, page - 1)) });
  const nextHref = keep({ ...baseParams, page: String(Math.min(totalPages, page + 1)) });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Mostrando {total === 0 ? 0 : fromIdx + 1}–{Math.min(total, fromIdx + leads.length)} de {total}
          </p>
        </div>
        <a
          href="/dashboard"
          className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
        >
          ← Volver al dashboard
        </a>
      </div>

      {/* FILTROS */}
      <form className="rounded-xl border p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Provincia</label>
            <select
              name="province"
              defaultValue={province}
              className="w-full rounded-md border px-2 py-2 text-sm bg-background"
            >
              <option value="">Todas</option>
              <option value="San José">San José</option>
              <option value="Alajuela">Alajuela</option>
              <option value="Cartago">Cartago</option>
              <option value="Heredia">Heredia</option>
              <option value="Guanacaste">Guanacaste</option>
              <option value="Puntarenas">Puntarenas</option>
              <option value="Limón">Limón</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Estado</label>
            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-md border px-2 py-2 text-sm bg-background"
            >
              <option value="">Todos</option>
              <option value="new">Nuevo</option>
              <option value="contacted">Contactado</option>
              <option value="interested">Interesado</option>
              <option value="converted">Convertido</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Desde</label>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="w-full rounded-md border px-2 py-2 text-sm bg-background"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Hasta</label>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="w-full rounded-md border px-2 py-2 text-sm bg-background"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Aplicar filtros
          </button>
          <a
            href="/dashboard/leads"
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
          >
            Limpiar
          </a>
        </div>
      </form>

      {/* TABLA */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3">Nombre</th>
              <th className="text-left px-4 py-3">Provincia</th>
              <th className="text-left px-4 py-3">Teléfono</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No hay leads con esos filtros.
                </td>
              </tr>
            ) : (
              leads.map((lead: any) => (
                <tr key={lead.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">{lead.full_name ?? ""}</td>
                  <td className="px-4 py-3">{lead.province ?? ""}</td>
                  <td className="px-4 py-3">{lead.phone ?? ""}</td>
                  <td className="px-4 py-3">{lead.status ?? ""}</td>
                  <td className="px-4 py-3">
                    {lead.created_at ? new Date(lead.created_at).toLocaleString("es-CR") : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="opacity-80">
          Página {page} de {totalPages}
        </div>

        <div className="flex gap-2">
          <a
            href={prevHref}
            className={`rounded-md border px-3 py-2 hover:bg-muted ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
          >
            Anterior
          </a>
          <a
            href={nextHref}
            className={`rounded-md border px-3 py-2 hover:bg-muted ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
          >
            Siguiente
          </a>
        </div>
      </div>
    </div>
  );
}
