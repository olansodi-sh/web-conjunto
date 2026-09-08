import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock3, TableProperties } from 'lucide-react'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import { DataTable, type ColumnDef, type FilterDef } from '@/components/ui/data-table'
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth-context'
import { cn, formatDate, formatName, formatTime, todayKey } from '@/lib/utils'
import { toast } from 'sonner'
import type { Reservation } from '@/types/api'

function reservationStatusVariant(code?: string): StatusVariant {
  if (code === 'approved') return 'green'
  if (code === 'rejected') return 'red'
  if (code === 'pending') return 'amber'
  return 'slate'
}

function ReservationActions({ reservation, statuses }: { reservation: Reservation; statuses: { id: string; code?: string; name: string }[] }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (statusId: string) => api.updateReservationStatus(reservation.id, { statusId }),
    onSuccess: () => {
      toast.success('Estado actualizado')
      void queryClient.invalidateQueries({ queryKey: ['reservations'] })
    },
    onError: () => toast.error('No fue posible actualizar la reserva'),
  })

  const getStatusId = (code: string) => statuses.find((s) => s.code === code)?.id
  const code = reservation.status?.code

  const actions: { label: string; code: string; variant?: 'secondary' | 'outline' }[] = []
  if (code === 'pending') {
    actions.push({ label: 'Aprobar', code: 'approved' })
    actions.push({ label: 'Rechazar', code: 'rejected', variant: 'secondary' })
  } else if (code === 'approved') {
    actions.push({ label: 'Rechazar', code: 'rejected', variant: 'secondary' })
    actions.push({ label: 'Cancelar', code: 'cancelled', variant: 'outline' })
  } else if (code === 'rejected') {
    actions.push({ label: 'Aprobar', code: 'approved' })
    actions.push({ label: 'Cancelar', code: 'cancelled', variant: 'outline' })
  } else if (code === 'cancelled') {
    actions.push({ label: 'Reabrir', code: 'pending' })
    actions.push({ label: 'Aprobar', code: 'approved' })
  }

  if (actions.length === 0) return null

  return (
    <div className="flex justify-end gap-1.5">
      {actions.map((action) => (
        <Button
          key={action.code}
          size="sm"
          variant={action.variant ?? 'default'}
          className="h-7 text-xs"
          onClick={() => {
            const statusId = getStatusId(action.code)
            if (statusId) mutation.mutate(statusId)
          }}
          disabled={mutation.isPending || !getStatusId(action.code)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  )
}

// ─── Calendar view ────────────────────────────────────────────────────────────

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

/** "2026-07-11" o ISO → "2026-07-11" (día local, sin corrimiento de zona horaria). */
function dayKey(value?: string | null): string {
  return (value ?? '').slice(0, 10)
}

function statusChipClasses(code?: string): string {
  switch (code) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200'
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200'
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200'
    case 'cancelled':
      return 'bg-slate-100 text-slate-500 border-slate-200 line-through hover:bg-slate-200'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
  }
}

function ReservationDetailDialog({
  reservation,
  onOpenChange,
}: {
  reservation: Reservation | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={Boolean(reservation)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,460px)]">
        {reservation && (
          <>
            <DialogHeader>
              <DialogTitle>{reservation.area?.name ?? 'Área común'}</DialogTitle>
              <DialogDescription>
                {reservation.resident
                  ? formatName(reservation.resident.name, reservation.resident.lastName)
                  : 'Residente no disponible'}
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">Día reservado</dt>
              <dd className="text-slate-700">{formatDate(reservation.reservationDate)}</dd>
              <dt className="text-slate-400">Horario</dt>
              <dd className="text-slate-700">{formatTime(reservation.startTime)} – {formatTime(reservation.endTime)}</dd>
              <dt className="text-slate-400">Estado</dt>
              <dd>
                <StatusBadge
                  label={reservation.status?.name ?? 'Sin estado'}
                  variant={reservationStatusVariant(reservation.status?.code)}
                />
              </dd>
              <dt className="text-slate-400">Solicitada</dt>
              <dd className="text-slate-700">{formatDate(reservation.createdAt)}</dd>
              {reservation.notesByResident && (
                <>
                  <dt className="text-slate-400">Nota residente</dt>
                  <dd className="text-slate-700">{reservation.notesByResident}</dd>
                </>
              )}
              {reservation.notesByAdministrator && (
                <>
                  <dt className="text-slate-400">Nota admin</dt>
                  <dd className="text-slate-700">{reservation.notesByAdministrator}</dd>
                </>
              )}
            </dl>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReservationsCalendar({ reservations }: { reservations: Reservation[] }) {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<Reservation | null>(null)

  // Agrupa las reservas por día (clave YYYY-MM-DD), ordenadas por hora de inicio.
  const byDay = useMemo(() => {
    const map = new Map<string, Reservation[]>()
    for (const r of reservations) {
      const key = dayKey(r.reservationDate)
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(r)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    }
    return map
  }, [reservations])

  // Construye la grilla del mes empezando en lunes.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
    const leading = (first.getDay() + 6) % 7 // lunes = 0
    const result: (number | null)[] = []
    for (let i = 0; i < leading; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(d)
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [cursor])

  const pad = (n: number) => String(n).padStart(2, '0')
  // El dia de "hoy" se resuelve en GMT-5, no en la zona del equipo.
  const todayIso = todayKey()

  const goPrev = () =>
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }))
  const goNext = () =>
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          {MONTHS[cursor.month]} {cursor.year}
        </h3>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={goPrev} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
          >
            Hoy
          </Button>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={goNext} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500">
            {w}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="min-h-24 bg-slate-50/60" />
          const key = `${cursor.year}-${pad(cursor.month + 1)}-${pad(day)}`
          const items = byDay.get(key) ?? []
          const isToday = key === todayIso
          return (
            <div key={key} className="min-h-24 bg-white p-1.5">
              <div
                className={cn(
                  'mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                  isToday ? 'bg-slate-900 text-white' : 'text-slate-500',
                )}
              >
                {day}
              </div>
              <div className="space-y-1">
                {items.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className={cn(
                      'block w-full truncate rounded border px-1.5 py-1 text-left text-[11px] font-medium transition',
                      statusChipClasses(r.status?.code),
                    )}
                    title={`${formatTime(r.startTime)}–${formatTime(r.endTime)} · ${r.area?.name ?? 'Área'}`}
                  >
                    {formatTime(r.startTime)} {r.area?.name ?? 'Área'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <ReservationDetailDialog reservation={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}

export function ReservationsPage() {
  const { user } = useAuth()
  const [view, setView] = useState<'table' | 'calendar'>('table')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({})

  const reservationsQuery = useQuery({
    queryKey: ['reservations', user?.role, page, search, tableFilters],
    queryFn: () => api.getReservations({ page, limit: 15, search: search || undefined, ...tableFilters }),
    placeholderData: keepPreviousData,
  })
  // El calendario necesita todas las reservas del rango, no solo la página actual.
  const calendarQuery = useQuery({
    queryKey: ['reservations', 'calendar', user?.role],
    queryFn: () => api.getReservations({ limit: 500 }),
    enabled: view === 'calendar',
    placeholderData: keepPreviousData,
  })
  const statusesQuery = useQuery({
    queryKey: ['reservation-statuses'],
    queryFn: api.getReservationStatuses,
    enabled: Boolean(user),
  })

  const statuses = statusesQuery.data ?? []
  const reservations = reservationsQuery.data?.data ?? []
  const isAdmin = user?.role === 'administrator'

  const statusFilterOptions = statuses.map((s) => ({ value: s.code ?? s.id, label: s.name }))

  const filters: FilterDef[] = [
    {
      key: 'status',
      placeholder: 'Estado',
      options: statusFilterOptions,
    },
    {
      key: 'reservationDate',
      type: 'period',
      placeholder: 'Período',
      options: [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Última semana' },
        { value: 'month', label: 'Último mes' },
        { value: 'quarter', label: 'Últimos 3 meses' },
      ],
    },
  ]

  const columns: ColumnDef<Reservation>[] = [
    {
      header: 'Área',
      cell: (row) => <span className="font-medium text-slate-900">{row.area?.name ?? 'Área común'}</span>,
    },
    {
      header: 'Residente',
      cell: (row) =>
        row.resident ? (
          <span className="text-slate-600">
            {formatName(row.resident.name, row.resident.lastName)}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      header: 'Fecha',
      cell: (row) => <span className="whitespace-nowrap text-slate-600">{formatDate(row.reservationDate)}</span>,
    },
    {
      header: 'Horario',
      cell: (row) => (
        <span className="whitespace-nowrap text-slate-500 text-xs">
          {formatTime(row.startTime)} – {formatTime(row.endTime)}
        </span>
      ),
    },
    {
      header: 'Estado',
      cell: (row) => (
        <StatusBadge
          label={row.status?.name ?? 'Sin estado'}
          variant={reservationStatusVariant(row.status?.code)}
        />
      ),
    },
    ...(isAdmin
      ? [
          {
            header: 'Acciones',
            className: 'text-right',
            cell: (row: Reservation) => <ReservationActions reservation={row} statuses={statuses} />,
          } satisfies ColumnDef<Reservation>,
        ]
      : []),
  ]

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Operacion"
        title="Reservas"
        description="Revisa, aprueba o rechaza reservas desde el panel operativo."
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            label="Reservas"
            value={reservationsQuery.data?.meta.total ?? 0}
            detail="Solicitudes registradas."
            icon={<ClipboardList className="size-5" />}
          />
          <KpiCard
            label="Pendientes"
            value={reservations.filter((r) => r.status?.code === 'pending').length}
            detail="En esta página."
            icon={<Clock3 className="size-5" />}
          />
          <KpiCard
            label="Aprobadas"
            value={reservations.filter((r) => r.status?.code === 'approved').length}
            detail="En esta página."
            icon={<CheckCircle2 className="size-5" />}
          />
        </div>

        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setView('table')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === 'table' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              <TableProperties className="size-4" /> Tabla
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                view === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              <CalendarDays className="size-4" /> Calendario
            </button>
          </div>
        </div>

        {view === 'calendar' ? (
          <ReservationsCalendar reservations={calendarQuery.data?.data ?? []} />
        ) : (
          <DataTable
            data={reservations}
            columns={columns}
            searchPlaceholder="Buscar área o residente..."
            getSearchText={(row) =>
              [row.area?.name, row.resident?.name, row.resident?.lastName, row.notesByResident]
                .filter(Boolean)
                .join(' ')
            }
            filters={filters}
            getFilterValues={(row) => ({
              status: row.status?.code ?? '',
              reservationDate: row.reservationDate,
            })}
            isLoading={reservationsQuery.isLoading}
            emptyMessage="Sin reservas registradas."
            serverSide
            totalItems={reservationsQuery.data?.meta.total}
            currentPage={page}
            onPageChange={setPage}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
            onFiltersChange={(v) => { setTableFilters(v); setPage(1) }}
          />
        )}
      </div>
    </div>
  )
}
