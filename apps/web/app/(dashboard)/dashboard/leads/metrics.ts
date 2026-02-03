export type Lead = {
  id: number;
  full_name?: string;
  name?: string;
  province?: string;
  phone?: string;
  created_at?: string;
  status?: string;
};

export function computeMetrics(leads: Lead[]) {
  const totalLeads = leads.length;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOf7DaysAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6
  );
  const startOf30DaysAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 29
  );

  let today = 0;
  let last7 = 0;
  let last30 = 0;

  const byStatus: Record<string, number> = {};

  for (const lead of leads) {
    if (!lead.created_at) continue;
    const d = new Date(lead.created_at);

    if (d >= startOfToday) today += 1;
    if (d >= startOf7DaysAgo) last7 += 1;
    if (d >= startOf30DaysAgo) last30 += 1;

    const s = (lead.status || "sin_estado").toLowerCase();
    byStatus[s] = (byStatus[s] || 0) + 1;
  }

  const statusSummary = Object.entries(byStatus)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");

  return {
    totalLeads,
    today,
    last7,
    last30,
    statusSummary,
  };
}
