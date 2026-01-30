import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <p>Bienvenido al panel.</p>
    </div>
  )
}
