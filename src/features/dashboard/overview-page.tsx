import { useQueries, useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Bell,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Package,
  UserRoundCheck,
  Users,
  Waves,
} from 'lucide-react'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth-context'
import { formatDate, formatName, getHourOfDay, toDayKey, todayKey } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function last7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return toDayKey(d)
  })
}

function dayLabel(iso: string) {
  const [, , day] = iso.split('-')
  return `${parseInt(day, 10)}`
}

function groupByDay(items: { date: string }[]) {
  const days = last7Days()
  const counts = Object.fromEntries(days.map((d) => [d, 0]))
  for (const item of items) {
    if (item.date in counts) counts[item.date]++
  }
  return days.map((d) => ({ day: dayLabel(d), count: counts[d] }))
}

function getTopResidents(
  entries: Array<{ residentLinks?: Array<{ resident?: { id: string; name: string; lastName: string } | null }> }>,
) {
  const counter: Record<string, number> = {}
  for (const entry of entries) {
    const residents = entry.residentLinks?.map((l) => l.resident).filter(Boolean) ?? []
    for (const r of residents) {
      const name = formatName(r!.name, r!.lastName)
      counter[name] = (counter[name] ?? 0) + 1
    }
  }
  return Object.entries(counter)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
}

// ─── Chart wrapper ────────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { user } = useAuth()

  if (user?.role === 'administrator') return <AdminOverview />
  if (user?.role === 'porter') return <PorterOverview />
  if (user?.role === 'pool_attendant') return <PoolOverview />

  return null
}

function AdminOverview() {
  const { user } = useAuth()

  const sevenDaysAgo = toDayKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))

  const results = useQueries({
    queries: [
      { queryKey: ['reservations'], queryFn: () => api.getReservations({ limit: 200 }) },
      { queryKey: ['packages', 'pending'], queryFn: () => api.getPackages({ limit: 200, delivered: 'false' }) },
      { queryKey: ['notifications', 'unread'], queryFn: () => api.getAllNotifications({ limit: 100, isRead: 'false' }) },
      { queryKey: ['residents', 'stats'], queryFn: api.getResidentsStats },
      { queryKey: ['apartments', 'stats'], queryFn: api.getApartmentsStats },
      { queryKey: ['access-audit', sevenDaysAgo], queryFn: () => api.getAccessAudit({ limit: 500, dateFrom: sevenDaysAgo }) },
      { queryKey: ['pool-entries', sevenDaysAgo], queryFn: () => api.getPoolEntries({ limit: 500 }) },
    ],
  })

  const reservations   = results[0].data?.data ?? []
  const packages       = results[1].data?.data ?? []
  const notifications  = results[2].data?.data ?? []
  const residentsStats = results[3].data ?? { total: 0, active: 0 }
  const apartmentsStats = results[4].data ?? { total: 0, occupied: 0 }
  const accesses       = results[5].data?.data ?? []
  const poolEntries    = results[6].data?.data ?? []

  const today = todayKey()

  const pendingReservations = reservations.filter((r) => r.status?.code === 'pending')
  const pendingPackages     = packages  // already filtered: delivered=false
  const unreadNotif         = notifications  // already filtered: isRead=false
  const accessesToday       = accesses.filter((a) => toDayKey(a.entryTime) === today)
  const poolToday           = poolEntries.filter((e) => toDayKey(e.entryTime) === today)

  // Chart data
  const accessByDay = groupByDay(accesses.map((a) => ({ date: toDayKey(a.entryTime) })))
  const poolByDay   = groupByDay(poolEntries.map((e) => ({ date: toDayKey(e.entryTime) })))

  const reservationsByStatus = [
    { name: 'Pendientes', value: reservations.filter((r) => r.status?.code === 'pending').length, color: '#f59e0b' },
    { name: 'Aprobadas',  value: reservations.filter((r) => r.status?.code === 'approved').length, color: '#10b981' },
    { name: 'Rechazadas', value: reservations.filter((r) => r.status?.code === 'rejected').length, color: '#ef4444' },
    { name: 'Canceladas', value: reservations.filter((r) => r.status?.code === 'cancelled').length, color: '#94a3b8' },
  ].filter((s) => s.value > 0)

  const pendingItems = [
    ...pendingReservations.map((r) => ({
      kind: 'Reserva pendiente' as const,
      variant: 'amber' as const,
      title: r.area?.name ?? 'Área común',
      detail: `${formatName(r.resident?.name, r.resident?.lastName) || '—'} · ${r.reservationDate}`,
    })),
    ...pendingPackages.map((p) => ({
      kind: 'Paquete sin entregar' as const,
      variant: 'violet' as const,
      title: formatName(p.resident?.name, p.resident?.lastName) || '—',
      detail: `${p.description ?? 'Sin descripción'} · ${formatDate(p.arrivalTime)}`,
    })),
  ]

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Centro de control"
        title={`Bienvenido, ${user?.name ?? 'Administrador'}.`}
        description="Indicadores operativos del conjunto en tiempo real."
      />

      <div className="space-y-6 p-4 sm:p-6">
        {/* Row 1 — KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Reservas pendientes"
            value={pendingReservations.length}
            detail={`${reservations.length} solicitudes en total`}
            icon={<ClipboardList className="size-5" />}
          />
          <KpiCard
            label="Paquetes por entregar"
            value={pendingPackages.length}
            detail={`${packages.length} paquetes registrados`}
            icon={<Package className="size-5" />}
          />
          <KpiCard
            label="Notif. sin leer"
            value={unreadNotif.length}
            detail={`${notifications.length} notificaciones totales`}
            icon={<Bell className="size-5" />}
          />
          <KpiCard
            label="Residentes activos"
            value={residentsStats.active}
            detail={`${residentsStats.total} registrados`}
            icon={<Users className="size-5" />}
          />
        </div>

        {/* Row 2 — today stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <KpiCard
            label="Accesos hoy"
            value={accessesToday.length}
            detail="Ingresos registrados en portería"
            icon={<DoorOpen className="size-5" />}
          />
          <KpiCard
            label="Piscina hoy"
            value={poolToday.length}
            detail="Entradas al área de piscina"
            icon={<Waves className="size-5" />}
          />
          <KpiCard
            label="Apartamentos ocupados"
            value={apartmentsStats.occupied}
            detail={`${apartmentsStats.total} unidades en total`}
            icon={<Building2 className="size-5" />}
          />
        </div>

        {/* Row 3 — Charts */}
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.7fr]">
          <ChartCard title="Accesos últimos 7 días" subtitle="Ingresos registrados en portería">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={accessByDay} barSize={24}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="count" name="Accesos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Piscina últimos 7 días" subtitle="Entradas al área húmeda">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={poolByDay}>
                <defs>
                  <linearGradient id="poolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }}
                />
                <Area type="monotone" dataKey="count" name="Entradas" stroke="#0ea5e9" strokeWidth={2} fill="url(#poolGrad)" dot={{ r: 3, fill: '#0ea5e9' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Reservas por estado" subtitle={`${reservations.length} en total`}>
            {reservationsByStatus.length === 0 ? (
              <div className="flex items-center justify-center h-[180px]">
                <p className="text-sm text-slate-500">Sin reservas</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={reservationsByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={32}
                      outerRadius={52}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {reservationsByStatus.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 space-y-1 w-full">
                  {reservationsByStatus.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-600">{s.name}</span>
                      </div>
                      <span className="font-medium text-slate-800">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Row 4 — pending items */}
        {pendingItems.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Pendientes</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {pendingItems.length} {pendingItems.length === 1 ? 'elemento requiere' : 'elementos requieren'} atención.
              </p>
            </div>
            <div className="divide-y divide-slate-100">
              {pendingItems.slice(0, 6).map((item) => (
                <div key={`${item.kind}-${item.title}-${item.detail}`} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{item.detail}</p>
                  </div>
                  <StatusBadge label={item.kind} variant={item.variant} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Porter ───────────────────────────────────────────────────────────────────

function PorterOverview() {
  const { user } = useAuth()

  const today = todayKey()

  const results = useQueries({
    queries: [
      { queryKey: ['packages', 'porter'], queryFn: () => api.getPackages({ limit: 200 }) },
      { queryKey: ['access-audit', today], queryFn: () => api.getAccessAudit({ limit: 300, dateFrom: today }) },
      { queryKey: ['visitors-all'], queryFn: api.getVisitorsAll },
    ],
  })

  const packages      = results[0].data?.data ?? []
  const accessEntries = results[1].data?.data ?? []
  const visitors      = (results[2].data ?? []) as import('@/types/api').Visitor[]

  const pendingPackages = packages.filter((p) => !p.delivered)
  const deliveredToday  = packages.filter((p) => p.delivered && toDayKey(p.deliveredTime) === today)
  const todayEntries    = accessEntries  // already filtered by dateFrom=today
  const visitorsToday   = visitors.filter((v) => toDayKey(v.createdAt) === today)

  const recentAccesses = [...accessEntries]
    .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())
    .slice(0, 6)

  // Accesses by hour today
  const accessByHour = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}h`,
    count: todayEntries.filter((a) => getHourOfDay(a.entryTime) === h).length,
  })).filter((_, i) => {
    const now = getHourOfDay(new Date())
    return i <= now
  })

  const accessByDay = groupByDay(accessEntries.map((a) => ({ date: toDayKey(a.entryTime) })))

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Centro de control"
        title={`${user?.name ?? 'Portero'}, turno activo.`}
        description="Visión operativa de portería: accesos, paquetes y visitantes."
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Entradas hoy"
            value={todayEntries.length}
            detail={`${visitorsToday.length} visitantes nuevos hoy`}
            icon={<DoorOpen className="size-5" />}
          />
          <KpiCard
            label="Paquetes pendientes"
            value={pendingPackages.length}
            detail={`${deliveredToday.length} entregados hoy`}
            icon={<Package className="size-5" />}
          />
          <KpiCard
            label="Visitantes registrados"
            value={visitorsToday.length}
            detail="Visitantes creados hoy"
            icon={<UserRoundCheck className="size-5" />}
          />
          <KpiCard
            label="Accesos totales"
            value={accessEntries.length}
            detail="Histórico completo del sistema"
            icon={<CalendarDays className="size-5" />}
          />
        </div>

        {/* Charts */}
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Accesos por hora — hoy" subtitle="Distribución de ingresos durante el turno">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={accessByHour} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="count" name="Accesos" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Accesos últimos 7 días" subtitle="Tendencia semanal de portería">
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={accessByDay}>
                <defs>
                  <linearGradient id="accessGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="count" name="Accesos" stroke="#6366f1" strokeWidth={2} fill="url(#accessGrad)" dot={{ r: 3, fill: '#6366f1' }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          {/* Recent accesses */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Últimos accesos</p>
              <p className="text-xs text-slate-500 mt-0.5">Los movimientos más recientes de portería.</p>
            </div>
            {recentAccesses.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Sin registros de acceso aún.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentAccesses.map((entry) => {
                  const who = entry.visitor
                    ? formatName(entry.visitor.name, entry.visitor.lastName)
                    : entry.resident
                      ? formatName(entry.resident.name, entry.resident.lastName)
                      : 'Sin identificar'
                  const isVisitor = Boolean(entry.visitor)
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{who}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{formatDate(entry.entryTime)}</p>
                      </div>
                      <StatusBadge label={isVisitor ? 'Visitante' : 'Residente'} variant={isVisitor ? 'violet' : 'blue'} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pending packages */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Paquetes pendientes</p>
              <p className="text-xs text-slate-500 mt-0.5">Sin entregar al residente.</p>
            </div>
            {pendingPackages.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Todo entregado.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingPackages.slice(0, 5).map((pkg) => (
                  <div key={pkg.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {formatName(pkg.resident?.name, pkg.resident?.lastName) || '—'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {pkg.description ?? 'Sin descripción'} · {formatDate(pkg.arrivalTime)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Pool attendant ───────────────────────────────────────────────────────────

function PoolOverview() {
  const { user } = useAuth()
  const today = todayKey()

  const entriesQuery = useQuery({ queryKey: ['pool-entries', today], queryFn: () => api.getPoolEntries({ limit: 300 }) })
  const summaryQuery = useQuery({
    queryKey: ['pool-summary', today, today],
    queryFn: () => api.getPoolSummary(today, today),
  })

  const allEntries  = entriesQuery.data?.data ?? []
  const todayEntries = allEntries
    .filter((e) => toDayKey(e.entryTime) === today)
    .sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime())

  const topResidents = getTopResidents(todayEntries)

  // Guests vs residents per day
  const guestsByDay = (() => {
    const days = last7Days()
    return days.map((d) => {
      const dayEntries = allEntries.filter((e) => toDayKey(e.entryTime) === d)
      const guests = dayEntries.reduce((s, e) => s + (e.guestCount ?? 0), 0)
      const residents = dayEntries.length
      return { day: dayLabel(d), residentes: residents, invitados: guests }
    })
  })()

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Centro de control"
        title={`${user?.name ?? 'Piscinero'}, área húmeda activa.`}
        description={`Resumen operativo de hoy — ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}.`}
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Entradas hoy"
            value={summaryQuery.data?.entriesInRange ?? 0}
            detail="Ingresos registrados hoy"
            icon={<Waves className="size-5" />}
          />
          <KpiCard
            label="Invitados hoy"
            value={summaryQuery.data?.guestsInRange ?? 0}
            detail="Acompañantes contabilizados"
            icon={<UserRoundCheck className="size-5" />}
          />
          <KpiCard
            label="Residentes únicos"
            value={summaryQuery.data?.uniqueResidents ?? 0}
            detail="Residentes distintos hoy"
            icon={<Users className="size-5" />}
          />
          <KpiCard
            label="Total histórico"
            value={allEntries.length}
            detail="Entradas desde el inicio"
            icon={<CalendarDays className="size-5" />}
          />
        </div>

        {/* Charts */}
        <ChartCard title="Residentes e invitados — últimos 7 días" subtitle="Comparativa de accesos al área de piscina">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={guestsByDay} barSize={18} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} cursor={{ fill: '#f8fafc' }} />
              <Bar dataKey="residentes" name="Residentes" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              <Bar dataKey="invitados" name="Invitados" fill="#a78bfa" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
          {/* Recent entries */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Entradas de hoy</p>
              <p className="text-xs text-slate-500 mt-0.5">Registros más recientes del turno.</p>
            </div>
            {todayEntries.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Sin entradas hoy.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {todayEntries.slice(0, 6).map((entry) => {
                  const residents = entry.residentLinks?.map((l) => l.resident).filter(Boolean) ?? []
                  const names = residents.length > 0
                    ? residents.map((r) => formatName(r!.name, r!.lastName)).join(', ')
                    : 'Sin residente asignado'
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{names}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Apt. {entry.apartment?.number ?? '—'} · {formatDate(entry.entryTime)}
                        </p>
                      </div>
                      {(entry.guestCount ?? 0) > 0 && (
                        <StatusBadge label={`+${entry.guestCount} invitado${entry.guestCount === 1 ? '' : 's'}`} variant="violet" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top residents */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Más activos hoy</p>
              <p className="text-xs text-slate-500 mt-0.5">Residentes con más ingresos.</p>
            </div>
            {topResidents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">Sin datos.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {topResidents.map((r, i) => (
                  <div key={r.name} className="flex items-center justify-between gap-2 px-5 py-3">
                    <p className="text-sm text-slate-700 truncate">
                      <span className="text-slate-500 mr-1.5">#{i + 1}</span>
                      {r.name}
                    </p>
                    <span className="text-xs font-semibold text-slate-500 shrink-0">{r.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
