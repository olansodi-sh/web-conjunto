import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, FileText, Users, Waves } from 'lucide-react'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { toDayKey } from '@/lib/utils'

const PRESETS = [
  { label: 'Esta semana', days: 7 },
  { label: 'Este mes', days: 30 },
  { label: 'Últimos 3 meses', days: 90 },
]

function toIsoDate(date: Date) {
  return toDayKey(date)
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toIsoDate(d)
}

export function PoolReportsPage() {
  const [dateFrom, setDateFrom] = useState(() => daysAgo(7))
  const [dateTo, setDateTo] = useState(() => toIsoDate(new Date()))

  const summaryQuery = useQuery({
    queryKey: ['pool-summary', dateFrom, dateTo],
    queryFn: () => api.getPoolSummary(dateFrom, dateTo),
  })
  const summary = summaryQuery.data

  const pdfMutation = useMutation({
    mutationFn: () => api.downloadPoolReportPdf(dateFrom, dateTo),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporte-piscina-${dateFrom}-${dateTo}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado')
    },
    onError: () => toast.error('No fue posible generar el PDF'),
  })

  function applyPreset(days: number) {
    setDateFrom(daysAgo(days))
    setDateTo(toIsoDate(new Date()))
  }

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Piscina"
        title="Reportes"
        description="Selecciona un rango de fechas, revisa el resumen y descarga el PDF oficial."
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Date range selector */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 mb-3">Rango del reporte</p>

          <div className="grid gap-3 md:grid-cols-[minmax(0,10rem)_minmax(0,10rem)_1fr] md:items-end">
            <Field label="Desde" className="min-w-0">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </Field>
            <Field label="Hasta" className="min-w-0">
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex md:flex-wrap md:justify-end md:pb-0.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.days)}
                  className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI cards for range */}
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            label="Ingresos en rango"
            value={summary?.entriesInRange ?? '—'}
            detail={`Del ${dateFrom} al ${dateTo}.`}
            icon={<Waves className="size-5" />}
          />
          <KpiCard
            label="Invitados en rango"
            value={summary?.guestsInRange ?? '—'}
            detail="Acompañantes externos en el período."
            icon={<Users className="size-5" />}
          />
          <KpiCard
            label="Residentes únicos"
            value={summary?.uniqueResidents ?? '—'}
            detail="Residentes distintos que ingresaron."
            icon={<FileText className="size-5" />}
          />
        </div>

        {/* Download */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-slate-900">Exportar PDF</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Reporte con encabezado, resumen y tabla de ingresos para el rango seleccionado.
              </p>
            </div>
            <Button
              onClick={() => pdfMutation.mutate()}
              disabled={pdfMutation.isPending || !dateFrom || !dateTo}
              className="shrink-0"
            >
              <Download className="size-4" />
              {pdfMutation.isPending ? 'Generando...' : 'Descargar PDF'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
