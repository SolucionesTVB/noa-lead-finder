"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

type Props = {
  province: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "seguimiento", label: "En seguimiento" },
  { value: "cerrado", label: "Cerrado" },
  { value: "perdido", label: "Perdido" },
];

export default function FiltersClient({ province }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const fromParam = searchParams.get("from") || "";
    const toParam = searchParams.get("to") || "";
    const statusParam = searchParams.get("status") || "";
    setFrom(fromParam);
    setTo(toParam);
    setStatus(statusParam);
  }, [searchParams]);

  const applyFilters = () => {
    const params = new URLSearchParams();

    if (province) params.set("province", province);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);

    params.set("page", "1");

    router.push(`/dashboard/leads?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams();

    if (province) params.set("province", province);
    params.set("page", "1");

    router.push(`/dashboard/leads?${params.toString()}`);
  };

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Rango de fechas
          </span>
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500">Desde</label>
              <input
                type="date"
                className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-700 outline-none ring-0 focus:border-slate-400"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-500">Hasta</label>
              <input
                type="date"
                className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-700 outline-none ring-0 focus:border-slate-400"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Estado del lead
          </span>
          <select
            className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-[11px] text-slate-700 outline-none ring-0 focus:border-slate-400"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:items-end">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyFilters}
            className="h-8 rounded-md bg-slate-900 px-3 text-[11px] font-semibold text-white hover:bg-slate-800"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[11px] text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </div>
    </section>
  );
}
