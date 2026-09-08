import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Download, FileText, PlusCircle, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Navigate, NavLink } from 'react-router-dom'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { Field } from '@/components/forms/field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { FilterableSelect } from '@/components/ui/filterable-select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { cn, formatDate, formatName, toDayKey } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth-context'
import { toast } from 'sonner'
import type { Apartment, Employee, Fine, FineType, Resident, Tower } from '@/types/api'

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const createFineSchema = z.object({
  towerId: z.string().uuid('Selecciona una torre'),
  apartmentId: z.string().uuid('Selecciona un apartamento'),
  residentId: z.string().optional().or(z.literal('')),
  fineTypeId: z.string().uuid('Selecciona un tipo de multa'),
  amount: z.string().optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
})

const createFineTypeSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(120),
  value: z.string().min(1, 'Ingresa un valor'),
})

interface FineFilters {
  towerId?: string
  apartmentId?: string
  residentId?: string
  fineTypeId?: string
  createdByEmployeeId?: string
  dateFrom?: string
  dateTo?: string
}

const ALL_TABS = [
  { to: '/app/fines/assign', label: 'Asignar', icon: PlusCircle, adminOnly: false },
  { to: '/app/fines/history', label: 'Histórico', icon: FileText, adminOnly: false },
  { to: '/app/fines/types', label: 'Tipos', icon: Settings2, adminOnly: true },
]

function toIsoDate(date: Date) {
  return toDayKey(date)
}

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return toIsoDate(date)
}

function formatCurrency(value: number) {
  return currencyFormatter.format(value)
}

function fineTypeName(fine: Fine) {
  return fine.fineTypeNameSnapshot ?? fine.fineType?.name ?? 'Multa'
}

function apartmentLabel(fine: Fine) {
  const apartment = fine.apartment ?? fine.resident?.apartment
  return `${apartment?.towerData?.name ?? 'Torre'} · Apt. ${apartment?.number ?? 'N/A'}`
}

function residentLabel(resident?: Resident | null) {
  return resident ? formatName(resident.name, resident.lastName) : 'Apartamento'
}

function employeeLabel(employee?: Employee | null) {
  return employee ? formatName(employee.name, employee.lastName) : '—'
}

function finePeriodLabel(fine: Fine) {
  const year = fine.createdYear ?? fine.createdAt.slice(0, 4)
  const month = fine.createdMonth ? String(fine.createdMonth).padStart(2, '0') : fine.createdAt.slice(5, 7)
  return `${year}-${month}`
}

// ─── Layout shell ─────────────────────────────────────────────────────────────

function FinesLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'administrator'
  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin)

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="space-y-5 p-4 sm:p-6">
        {/* Tab nav */}
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
                  )
                }
              >
                <Icon className="size-3.5" />
                {tab.label}
              </NavLink>
            )
          })}
        </div>
        {children}
      </div>
    </div>
  )
}

export function FinesPage() {
  return <Navigate to="/app/fines/assign" replace />
}

// ─── Types page ────────────────────────────────────────────────────────────────

export function FinesTypesPage() {
  const queryClient = useQueryClient()
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const fineTypesQuery = useQuery({ queryKey: ['fine-types'], queryFn: api.getFineTypes })
  const fineTypes = fineTypesQuery.data ?? []

  const createTypeForm = useForm<z.infer<typeof createFineTypeSchema>>({
    resolver: zodResolver(createFineTypeSchema),
    defaultValues: { name: '', value: '' },
  })

  const createTypeMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: number }) => api.createFineType({ name, value }),
    onSuccess: () => {
      toast.success('Tipo de multa creado')
      createTypeForm.reset()
      void queryClient.invalidateQueries({ queryKey: ['fine-types'] })
    },
    onError: () => toast.error('No fue posible crear el tipo de multa'),
    onSettled: () => setCreateSubmitting(false),
  })

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: number }) => api.updateFineTypeValue(id, { value }),
    onSuccess: () => {
      toast.success('Valor actualizado')
      void queryClient.invalidateQueries({ queryKey: ['fine-types'] })
    },
    onError: () => toast.error('No fue posible actualizar el valor'),
  })

  return (
    <FinesLayout
      eyebrow="Multas"
      title="Tipos de multa"
      description="Parametrización administrativa. Los cambios aplican hacia adelante; el histórico conserva el snapshot usado al asignar."
    >
      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>Nuevo tipo</CardTitle>
          <CardDescription>Define el nombre y valor vigente para nuevas multas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap gap-3"
            onSubmit={createTypeForm.handleSubmit((values) => {
              if (createSubmitting) return
              const value = Number(values.value)
              if (!Number.isFinite(value) || value < 0) {
                createTypeForm.setError('value', { message: 'Ingresa un valor válido' })
                return
              }
              setCreateSubmitting(true)
              createTypeMutation.mutate({ name: values.name.trim(), value })
            })}
          >
            <Field label="Nombre" error={createTypeForm.formState.errors.name?.message} className="min-w-[200px] flex-1">
              <Input {...createTypeForm.register('name')} placeholder="Ej. Ruido excesivo" />
            </Field>
            <Field label="Valor (COP)" error={createTypeForm.formState.errors.value?.message} className="w-[180px]">
              <Input {...createTypeForm.register('value')} placeholder="90000" inputMode="numeric" />
            </Field>
            <div className="flex items-end">
              <Button
                type="submit"
                disabled={createSubmitting || createTypeMutation.isPending}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                Agregar tipo
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>Valores vigentes</CardTitle>
          <CardDescription>Actualizar un valor no reescribe multas antiguas ni reportes pasados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {fineTypesQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-slate-400">Cargando…</p>
          ) : fineTypes.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No hay tipos de multa registrados. Crea el primero arriba.</p>
          ) : (
            fineTypes.map((fineType) => (
              <FineTypeValueRow
                key={fineType.id}
                fineType={fineType}
                isSaving={updateTypeMutation.isPending}
                onSave={(value) => updateTypeMutation.mutate({ id: fineType.id, value })}
              />
            ))
          )}
        </CardContent>
      </Card>
    </FinesLayout>
  )
}

function FineTypeValueRow({
  fineType,
  isSaving,
  onSave,
}: {
  fineType: FineType
  isSaving: boolean
  onSave: (value: number) => void
}) {
  const [value, setValue] = useState(() => String(fineType.value))
  const [submitting, setSubmitting] = useState(false)
  const dirty = value !== String(fineType.value)

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="min-w-[160px] flex-1">
        <p className="text-sm font-semibold text-slate-900">{fineType.name}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Creado {formatDate(fineType.createdAt)}{fineType.createdByEmployee ? ` · ${employeeLabel(fineType.createdByEmployee)}` : ''}
        </p>
      </div>
      <Field label="Valor vigente (COP)" className="w-[180px] shrink-0">
        <Input
          value={value}
          inputMode="numeric"
          onChange={(e) => setValue(e.target.value)}
          className={dirty ? 'border-amber-400 ring-1 ring-amber-300' : ''}
        />
      </Field>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={submitting || isSaving || !dirty}
        className="h-9 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white disabled:opacity-40"
        onClick={() => {
          if (submitting || isSaving) return
          const nextValue = Number(value)
          if (!Number.isFinite(nextValue) || nextValue < 0) {
            toast.error('Ingresa un valor válido')
            return
          }
          setSubmitting(true)
          onSave(nextValue)
          window.setTimeout(() => setSubmitting(false), 1200)
        }}
      >
        {submitting || isSaving ? 'Guardando…' : 'Guardar'}
      </Button>
    </div>
  )
}

// ─── Assign page ────────────────────────────────────────────────────────────────

export function FinesAssignPage() {
  const queryClient = useQueryClient()
  const [towerOpen, setTowerOpen] = useState(false)
  const [towerSearch, setTowerSearch] = useState('')
  const [apartmentOpen, setApartmentOpen] = useState(false)
  const [apartmentSearch, setApartmentSearch] = useState('')
  const [residentOpen, setResidentOpen] = useState(false)
  const [residentSearch, setResidentSearch] = useState('')
  const [fineTypeOpen, setFineTypeOpen] = useState(false)
  const [fineTypeSearch, setFineTypeSearch] = useState('')
  const [createSubmitting, setCreateSubmitting] = useState(false)

  const fineTypesQuery = useQuery({ queryKey: ['fine-types'], queryFn: api.getFineTypes })
  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })

  const form = useForm<z.infer<typeof createFineSchema>>({
    resolver: zodResolver(createFineSchema),
    defaultValues: { towerId: '', apartmentId: '', residentId: '', fineTypeId: '', amount: '', notes: '' },
  })

  const selectedTowerId = useWatch({ control: form.control, name: 'towerId' })
  const selectedApartmentId = useWatch({ control: form.control, name: 'apartmentId' })
  const selectedResidentId = useWatch({ control: form.control, name: 'residentId' })
  const selectedFineTypeId = useWatch({ control: form.control, name: 'fineTypeId' })

  const apartmentsQuery = useQuery({
    queryKey: ['apartments', 'fines', selectedTowerId],
    queryFn: () => api.getApartments({ towerId: selectedTowerId, limit: 200 }),
    enabled: Boolean(selectedTowerId),
  })

  const residentsQuery = useQuery({
    queryKey: ['residents', 'fines', selectedApartmentId],
    queryFn: () => api.getResidents({ apartmentId: selectedApartmentId, limit: 200 }),
    enabled: Boolean(selectedApartmentId),
  })

  const fineTypes = fineTypesQuery.data ?? []
  const towers = towersQuery.data ?? []
  const apartments = apartmentsQuery.data?.data ?? []
  const residents = residentsQuery.data?.data ?? []
  const selectedTower = towers.find((t) => t.id === selectedTowerId) ?? null
  const selectedApartment = apartments.find((a) => a.id === selectedApartmentId) ?? null
  const selectedResident = residents.find((r) => r.id === selectedResidentId) ?? null
  const selectedFineType = fineTypes.find((f) => f.id === selectedFineTypeId) ?? null

  useEffect(() => {
    if (selectedFineType) {
      form.setValue('amount', String(selectedFineType.value))
    }
  }, [selectedFineType, form])

  const createFineMutation = useMutation({
    mutationFn: api.createFine,
    onSuccess: () => {
      toast.success('Multa asignada correctamente')
      form.reset({ towerId: '', apartmentId: '', residentId: '', fineTypeId: '', amount: '', notes: '' })
      void queryClient.invalidateQueries({ queryKey: ['fines'] })
    },
    onError: () => toast.error('No fue posible asignar la multa'),
    onSettled: () => setCreateSubmitting(false),
  })

  return (
    <FinesLayout
      eyebrow="Multas"
      title="Asignar multa"
      description="Registra multas por apartamento y residente. El valor usado queda congelado en el histórico."
    >
      <Card>
        <CardHeader>
          <CardTitle>Nueva multa</CardTitle>
          <CardDescription>Portería, piscina y administración pueden registrar multas operativas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => {
              if (createSubmitting) return
              const amount = values.amount?.trim() ? Number(values.amount) : undefined
              if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
                form.setError('amount', { message: 'Ingresa un valor válido' })
                return
              }
              setCreateSubmitting(true)
              createFineMutation.mutate({
                apartmentId: values.apartmentId,
                residentId: values.residentId || undefined,
                fineTypeId: values.fineTypeId,
                amount,
                notes: values.notes?.trim() || undefined,
              })
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Torre" error={form.formState.errors.towerId?.message}>
                <TowerSelect
                  open={towerOpen}
                  onOpenChange={setTowerOpen}
                  value={selectedTowerId}
                  displayValue={selectedTower?.name ?? ''}
                  towers={towers}
                  isLoading={towersQuery.isLoading}
                  searchValue={towerSearch}
                  onSearchValueChange={setTowerSearch}
                  onSelect={(tower) => {
                    form.setValue('towerId', tower.id, { shouldValidate: true })
                    form.setValue('apartmentId', '')
                    form.setValue('residentId', '')
                    setTowerOpen(false)
                    setApartmentOpen(true)
                  }}
                />
              </Field>

              <Field label="Apartamento" error={form.formState.errors.apartmentId?.message}>
                <ApartmentSelect
                  open={apartmentOpen}
                  onOpenChange={setApartmentOpen}
                  value={selectedApartmentId}
                  displayValue={selectedApartment ? `Apt. ${selectedApartment.number}` : ''}
                  apartments={apartments}
                  disabled={!selectedTowerId}
                  isLoading={apartmentsQuery.isLoading}
                  searchValue={apartmentSearch}
                  onSearchValueChange={setApartmentSearch}
                  onSelect={(apartment) => {
                    form.setValue('apartmentId', apartment.id, { shouldValidate: true })
                    form.setValue('residentId', '')
                    setApartmentOpen(false)
                    setResidentOpen(true)
                  }}
                />
              </Field>

              <Field label="Residente (opcional)">
                <ResidentSelect
                  open={residentOpen}
                  onOpenChange={setResidentOpen}
                  value={selectedResidentId ?? ''}
                  displayValue={selectedResident ? residentLabel(selectedResident) : ''}
                  residents={residents}
                  disabled={!selectedApartmentId}
                  isLoading={residentsQuery.isLoading}
                  searchValue={residentSearch}
                  onSearchValueChange={setResidentSearch}
                  onSelect={(resident) => {
                    form.setValue('residentId', resident.id)
                    setResidentOpen(false)
                  }}
                />
              </Field>

              <Field label="Tipo de multa" error={form.formState.errors.fineTypeId?.message}>
                <FineTypeSelect
                  open={fineTypeOpen}
                  onOpenChange={setFineTypeOpen}
                  value={selectedFineTypeId}
                  displayValue={selectedFineType?.name ?? ''}
                  fineTypes={fineTypes}
                  isLoading={fineTypesQuery.isLoading}
                  searchValue={fineTypeSearch}
                  onSearchValueChange={setFineTypeSearch}
                  onSelect={(fineType) => {
                    form.setValue('fineTypeId', fineType.id, { shouldValidate: true })
                    form.setValue('amount', String(fineType.value))
                    setFineTypeOpen(false)
                  }}
                />
              </Field>

              <Field label="Valor (COP)" error={form.formState.errors.amount?.message}>
                <Input {...form.register('amount')} placeholder="90000" inputMode="numeric" />
              </Field>

              <Field label="Notas (opcional)" error={form.formState.errors.notes?.message}>
                <Textarea {...form.register('notes')} placeholder="Detalle de la infracción" rows={2} />
              </Field>
            </div>

            <Button
              type="submit"
              className="w-full bg-slate-900 text-white hover:bg-slate-800"
              disabled={createSubmitting || createFineMutation.isPending}
            >
              {createSubmitting || createFineMutation.isPending ? 'Asignando…' : 'Asignar multa'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </FinesLayout>
  )
}

// ─── History page ─────────────────────────────────────────────────────────────

export function FinesHistoryPage() {
  const [filters, setFilters] = useState<FineFilters>(() => ({ dateFrom: daysAgo(30), dateTo: toIsoDate(new Date()) }))
  const [draftFilters, setDraftFilters] = useState<FineFilters>(() => ({ dateFrom: daysAgo(30), dateTo: toIsoDate(new Date()) }))
  const [towerOpen, setTowerOpen] = useState(false)
  const [towerSearch, setTowerSearch] = useState('')
  const [apartmentOpen, setApartmentOpen] = useState(false)
  const [apartmentSearch, setApartmentSearch] = useState('')
  const [residentOpen, setResidentOpen] = useState(false)
  const [residentSearch, setResidentSearch] = useState('')
  const [fineTypeOpen, setFineTypeOpen] = useState(false)
  const [fineTypeSearch, setFineTypeSearch] = useState('')
  const [employeeOpen, setEmployeeOpen] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const finesQuery = useQuery({
    queryKey: ['fines', filters, page, search],
    queryFn: () => api.getFines({ ...filters, search: search || undefined, page, limit: 15 }),
    placeholderData: keepPreviousData,
  })
  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })
  const fineTypesQuery = useQuery({ queryKey: ['fine-types'], queryFn: api.getFineTypes })
  const employeesQuery = useQuery({
    queryKey: ['employees', 'fines'],
    queryFn: () => api.getEmployees({ limit: 200 }),
  })
  const apartmentsQuery = useQuery({
    queryKey: ['apartments', 'fines-history', draftFilters.towerId],
    queryFn: () => api.getApartments({ towerId: draftFilters.towerId, limit: 200 }),
    enabled: Boolean(draftFilters.towerId),
  })
  const residentsQuery = useQuery({
    queryKey: ['residents', 'fines-history', draftFilters.apartmentId],
    queryFn: () => api.getResidents({ apartmentId: draftFilters.apartmentId, limit: 200 }),
    enabled: Boolean(draftFilters.apartmentId),
  })

  const fines = finesQuery.data?.data ?? []
  const towers = towersQuery.data ?? []
  const apartments = apartmentsQuery.data?.data ?? []
  const residents = residentsQuery.data?.data ?? []
  const fineTypes = fineTypesQuery.data ?? []
  const employees = employeesQuery.data?.data ?? []
  const totalAmount = fines.reduce((total, fine) => total + fine.amount, 0)

  const pdfMutation = useMutation({
    mutationFn: () => api.downloadFinesReportPdf(filters),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `reporte-multas-${filters.dateFrom ?? 'inicio'}-${filters.dateTo ?? 'hoy'}.pdf`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Reporte descargado')
    },
    onError: () => toast.error('No fue posible generar el PDF'),
  })

  const columns: ColumnDef<Fine>[] = [
    {
      header: 'Apartamento',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{apartmentLabel(row)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{residentLabel(row.resident)}</p>
        </div>
      ),
    },
    {
      header: 'Tipo',
      cell: (row) => (
        <div>
          <p className="text-sm font-medium text-slate-800">{fineTypeName(row)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Período {finePeriodLabel(row)}</p>
        </div>
      ),
    },
    {
      header: 'Valor',
      cell: (row) => <span className="font-semibold tabular-nums text-slate-800">{formatCurrency(row.amount)}</span>,
    },
    {
      header: 'Asignada por',
      cell: (row) => <span className="text-xs text-slate-600">{employeeLabel(row.createdByEmployee)}</span>,
    },
    {
      header: 'Fecha',
      cell: (row) => <span className="whitespace-nowrap text-xs text-slate-500">{formatDate(row.createdAt)}</span>,
    },
    {
      header: 'Notas',
      cell: (row) => <span className="line-clamp-1 max-w-[220px] text-xs text-slate-500">{row.notes ?? '—'}</span>,
    },
  ]

  const selectedTower = towers.find((t) => t.id === draftFilters.towerId) ?? null
  const selectedApartment = apartments.find((a) => a.id === draftFilters.apartmentId) ?? null
  const selectedResident = residents.find((r) => r.id === draftFilters.residentId) ?? null
  const selectedFineType = fineTypes.find((f) => f.id === draftFilters.fineTypeId) ?? null
  const selectedEmployee = employees.find((e) => e.id === draftFilters.createdByEmployeeId) ?? null

  function updateDraft(next: Partial<FineFilters>) {
    setDraftFilters((current) => ({ ...current, ...next }))
  }

  function clearFilters() {
    const next = { dateFrom: daysAgo(30), dateTo: toIsoDate(new Date()) }
    setDraftFilters(next)
    setFilters(next)
    setPage(1)
  }

  function applyFilters() {
    setFilters({ ...draftFilters })
    setPage(1)
  }

  return (
    <FinesLayout
      eyebrow="Multas"
      title="Histórico de multas"
      description="Consulta por torre, apartamento, residente, tipo, responsable y rango de fechas. Exporta a PDF."
    >
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Multas</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{finesQuery.data?.meta.total ?? '—'}</p>
            <p className="mt-0.5 text-xs text-slate-400">en el período filtrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Valor total</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{formatCurrency(totalAmount)}</p>
            <p className="mt-0.5 text-xs text-slate-400">suma del período</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex h-full flex-col justify-between pt-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Exportar</p>
              <p className="mt-0.5 text-xs text-slate-400">Mismo resultado en PDF</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full gap-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white"
              disabled={pdfMutation.isPending}
              onClick={() => pdfMutation.mutate()}
            >
              <Download className="size-4" />
              {pdfMutation.isPending ? 'Generando…' : 'Descargar PDF'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Presiona "Aplicar" para actualizar los resultados y el PDF.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Desde">
              <Input
                type="date"
                value={draftFilters.dateFrom ?? ''}
                onChange={(e) => updateDraft({ dateFrom: e.target.value || undefined })}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                value={draftFilters.dateTo ?? ''}
                onChange={(e) => updateDraft({ dateTo: e.target.value || undefined })}
              />
            </Field>
            <Field label="Torre">
              <TowerSelect
                open={towerOpen}
                onOpenChange={setTowerOpen}
                value={draftFilters.towerId ?? ''}
                displayValue={selectedTower?.name ?? ''}
                towers={towers}
                isLoading={towersQuery.isLoading}
                searchValue={towerSearch}
                onSearchValueChange={setTowerSearch}
                onSelect={(tower) => {
                  updateDraft({ towerId: tower.id, apartmentId: undefined, residentId: undefined })
                  setTowerOpen(false)
                }}
              />
            </Field>
            <Field label="Apartamento">
              <ApartmentSelect
                open={apartmentOpen}
                onOpenChange={setApartmentOpen}
                value={draftFilters.apartmentId ?? ''}
                displayValue={selectedApartment ? `Apt. ${selectedApartment.number}` : ''}
                apartments={apartments}
                disabled={!draftFilters.towerId}
                isLoading={apartmentsQuery.isLoading}
                searchValue={apartmentSearch}
                onSearchValueChange={setApartmentSearch}
                onSelect={(apartment) => {
                  updateDraft({ apartmentId: apartment.id, residentId: undefined })
                  setApartmentOpen(false)
                }}
              />
            </Field>
            <Field label="Residente">
              <ResidentSelect
                open={residentOpen}
                onOpenChange={setResidentOpen}
                value={draftFilters.residentId ?? ''}
                displayValue={selectedResident ? residentLabel(selectedResident) : ''}
                residents={residents}
                disabled={!draftFilters.apartmentId}
                isLoading={residentsQuery.isLoading}
                searchValue={residentSearch}
                onSearchValueChange={setResidentSearch}
                onSelect={(resident) => {
                  updateDraft({ residentId: resident.id })
                  setResidentOpen(false)
                }}
              />
            </Field>
            <Field label="Tipo de multa">
              <FineTypeSelect
                open={fineTypeOpen}
                onOpenChange={setFineTypeOpen}
                value={draftFilters.fineTypeId ?? ''}
                displayValue={selectedFineType?.name ?? ''}
                fineTypes={fineTypes}
                isLoading={fineTypesQuery.isLoading}
                searchValue={fineTypeSearch}
                onSearchValueChange={setFineTypeSearch}
                onSelect={(fineType) => {
                  updateDraft({ fineTypeId: fineType.id })
                  setFineTypeOpen(false)
                }}
              />
            </Field>
            <Field label="Asignado por">
              <EmployeeSelect
                open={employeeOpen}
                onOpenChange={setEmployeeOpen}
                value={draftFilters.createdByEmployeeId ?? ''}
                displayValue={selectedEmployee ? employeeLabel(selectedEmployee) : ''}
                employees={employees}
                isLoading={employeesQuery.isLoading}
                searchValue={employeeSearch}
                onSearchValueChange={setEmployeeSearch}
                onSelect={(employee) => {
                  updateDraft({ createdByEmployeeId: employee.id })
                  setEmployeeOpen(false)
                }}
              />
            </Field>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={applyFilters}
            >
              Aplicar filtros
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
            >
              Limpiar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Resultados</CardTitle>
          <CardDescription>Tipo y valor corresponden al snapshot guardado al asignar la multa.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={fines}
            columns={columns}
            searchPlaceholder="Buscar por apartamento, residente, tipo o notas…"
            isLoading={finesQuery.isLoading}
            emptyMessage="No hay multas para los filtros seleccionados."
            serverSide
            totalItems={finesQuery.data?.meta.total}
            currentPage={page}
            onPageChange={setPage}
            onSearchChange={(v) => { setSearch(v); setPage(1) }}
          />
        </CardContent>
      </Card>
    </FinesLayout>
  )
}

// ─── Select helpers ───────────────────────────────────────────────────────────

function TowerSelect({
  open, onOpenChange, value, displayValue, towers, isLoading, searchValue, onSearchValueChange, onSelect,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string; displayValue: string
  towers: Tower[]; isLoading?: boolean; searchValue: string; onSearchValueChange: (v: string) => void
  onSelect: (t: Tower) => void
}) {
  return (
    <FilterableSelect
      open={open} onOpenChange={onOpenChange} value={value} displayValue={displayValue}
      placeholder={isLoading ? 'Cargando torres…' : 'Selecciona torre'}
      searchPlaceholder="Buscar torre…"
      items={towers} getKey={(t) => t.id} getLabel={(t) => `${t.name} (${t.code})`}
      onSelect={onSelect} searchValue={searchValue} onSearchValueChange={onSearchValueChange}
    />
  )
}

function ApartmentSelect({
  open, onOpenChange, value, displayValue, apartments, disabled, isLoading, searchValue, onSearchValueChange, onSelect,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string; displayValue: string
  apartments: Apartment[]; disabled?: boolean; isLoading?: boolean; searchValue: string
  onSearchValueChange: (v: string) => void; onSelect: (a: Apartment) => void
}) {
  return (
    <FilterableSelect
      open={open} onOpenChange={onOpenChange} value={value} displayValue={displayValue}
      placeholder={disabled ? 'Primero selecciona torre' : isLoading ? 'Cargando apartamentos…' : 'Selecciona apartamento'}
      searchPlaceholder="Buscar apartamento…" disabled={disabled}
      items={apartments} getKey={(a) => a.id}
      getLabel={(a) => `Apt. ${a.number}${a.floor != null ? ` · Piso ${a.floor}` : ''}`}
      onSelect={onSelect} searchValue={searchValue} onSearchValueChange={onSearchValueChange}
    />
  )
}

function ResidentSelect({
  open, onOpenChange, value, displayValue, residents, disabled, isLoading, searchValue, onSearchValueChange, onSelect,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string; displayValue: string
  residents: Resident[]; disabled?: boolean; isLoading?: boolean; searchValue: string
  onSearchValueChange: (v: string) => void; onSelect: (r: Resident) => void
}) {
  return (
    <FilterableSelect
      open={open} onOpenChange={onOpenChange} value={value} displayValue={displayValue}
      placeholder={disabled ? 'Primero selecciona apartamento' : isLoading ? 'Cargando residentes…' : 'Selecciona residente (opcional)'}
      searchPlaceholder="Buscar residente…" disabled={disabled}
      items={residents} getKey={(r) => r.id}
      getLabel={(r) => `${formatName(r.name, r.lastName)} · ${r.document}`}
      onSelect={onSelect} searchValue={searchValue} onSearchValueChange={onSearchValueChange}
    />
  )
}

function FineTypeSelect({
  open, onOpenChange, value, displayValue, fineTypes, isLoading, searchValue, onSearchValueChange, onSelect,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string; displayValue: string
  fineTypes: FineType[]; isLoading?: boolean; searchValue: string
  onSearchValueChange: (v: string) => void; onSelect: (f: FineType) => void
}) {
  return (
    <FilterableSelect
      open={open} onOpenChange={onOpenChange} value={value} displayValue={displayValue}
      placeholder={isLoading ? 'Cargando tipos…' : 'Selecciona tipo'}
      searchPlaceholder="Buscar tipo de multa…"
      items={fineTypes} getKey={(f) => f.id}
      getLabel={(f) => `${f.name} · ${formatCurrency(f.value)}`}
      onSelect={onSelect} searchValue={searchValue} onSearchValueChange={onSearchValueChange}
    />
  )
}

function EmployeeSelect({
  open, onOpenChange, value, displayValue, employees, isLoading, searchValue, onSearchValueChange, onSelect,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string; displayValue: string
  employees: Employee[]; isLoading?: boolean; searchValue: string
  onSearchValueChange: (v: string) => void; onSelect: (e: Employee) => void
}) {
  return (
    <FilterableSelect
      open={open} onOpenChange={onOpenChange} value={value} displayValue={displayValue}
      placeholder={isLoading ? 'Cargando equipo…' : 'Selecciona responsable'}
      searchPlaceholder="Buscar empleado…"
      items={employees} getKey={(e) => e.id}
      getLabel={(e) => `${formatName(e.name, e.lastName)} · ${e.username}`}
      onSelect={onSelect} searchValue={searchValue} onSearchValueChange={onSearchValueChange}
    />
  )
}
