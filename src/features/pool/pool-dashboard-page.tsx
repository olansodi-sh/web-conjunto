import { useQuery } from '@tanstack/react-query'
import { FileText, Sparkles, UserRoundCheck, Waves } from 'lucide-react'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatName, todayKey } from '@/lib/utils'

export function PoolDashboardPage() {
  const today = todayKey()

  const entriesQuery = useQuery({
    queryKey: ['pool-entries'],
    queryFn: () => api.getPoolEntries({ limit: 1000 }),
  })
  const summaryQuery = useQuery({
    queryKey: ['pool-summary', today, today],
    queryFn: () => api.getPoolSummary(today, today),
  })

  const filteredEntries = (entriesQuery.data?.data ?? []).filter((entry) => {
    const date = new Date(entry.entryTime)
    const start = new Date(`${today}T00:00:00`)
    const end = new Date(`${today}T23:59:59`)
    return date >= start && date <= end
  })

  const topResidents = getTopResidents(filteredEntries)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <SectionHeader
        eyebrow="Piscina"
        title="Dashboard de piscina"
        description="Resumen operativo del período activo: volumen de entradas, invitados y ranking de residentes."
      />

      <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-4 sm:p-6">
        <Card className="bg-white">
          <CardHeader className="pb-3">
            <Badge className="w-fit">Hoy</Badge>
            <CardTitle>Resumen del día</CardTitle>
            <CardDescription>El dashboard muestra solo la operación de hoy. La exportación por rango vive dentro de Reportes.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm font-medium text-slate-900">{today}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-4">
          <KpiCard
            label="Entradas"
            value={summaryQuery.data?.entriesInRange ?? 0}
            detail="Registros dentro del rango activo."
            icon={<Waves className="size-5" />}
          />
          <KpiCard
            label="Invitados"
            value={summaryQuery.data?.guestsInRange ?? 0}
            detail="Acompañantes vinculados al reporte."
            icon={<UserRoundCheck className="size-5" />}
          />
          <KpiCard
            label="Residentes únicos"
            value={summaryQuery.data?.uniqueResidents ?? 0}
            detail="Residentes distintos presentes en el período."
            icon={<Sparkles className="size-5" />}
          />
          <KpiCard
            label="PDF"
            value={filteredEntries.length}
            detail="Registros que saldrán en el exportable."
            icon={<FileText className="size-5" />}
          />
        </div>

        <div className="grid min-h-0 gap-4">
          <Card className="flex min-h-0 flex-col bg-white">
            <CardHeader className="pb-3">
              <CardTitle>Ranking de residentes</CardTitle>
              <CardDescription>Quiénes más han usado piscina en el período seleccionado.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 space-y-3 overflow-hidden pt-0">
              {topResidents.map((resident, index) => (
                <DashboardLine
                  key={resident.name}
                  label={`#${index + 1} · ${resident.name}`}
                  value={`${resident.count} ${resident.count === 1 ? 'ingreso' : 'ingresos'}`}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function getTopResidents(
  entries: Array<{
    residents?: Array<{ id: string; name: string; lastName: string }>
  }>,
) {
  const counter = entries.reduce<Record<string, number>>((accumulator, entry) => {
    const residents = entry.residents ?? []

    if (residents.length === 0) {
      accumulator['Sin residente'] = (accumulator['Sin residente'] ?? 0) + 1
      return accumulator
    }

    residents.forEach((resident) => {
      const residentName = formatName(resident.name, resident.lastName)
      accumulator[residentName] = (accumulator[residentName] ?? 0) + 1
    })

    return accumulator
  }, {})

  return Object.entries(counter)
    .map(([name, count]) => ({ name, count }))
    .sort((first, second) => second.count - first.count)
    .slice(0, 5)
}

function DashboardLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1 border-l border-slate-200 pl-3">
      <p className="break-words text-sm font-medium leading-5 text-slate-900">{label}</p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{value}</p>
    </div>
  )
}
