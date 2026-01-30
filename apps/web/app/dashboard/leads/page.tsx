import { createClient } from '@/lib/supabase/server'

const PAGE_SIZE = 10

async function getLeads(page: number, province: string) {
  const supabase = createClient()

  const safePage = page < 1 ? 1 : page
  const from = (safePage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (province !== '') {
    query = query.eq('province', province)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    console.error(error)
    return { leads: [], total: 0, page: safePage }
  }

  return {
    leads: data ?? [],
    total: count ?? 0,
    page: safePage,
  }
}

type SearchParams = {
  page?: string
  province?: string
}

export default async function LeadsPage({ searchParams }: { searchParams?: SearchParams }) {
  const page = searchParams?.page ? Number(searchParams.page) || 1 : 1
  const province = searchParams?.province ?? ''

  const { leads, total } = await getLeads(page, province)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Leads</h1>

      <form className="flex gap-2 items-center">
        <label className="text-sm">Provincia:</label>
        <select
          name="province"
          defaultValue={province}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">Todas</option>
          <option value="San José">San José</option>
          <option value="Alajuela">Alajuela</option>
          <option value="Heredia">Heredia</option>
          <option value="Cartago">Cartago</option>
          <option value="Guanacaste">Guanacaste</option>
          <option value="Puntarenas">Puntarenas</option>
          <option value="Limón">Limón</option>
        </select>

        <button
          type="submit"
          className="px-3 py-1 border rounded text-sm"
        >
          Aplicar
        </button>
      </form>

      <table className="min-w-full text-sm border">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left border-b">Nombre</th>
            <th className="px-2 py-1 text-left border-b">Provincia</th>
            <th className="px-2 py-1 text-left border-b">Teléfono</th>
            <th className="px-2 py-1 text-left border-b">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead: any) => (
            <tr key={lead.id} className="border-b">
              <td className="px-2 py-1">{lead.full_name ?? lead.name}</td>
              <td className="px-2 py-1">{lead.province}</td>
              <td className="px-2 py-1">{lead.phone}</td>
              <td className="px-2 py-1">
                {lead.created_at
                  ? new Date(lead.created_at).toLocaleString('es-CR')
                  : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between text-sm">
        <span>
          Página {page} de {totalPages} ({total} leads)
        </span>

        <div className="flex gap-2">
          <a
            href={`?page=${page - 1}&province=${province}`}
            className={`px-2 py-1 border rounded ${
              page <= 1 ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            Anterior
          </a>
          <a
            href={`?page=${page + 1}&province=${province}`}
            className={`px-2 py-1 border rounded ${
              page >= totalPages ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            Siguiente
          </a>
        </div>
      </div>
    </div>
  )
}
