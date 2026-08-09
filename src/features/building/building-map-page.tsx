import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Bell, Package, DoorOpen, ArrowLeft, ChevronRight, LogOut, Search, X, PhoneCall, Zap } from 'lucide-react'
import { useScanInput, extractDocumentFromBarcode } from '@/hooks/use-webhid-scanner'
import { parseColombianCedula } from '@/lib/colombian-cedula'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { FilterableSelect } from '@/components/ui/filterable-select'
import { Textarea } from '@/components/ui/textarea'
import { ImageCaptureControl } from '@/components/ui/image-capture-control'
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog'
import { api } from '@/lib/api'
import { UPLOADS_URL } from '@/lib/constants'
import { useAuth } from '@/hooks/use-auth-context'
import { cn, formatDate, formatDocument, formatName, normalizePlate } from '@/lib/utils'
import { toast } from 'sonner'
import { useCalls } from '@/features/calls/use-calls'
import type { AccessAudit, Apartment, PlateLocationResult, Resident, Tower, Visitor, VisitorSearchResult } from '@/types/api'

// ─── Cache config ─────────────────────────────────────────────────────────────

const STALE_5MIN = 5 * 60 * 1000
const STALE_1MIN = 60 * 1000

// ─── Tower palette ────────────────────────────────────────────────────────────

const PALETTE = [
  {
    header: 'bg-indigo-600',
    cell: 'bg-white border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200',
    occupied: 'bg-indigo-100 border-indigo-300 hover:bg-indigo-150',
    dot: 'bg-indigo-500',
    ring: 'ring-indigo-500',
    legend: 'bg-indigo-500',
    actionBg: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100',
    actionText: 'text-indigo-700',
    actionIcon: 'text-indigo-400',
  },
  {
    header: 'bg-emerald-600',
    cell: 'bg-white border-emerald-100 hover:bg-emerald-50 hover:border-emerald-200',
    occupied: 'bg-emerald-100 border-emerald-300 hover:bg-emerald-150',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500',
    legend: 'bg-emerald-500',
    actionBg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
    actionText: 'text-emerald-700',
    actionIcon: 'text-emerald-400',
  },
  {
    header: 'bg-amber-500',
    cell: 'bg-white border-amber-100 hover:bg-amber-50 hover:border-amber-200',
    occupied: 'bg-amber-100 border-amber-300 hover:bg-amber-150',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500',
    legend: 'bg-amber-500',
    actionBg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    actionText: 'text-amber-700',
    actionIcon: 'text-amber-400',
  },
  {
    header: 'bg-rose-600',
    cell: 'bg-white border-rose-100 hover:bg-rose-50 hover:border-rose-200',
    occupied: 'bg-rose-100 border-rose-300 hover:bg-rose-150',
    dot: 'bg-rose-500',
    ring: 'ring-rose-500',
    legend: 'bg-rose-500',
    actionBg: 'bg-rose-50 border-rose-200 hover:bg-rose-100',
    actionText: 'text-rose-700',
    actionIcon: 'text-rose-400',
  },
  {
    header: 'bg-cyan-600',
    cell: 'bg-white border-cyan-100 hover:bg-cyan-50 hover:border-cyan-200',
    occupied: 'bg-cyan-100 border-cyan-300 hover:bg-cyan-150',
    dot: 'bg-cyan-500',
    ring: 'ring-cyan-500',
    legend: 'bg-cyan-500',
    actionBg: 'bg-cyan-50 border-cyan-200 hover:bg-cyan-100',
    actionText: 'text-cyan-700',
    actionIcon: 'text-cyan-400',
  },
  {
    header: 'bg-violet-600',
    cell: 'bg-white border-violet-100 hover:bg-violet-50 hover:border-violet-200',
    occupied: 'bg-violet-100 border-violet-300 hover:bg-violet-150',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500',
    legend: 'bg-violet-500',
    actionBg: 'bg-violet-50 border-violet-200 hover:bg-violet-100',
    actionText: 'text-violet-700',
    actionIcon: 'text-violet-400',
  },
]

function palette(idx: number) {
  return PALETTE[idx % PALETTE.length]
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const notifySchema = z.object({
  notificationTypeId: z.string().uuid('Selecciona un tipo'),
  message: z.string().min(4, 'Mínimo 4 caracteres'),
})

const pkgSchema = z.object({
  residentId: z.string().optional().or(z.literal('')),
  description: z.string().max(300).optional().or(z.literal('')),
})

const createVisitorSchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  lastName: z.string().min(2, 'Mínimo 2 caracteres'),
  document: z.string().max(50).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
})

const ACCESS_ENTRY_OPTIONS = [
  { value: 'pedestrian', label: 'A pie' },
  { value: 'car', label: 'Carro' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'other', label: 'Otros' },
] as const

const ACCESS_VISITOR_CATEGORY_OPTIONS = [
  { value: 'visita', label: 'Visita' },
  { value: 'domiciliario', label: 'Domiciliario' },
] as const

type AccessPhase =
  | { kind: 'idle' }
  | { kind: 'not_found'; document: string }
  | { kind: 'ready'; visitor: Visitor }

type ApartmentExitPhase =
  | { kind: 'idle' }
  | { kind: 'not_found' }
  | { kind: 'no_open_access'; visitor: Visitor }
  | { kind: 'ready'; visitor: Visitor; openAccess: AccessAudit }

function resolveUploadPath(path?: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${UPLOADS_URL}/${path.replace(/^\/+/, '')}`
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
  if (typeof message === 'string') return message
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0]
  return fallback
}

function vehicleTypeToEntryType(vehicleType?: string | null): AccessAudit['entryType'] {
  if (vehicleType === 'motorcycle') return 'motorcycle'
  return 'car'
}

// ─── Apartment cell ───────────────────────────────────────────────────────────

function AptCell({
  apt,
  color,
  isSelected,
  pendingPkgs,
  unreadNotifs,
  onClick,
}: {
  apt: Apartment
  color: (typeof PALETTE)[number]
  isSelected: boolean
  pendingPkgs: number
  unreadNotifs: number
  onClick: () => void
}) {
  const occupied = (apt.residentCount ?? 0) > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border text-center',
        'h-full min-h-0 w-full cursor-pointer select-none transition-all duration-100',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        occupied ? color.occupied : color.cell,
        isSelected && `ring-2 ring-offset-1 ${color.ring} shadow-md scale-105 z-10`,
        !isSelected && 'hover:scale-[1.04] hover:shadow-sm hover:z-10',
      )}
    >
      <span
        className={cn(
          'text-xs font-bold leading-tight tracking-tight',
          occupied ? 'text-slate-800' : 'text-slate-400',
        )}
      >
        {apt.number}
      </span>

      <span
        className={cn(
          'mt-1 size-1.5 rounded-full',
          occupied ? color.dot : 'bg-slate-200',
        )}
      />

      {(pendingPkgs > 0 || unreadNotifs > 0) && (
        <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
          {pendingPkgs > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white">
              {pendingPkgs > 9 ? '9+' : pendingPkgs}
            </span>
          )}
          {unreadNotifs > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white shadow-sm ring-1 ring-white">
              {unreadNotifs > 9 ? '9+' : unreadNotifs}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

type QuickAptResult = {
  apt: Apartment
  tower: Tower
  towerIdx: number
  label: string
  detail: string
}

function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function buildQuickApartmentResults(apartments: Apartment[], towers: Tower[], search: string): QuickAptResult[] {
  const query = normalizeSearchValue(search)
  if (!query) return []

  const results: QuickAptResult[] = []
  const towerById = new Map(towers.map((tower, index) => [tower.id, { tower, index }]))

  for (const apt of apartments) {
    const towerEntry = towerById.get(apt.towerId)
    if (!towerEntry) continue
    const { tower, index: towerIdx } = towerEntry

    const haystack = normalizeSearchValue(
      [
        tower.name,
        tower.code,
        `torre ${tower.name}`,
        `torre ${tower.code}`,
        apt.number,
        `apto ${apt.number}`,
        `apartamento ${apt.number}`,
        apt.floor != null ? `piso ${apt.floor}` : '',
        `${tower.name} ${apt.number}`,
        `${tower.code} ${apt.number}`,
      ].join(' '),
    )

    if (!haystack.includes(query)) continue

    results.push({
      apt,
      tower,
      towerIdx,
      label: `${tower.name} · Apt. ${apt.number}`,
      detail: `Piso ${apt.floor ?? 'N/A'} · ${apt.residentCount ?? 0} residente${(apt.residentCount ?? 0) === 1 ? '' : 's'}`,
    })
  }

  return results
    .sort((a, b) => a.tower.name.localeCompare(b.tower.name) || a.apt.number.localeCompare(b.apt.number))
    .slice(0, 8)
}

function QuickApartmentSearch({
  value,
  onChange,
  results,
  onSelect,
}: {
  value: string
  onChange: (value: string) => void
  results: QuickAptResult[]
  onSelect: (result: QuickAptResult) => void
}) {
  const query = value.trim()

  return (
    <div className="relative w-full min-w-[220px] sm:w-72">
      <Search className="absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar torre o apto"
        className="h-9 pl-9 text-sm"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) {
            event.preventDefault()
            onSelect(results[0])
          }
        }}
      />

      {query && (
        <div className="absolute right-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-slate-400">Sin apartamentos encontrados</div>
          ) : (
            <div className="max-h-72 overflow-y-auto p-1">
              {results.map((result) => (
                <button
                  key={result.apt.id}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-left text-sm transition hover:bg-slate-100"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{result.label}</span>
                    <span className="block truncate text-xs text-slate-400">{result.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getPlateMatchApartment(match: PlateLocationResult['matches'][number]) {
  if (match.kind === 'resident_vehicle') return match.vehicle.apartment ?? null
  return match.lastAccess.apartment ?? null
}

function formatApartmentLocation(apartment?: Apartment | null) {
  if (!apartment) return 'Apartamento no asociado'
  const tower = apartment.towerData?.name ?? apartment.towerData?.code ?? apartment.tower
  return `${tower ? `${tower} · ` : ''}Apt. ${apartment.number}`
}

function PlateLocationSearch({
  value,
  result,
  isLoading,
  onChange,
  onSearch,
  onClear,
  onSelectApartment,
}: {
  value: string
  result?: PlateLocationResult
  isLoading: boolean
  onChange: (value: string) => void
  onSearch: () => void
  onClear: () => void
  onSelectApartment: (apartmentId: string) => void
}) {
  const query = value.trim()
  const matches = result?.matches ?? []
  const hasResidentMatch = matches.some((match) => match.kind === 'resident_vehicle')
  const hasVisitorMatch = matches.some((match) => match.kind === 'visitor')
  const resultLabel = hasResidentMatch && hasVisitorMatch
    ? 'Aparece en residentes y visitantes'
    : hasResidentMatch
      ? 'Aparece en residentes'
      : hasVisitorMatch
        ? 'Aparece en visitantes'
        : null

  return (
    <div className="relative w-full min-w-[220px] sm:w-80">
      <Search className="absolute left-3 top-1/2 z-10 size-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar placa"
        className="h-9 pl-9 pr-20 text-sm uppercase"
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onSearch()
          }
        }}
      />
      <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
        {query && (
          <button
            type="button"
            onClick={onClear}
            className="flex size-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Limpiar placa"
          >
            <X className="size-3.5" />
          </button>
        )}
        <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={!query || isLoading} onClick={onSearch}>
          {isLoading ? 'Buscando' : 'Buscar'}
        </Button>
      </div>

      {result && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,520px)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className={cn('border-b px-5 py-4', resultLabel ? 'border-emerald-100 bg-emerald-50' : 'border-rose-100 bg-rose-50')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={cn('text-xs font-bold uppercase tracking-wide', resultLabel ? 'text-emerald-700' : 'text-rose-700')}>
                  Placa consultada
                </p>
                <p className={cn('mt-1 text-3xl font-black tracking-wide', resultLabel ? 'text-emerald-950' : 'text-rose-900')}>
                  {result.plate || normalizePlate(value)}
                </p>
              </div>
              {resultLabel && (
                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-100">
                  {matches.length === 2 ? '2 coincidencias' : '1 coincidencia'}
                </span>
              )}
            </div>
            <p className={cn('mt-3 text-xl font-bold', resultLabel ? 'text-emerald-950' : 'text-rose-900')}>
              {resultLabel ?? 'No aparece registrada ni en visitantes'}
            </p>
          </div>

          {matches.length > 0 && (
            <div className="max-h-[420px] overflow-y-auto p-3">
              {matches.map((match) => {
                const apartment = getPlateMatchApartment(match)
                const key = match.kind === 'resident_vehicle'
                  ? `resident-${match.vehicle.id}`
                  : `visitor-${match.lastAccess.id}`

                return (
                  <div key={key} className="rounded-lg border border-slate-200 px-5 py-4 text-base">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
                          match.kind === 'resident_vehicle' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700',
                        )}>
                          {match.kind === 'resident_vehicle' ? 'Vehículo de residente' : 'Placa de visitante'}
                        </span>
                        <p className="mt-3 text-2xl font-black text-slate-900">{formatApartmentLocation(apartment)}</p>
                      </div>
                      {apartment?.id && (
                        <button
                          type="button"
                          onClick={() => onSelectApartment(apartment.id)}
                          className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-700"
                        >
                          Abrir apto
                        </button>
                      )}
                    </div>

                    {match.kind === 'resident_vehicle' ? (
                      <div className="mt-4 space-y-2 text-base text-slate-600">
                        <p>
                          {[match.vehicle.vehicleBrand?.name, match.vehicle.model, match.vehicle.color]
                            .filter(Boolean)
                            .join(' · ') || 'Sin detalle del vehículo'}
                        </p>
                        <p>
                          Residentes:{' '}
                          <span className="font-bold text-slate-800">
                            {match.residents.length
                              ? match.residents.map((resident) => formatName(resident.name, resident.lastName)).join(', ')
                              : 'Sin residentes activos asociados'}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2 text-base text-slate-600">
                        <p>
                          Visitante:{' '}
                          <span className="font-bold text-slate-800">
                            {formatName(match.lastAccess.visitor?.name, match.lastAccess.visitor?.lastName) || 'Sin visitante'}
                          </span>
                        </p>
                        <p>Ultimo ingreso: {formatDate(match.lastAccess.entryTime)}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Apt detail dialog ────────────────────────────────────────────────────────

type DialogView = 'info' | 'notify' | 'package' | 'access' | 'exit'
type PackageResidentOption = Pick<Resident, 'id' | 'name' | 'lastName'>

function AptDetailDialog({
  open,
  onClose,
  apartment,
  tower,
  towerIdx,
  pendingPkgs,
  unreadNotifs,
  canManageAccess,
  canManagePackages,
  canNotify,
  canCall,
}: {
  open: boolean
  onClose: () => void
  apartment: Apartment
  tower: Tower
  towerIdx: number
  pendingPkgs: number
  unreadNotifs: number
  canManageAccess: boolean
  canManagePackages: boolean
  canNotify: boolean
  canCall: boolean
}) {
  const queryClient = useQueryClient()
  const { call, startApartmentCall } = useCalls()
  const [view, setView] = useState<DialogView>('info')
  const color = palette(towerIdx)

  // Residents in this apartment
  const residentsQuery = useQuery({
    queryKey: ['residents', { apartmentId: apartment.id }],
    queryFn: () => api.getResidents({ apartmentId: apartment.id, limit: 200 }),
    enabled: open,
    staleTime: STALE_1MIN,
  })
  const residents = residentsQuery.data?.data ?? []

  // Vehicles registered to this apartment
  const vehiclesQuery = useQuery({
    queryKey: ['resident-vehicles', { apartmentId: apartment.id }],
    queryFn: () => api.getResidentVehiclesByApartment(apartment.id),
    enabled: open,
    staleTime: STALE_1MIN,
  })
  const vehicles = vehiclesQuery.data ?? []

  // Top 5 most frequent visitors to this apartment
  const frequentVisitorsQuery = useQuery({
    queryKey: ['frequent-visitors', apartment.id],
    queryFn: () => api.getFrequentVisitors(apartment.id, 5),
    enabled: open,
    staleTime: STALE_1MIN,
  })
  const frequentVisitors = frequentVisitorsQuery.data ?? []

  // Notification types (only when notify view is active)
  const notifTypesQuery = useQuery({
    queryKey: ['notification-types'],
    queryFn: api.getNotificationTypes,
    enabled: canNotify && open && view === 'notify',
    staleTime: STALE_5MIN,
  })
  const notifTypes = notifTypesQuery.data ?? []

  // ── Access state ──
  const [accessPhase, setAccessPhase] = useState<AccessPhase>({ kind: 'idle' })
  const [accessSearchDoc, setAccessSearchDoc] = useState('')
  const [accessPlateSearch, setAccessPlateSearch] = useState('')
  const [accessEntryType, setAccessEntryType] = useState<(typeof ACCESS_ENTRY_OPTIONS)[number]['value']>('pedestrian')
  const [accessVisitorCategory, setAccessVisitorCategory] = useState<(typeof ACCESS_VISITOR_CATEGORY_OPTIONS)[number]['value']>('visita')
  const [accessVehicleBrandId, setAccessVehicleBrandId] = useState('')
  const [accessVehicleColor, setAccessVehicleColor] = useState('')
  const [accessVehiclePlate, setAccessVehiclePlate] = useState('')
  const [accessVehicleModel, setAccessVehicleModel] = useState('')
  const [accessNotes, setAccessNotes] = useState('')
  const [accessPhoto, setAccessPhoto] = useState<File | null>(null)
  const [accessHistoryPhotoPath, setAccessHistoryPhotoPath] = useState<string | null>(null)
  const [accessBrandOpen, setAccessBrandOpen] = useState(false)
  const [accessBrandSearch, setAccessBrandSearch] = useState('')
  const [accessSubmitting, setAccessSubmitting] = useState(false)
  const [createVisitorSubmitting, setCreateVisitorSubmitting] = useState(false)
  const [notifySubmitting, setNotifySubmitting] = useState(false)
  const [packageSubmitting, setPackageSubmitting] = useState(false)
  const [exitSearchDoc, setExitSearchDoc] = useState('')
  const [exitPhase, setExitPhase] = useState<ApartmentExitPhase>({ kind: 'idle' })
  const [exitSubmitting, setExitSubmitting] = useState(false)
  const activeAccessVisitor = accessPhase.kind === 'ready' ? accessPhase.visitor : null

  const accessIsCarOrMoto = accessEntryType === 'car' || accessEntryType === 'motorcycle'
  const accessIsTaxi = accessEntryType === 'taxi'
  const accessShowVehicleSection = accessIsCarOrMoto || accessIsTaxi
  const accessPhotoPreview = useMemo(() => (accessPhoto ? URL.createObjectURL(accessPhoto) : null), [accessPhoto])
  const accessHistoryPhotoPreview = useMemo(() => resolveUploadPath(accessHistoryPhotoPath), [accessHistoryPhotoPath])
  const effectiveAccessPhotoPreview = accessPhotoPreview ?? accessHistoryPhotoPreview

  function resetAccessVehicleFields() {
    setAccessVehicleBrandId('')
    setAccessVehicleColor('')
    setAccessVehiclePlate('')
    setAccessVehicleModel('')
    setAccessBrandOpen(false)
    setAccessBrandSearch('')
  }

  function handleAccessEntryTypeChange(value: (typeof ACCESS_ENTRY_OPTIONS)[number]['value']) {
    setAccessEntryType(value)
    const isVehicleType = value === 'car' || value === 'motorcycle' || value === 'taxi'
    if (!isVehicleType) {
      resetAccessVehicleFields()
      return
    }
    // When switching to taxi, clear brand (not required)
    if (value === 'taxi') {
      setAccessVehicleBrandId('')
      setAccessBrandOpen(false)
      setAccessBrandSearch('')
    }
  }

  useEffect(
    () => () => {
      if (accessPhotoPreview) URL.revokeObjectURL(accessPhotoPreview)
    },
    [accessPhotoPreview],
  )

  const vehicleBrandsQuery = useQuery({
    queryKey: ['vehicle-brands'],
    queryFn: api.getVehicleBrands,
    enabled: canManageAccess && open && view === 'access',
    staleTime: STALE_5MIN,
  })

  const createVisitorForm = useForm<z.infer<typeof createVisitorSchema>>({
    resolver: zodResolver(createVisitorSchema),
    defaultValues: { name: '', lastName: '', document: '', phone: '' },
  })

  const createVisitorMutation = useMutation({
    mutationFn: api.createVisitor,
    onSuccess: (visitor) => {
      toast.success('Visitante registrado')
      createVisitorForm.reset()
      void queryClient.invalidateQueries({ queryKey: ['visitors'] })
      setAccessPhase({ kind: 'ready', visitor: visitor as Visitor })
      applyAccessDefaults(null)
      setAccessNotes('')
    },
    onError: () => toast.error('No fue posible crear el visitante'),
    onSettled: () => setCreateVisitorSubmitting(false),
  })

  const searchVisitorMutation = useMutation({
    mutationFn: api.searchVisitorByDocument,
    onSuccess: (result) => {
      if (!result.visitor) {
        const searchedDocument = accessSearchDoc.trim()
        setAccessPhase({ kind: 'not_found', document: searchedDocument })
        createVisitorForm.setValue('document', searchedDocument)
        const cedula = parseColombianCedula(lastScannedTextRef.current)
        if (cedula && cedula.documentNumber === searchedDocument) {
          createVisitorForm.setValue('name', `${cedula.firstName1} ${cedula.firstName2}`.trim())
          createVisitorForm.setValue('lastName', `${cedula.lastName1} ${cedula.lastName2}`.trim())
        }
        applyAccessDefaults(null)
        return
      }

      toast.success('Visitante encontrado')
      setAccessPhase({ kind: 'ready', visitor: result.visitor })
      applyAccessDefaults(result)
      setAccessNotes('')
    },
    onError: () => toast.error('No fue posible consultar el visitante'),
  })

  const accessMutation = useMutation({
    mutationFn: ({ payload, photo }: { payload: Record<string, unknown>; photo?: File | null }) =>
      api.createAccessAudit(payload, photo ?? undefined),
    onSuccess: () => {
      toast.success('Ingreso registrado')
      setAccessPhase({ kind: 'idle' })
      setAccessSearchDoc('')
      setAccessPlateSearch('')
      setAccessEntryType('pedestrian')
      setAccessVisitorCategory('visita')
      resetAccessVehicleFields()
      setAccessNotes('')
      setAccessPhoto(null)
      setAccessHistoryPhotoPath(null)
      void queryClient.invalidateQueries({ queryKey: ['access-audit'] })
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'No fue posible registrar el ingreso')),
    onSettled: () => {
      setAccessSubmitting(false)
    },
  })

  function applyAccessDefaultsFromAudit(lastAccess: AccessAudit) {
    const entryType = lastAccess.entryType ?? 'pedestrian'
    const hasVehicleData = entryType === 'car' || entryType === 'motorcycle' || entryType === 'taxi'
    const lastIsCarOrMoto = entryType === 'car' || entryType === 'motorcycle'

    setAccessEntryType(entryType)
    setAccessVisitorCategory(lastAccess.visitorCategory ?? 'visita')
    setAccessVehicleBrandId(lastIsCarOrMoto ? lastAccess.vehicleBrandId ?? '' : '')
    setAccessVehicleColor(hasVehicleData ? lastAccess.vehicleColor ?? '' : '')
    setAccessVehiclePlate(hasVehicleData ? lastAccess.vehiclePlate ?? '' : '')
    setAccessVehicleModel(hasVehicleData ? lastAccess.vehicleModel ?? '' : '')
    setAccessBrandOpen(false)
    setAccessBrandSearch('')
    setAccessPhoto(null)
    setAccessHistoryPhotoPath(lastAccess.visitor?.photoPath?.trim() || lastAccess.visitorPhotoPath?.trim() || null)
  }

  const plateSearchMutation = useMutation({
    mutationFn: api.searchAccessByPlate,
    onSuccess: (result) => {
      if (result.kind === 'not_found') {
        toast.error(`Placa ${result.plate} no está registrada`)
        return
      }

      if (result.kind === 'resident_vehicle') {
        const resident = result.residents[0]
        if (!resident) {
          toast.error(`La placa ${result.plate} no tiene residentes activos asociados`)
          return
        }

        const vehicle = result.vehicle
        accessMutation.mutate({
          payload: {
            residentId: resident.id,
            apartmentId: apartment.id,
            entryType: vehicleTypeToEntryType(vehicle.vehicleType),
            vehicleBrandId: vehicle.vehicleBrandId,
            vehicleColor: vehicle.color ?? undefined,
            vehiclePlate: vehicle.plate,
            vehicleModel: vehicle.model ?? undefined,
            notes: 'Entrada rápida por placa',
          },
        })
        setAccessPlateSearch('')
        return
      }

      if (!result.lastAccess.visitor) {
        toast.error('La placa tiene historial, pero no tiene visitante asociado')
        return
      }

      toast.success('Visitante encontrado por placa')
      setAccessPhase({ kind: 'ready', visitor: result.lastAccess.visitor })
      setAccessSearchDoc(result.lastAccess.visitor.document ?? '')
      applyAccessDefaultsFromAudit(result.lastAccess)
      setAccessPlateSearch('')
    },
    onError: () => toast.error('No fue posible consultar la placa'),
  })

  function applyAccessDefaults(searchResult: VisitorSearchResult | null) {
    const entryType = searchResult?.lastAccess?.entryType ?? 'pedestrian'
    const hasVehicleData = entryType === 'car' || entryType === 'motorcycle' || entryType === 'taxi'
    const lastIsCarOrMoto = entryType === 'car' || entryType === 'motorcycle'

    setAccessEntryType(entryType)
    setAccessVisitorCategory(searchResult?.lastAccess?.visitorCategory ?? 'visita')
    setAccessVehicleBrandId(lastIsCarOrMoto ? searchResult?.lastAccess?.vehicleBrandId ?? '' : '')
    setAccessVehicleColor(hasVehicleData ? searchResult?.lastAccess?.vehicleColor ?? '' : '')
    setAccessVehiclePlate(hasVehicleData ? searchResult?.lastAccess?.vehiclePlate ?? '' : '')
    setAccessVehicleModel(hasVehicleData ? searchResult?.lastAccess?.vehicleModel ?? '' : '')
    setAccessBrandOpen(false)
    setAccessBrandSearch('')

    setAccessPhoto(null)
    setAccessHistoryPhotoPath(
      searchResult?.visitor?.photoPath?.trim() ||
      searchResult?.lastAccess?.visitorPhotoPath?.trim() ||
      null
    )
  }

  const lastScannedTextRef = useRef('')

  const canScanBarcode = open && view === 'access' && (accessPhase.kind === 'idle' || accessPhase.kind === 'not_found')
  useScanInput((value: string) => {
    const doc = extractDocumentFromBarcode(value)
    console.log('[scanner] raw value:', JSON.stringify(value))
    console.log('[scanner] extracted document:', doc)
    lastScannedTextRef.current = value
    setAccessSearchDoc(doc)
    searchVisitorMutation.mutate(doc)
  }, canScanBarcode)

  const canScanExit = open && view === 'exit' && exitPhase.kind !== 'ready'
  useScanInput((value: string) => {
    const doc = extractDocumentFromBarcode(value)
    setExitSearchDoc(doc)
    searchOpenAccessMutation.mutate(doc)
  }, canScanExit)

  function handleQuickEntry(entry: {
    visitor: Visitor
    vehiclePlate: string | null
    vehicleBrandId?: string | null
    vehicleColor?: string | null
    vehicleModel?: string | null
    entryType: string
  }) {
    setView('access')
    setAccessPhase({ kind: 'ready', visitor: entry.visitor })
    setAccessSearchDoc(entry.visitor.document ?? '')
    const hasVehicle = entry.entryType === 'car' || entry.entryType === 'motorcycle' || entry.entryType === 'taxi'
    const isCarOrMoto = entry.entryType === 'car' || entry.entryType === 'motorcycle'
    setAccessEntryType(entry.entryType as typeof accessEntryType)
    setAccessVisitorCategory('visita')
    setAccessVehiclePlate(hasVehicle && entry.vehiclePlate ? entry.vehiclePlate : '')
    if (isCarOrMoto) {
      setAccessVehicleBrandId(entry.vehicleBrandId ?? '')
      setAccessVehicleColor(entry.vehicleColor ?? '')
      setAccessVehicleModel(entry.vehicleModel ?? '')
    } else {
      setAccessVehicleBrandId('')
      setAccessVehicleColor('')
      setAccessVehicleModel('')
    }
    setAccessHistoryPhotoPath(entry.visitor.photoPath?.trim() || null)
    setAccessPhoto(null)
    setAccessNotes('')
  }

  function handleAccessSearch() {
    const normalizedDocument = accessSearchDoc.trim()
    if (!normalizedDocument) return
    searchVisitorMutation.mutate(normalizedDocument)
  }

  function handleAccessPlateSearch() {
    const normalizedPlate = accessPlateSearch.trim()
    if (!normalizedPlate) return
    plateSearchMutation.mutate(normalizedPlate)
  }

  const searchOpenAccessMutation = useMutation({
    mutationFn: api.searchOpenAccessByDocument,
    onSuccess: (result) => {
      if (!result.visitor) {
        setExitPhase({ kind: 'not_found' })
        return
      }
      if (!result.openAccess) {
        setExitPhase({ kind: 'no_open_access', visitor: result.visitor })
        return
      }
      setExitPhase({ kind: 'ready', visitor: result.visitor, openAccess: result.openAccess })
    },
    onError: () => toast.error('No fue posible consultar el visitante'),
  })

  const registerExitMutation = useMutation({
    mutationFn: (id: string) => api.registerExit(id),
    onSuccess: () => {
      toast.success('Salida registrada')
      resetExitState()
      void queryClient.invalidateQueries({ queryKey: ['access-audit'] })
      void queryClient.invalidateQueries({ queryKey: ['access-audit-stats'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'No fue posible registrar la salida')),
    onSettled: () => setExitSubmitting(false),
  })

  function resetExitState() {
    setExitSearchDoc('')
    setExitPhase({ kind: 'idle' })
    setExitSubmitting(false)
  }

  function handleExitSearch() {
    const normalizedDocument = exitSearchDoc.trim()
    if (!normalizedDocument) return
    searchOpenAccessMutation.mutate(normalizedDocument)
  }

  function handleConfirmExit() {
    if (exitPhase.kind !== 'ready') return
    if (exitSubmitting) return
    setExitSubmitting(true)
    registerExitMutation.mutate(exitPhase.openAccess.id)
  }

  function handleRegisterAccess(visitorId: string) {
    if (accessSubmitting) return
    setAccessSubmitting(true)

    const existingPhoto = accessHistoryPhotoPath?.trim() || null

    if (accessIsCarOrMoto && !accessVehicleBrandId) {
      setAccessSubmitting(false)
      toast.error('Selecciona la marca del vehículo')
      return
    }

    if (accessShowVehicleSection && !accessVehiclePlate.trim()) {
      setAccessSubmitting(false)
      toast.error('Ingresa la placa del vehículo')
      return
    }

    const payload: Record<string, unknown> = {
      visitorId,
      apartmentId: apartment.id,
      entryType: accessEntryType,
      visitorCategory: accessVisitorCategory,
      ...(accessPhoto ? {} : { visitorPhotoPath: existingPhoto ?? undefined }),
      ...(accessNotes.trim() ? { notes: accessNotes.trim() } : {}),
    }

    if (accessShowVehicleSection) {
      if (accessIsCarOrMoto) payload.vehicleBrandId = accessVehicleBrandId
      payload.vehicleColor = accessVehicleColor.trim() || undefined
      payload.vehiclePlate = accessVehiclePlate.trim().toUpperCase()
      payload.vehicleModel = accessVehicleModel.trim() || undefined
    }

    accessMutation.mutate({ payload, photo: accessPhoto })
  }

  // ── Notify form ──
  const notifyForm = useForm<z.infer<typeof notifySchema>>({
    resolver: zodResolver(notifySchema),
    defaultValues: { notificationTypeId: '', message: '' },
  })
  const selectedTypeId = useWatch({ control: notifyForm.control, name: 'notificationTypeId' })

  const notifyMutation = useMutation({
    mutationFn: () =>
      api.createNotification({
        apartmentId: apartment.id,
        notificationTypeId: notifyForm.getValues('notificationTypeId'),
        message: notifyForm.getValues('message'),
      }),
    onSuccess: () => {
      toast.success('Notificación enviada')
      notifyForm.reset()
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      onClose()
    },
    onError: () => toast.error('No fue posible enviar la notificación'),
    onSettled: () => setNotifySubmitting(false),
  })

  // ── Package form ──
  const pkgForm = useForm<z.infer<typeof pkgSchema>>({
    resolver: zodResolver(pkgSchema),
    defaultValues: { residentId: '', description: '' },
  })
  const selectedResidentId = useWatch({ control: pkgForm.control, name: 'residentId' })
  const selectedResident = residents.find((r) => r.id === selectedResidentId)
  const packageResidentOptions: PackageResidentOption[] = [
    { id: '', name: 'Sin residente específico', lastName: '' },
    ...residents,
  ]
  const [packagePhotos, setPackagePhotos] = useState<File[]>([])
  const [packageResidentOpen, setPackageResidentOpen] = useState(false)
  const [packageResidentSearch, setPackageResidentSearch] = useState('')

  const pkgMutation = useMutation({
    mutationFn: () => {
      const residentId = pkgForm.getValues('residentId')
      const description = pkgForm.getValues('description')
      return api.createPackage({
        apartmentId: apartment.id,
        ...(residentId ? { residentId } : {}),
        ...(description ? { description } : {}),
      }, packagePhotos)
    },
    onSuccess: () => {
      toast.success('Paquete registrado')
      pkgForm.reset()
      setPackagePhotos([])
      void queryClient.invalidateQueries({ queryKey: ['packages'] })
      onClose()
    },
    onError: () => toast.error('No fue posible registrar el paquete'),
    onSettled: () => setPackageSubmitting(false),
  })

  function handlePackagePhotoSelection(selectedFiles: File[]) {
    if (selectedFiles.length > 0) {
      setPackagePhotos((current) => [...current, ...selectedFiles].slice(0, 10))
    }
  }

  function removePackagePhoto(index: number) {
    setPackagePhotos((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function resetDialogState() {
    setView('info')
    setAccessPhase({ kind: 'idle' })
    setAccessSearchDoc('')
    setAccessPlateSearch('')
    setAccessEntryType('pedestrian')
    setAccessVisitorCategory('visita')
    resetAccessVehicleFields()
    setAccessNotes('')
    setAccessPhoto(null)
    setAccessHistoryPhotoPath(null)
    setAccessSubmitting(false)
    setCreateVisitorSubmitting(false)
    setNotifySubmitting(false)
    setPackageSubmitting(false)
    resetExitState()
    pkgForm.reset()
    setPackagePhotos([])
    setPackageResidentOpen(false)
    setPackageResidentSearch('')
  }

  const occupiedFromSummary = (apartment.residentCount ?? 0) > 0
  const occupied = residentsQuery.isSuccess ? residents.length > 0 : occupiedFromSummary
  const residentsCountLabel = residentsQuery.isSuccess ? residents.length : (apartment.residentCount ?? 0)
  const canRenderCallAction = canCall && (residentsQuery.isLoading || occupied)
  const hasAvailableActions =
    canManageAccess ||
    canManagePackages ||
    canNotify ||
    canRenderCallAction

  async function handleStartCall() {
    try {
      await startApartmentCall(apartment)
      toast.success('Llamada iniciada')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No fue posible iniciar la llamada')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetDialogState()
          onClose()
        }
      }}
    >
      <DialogContent className="w-[min(96vw,480px)] max-h-[90vh] p-0 overflow-hidden gap-0 flex flex-col">
        {/* Colored header */}
        <div className={cn('px-5 py-4', color.header)}>
          {view !== 'info' && (
            <button
              type="button"
              onClick={() => {
                setView('info')
                setAccessPhase({ kind: 'idle' })
                setAccessSearchDoc('')
                setAccessPlateSearch('')
                setAccessEntryType('pedestrian')
                setAccessVisitorCategory('visita')
                resetAccessVehicleFields()
                setAccessNotes('')
                setAccessPhoto(null)
                setAccessHistoryPhotoPath(null)
                resetExitState()
              }}
              className="mb-2 flex items-center gap-1 text-xs text-white/70 hover:text-white transition"
            >
              <ArrowLeft className="size-3" />
              Volver
            </button>
          )}
          <DialogHeader>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
              {tower.name}
            </p>
            <DialogTitle className="text-2xl font-bold text-white mt-0.5">
              Apt. {apartment.number}
            </DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              Piso {apartment.floor ?? '—'} ·{' '}
              {occupied
                ? `${residentsCountLabel} residente${residentsCountLabel !== 1 ? 's' : ''}`
                : residentsQuery.isLoading
                  ? 'Verificando residentes...'
                  : 'Sin residentes'}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 p-5 overflow-y-auto pb-6 touch-pan-y">
          {/* ── Info view ── */}
          {view === 'info' && (
            <div className="space-y-5">
              {/* Actions */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Acciones
                </p>
                <div className="grid gap-2">
                  {canManageAccess && (
                    <button
                      type="button"
                      onClick={() => setView('access')}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white">
                        <DoorOpen className="size-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">Registrar visitante</p>
                        <p className="text-xs text-slate-400 mt-0.5">Marcar ingreso de visita</p>
                      </div>
                      <ChevronRight className="size-4 text-slate-300 shrink-0" />
                    </button>
                  )}

                  {canManageAccess && (
                    <button
                      type="button"
                      onClick={() => setView('exit')}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white">
                        <LogOut className="size-4 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">Registrar salida</p>
                        <p className="text-xs text-slate-400 mt-0.5">Cerrar un ingreso abierto</p>
                      </div>
                      <ChevronRight className="size-4 text-slate-300 shrink-0" />
                    </button>
                  )}

                  {canManagePackages && (
                    <button
                      type="button"
                      onClick={() => setView('package')}
                      className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg border border-amber-200 bg-white">
                        <Package className="size-4 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-amber-800">Registrar paquete</p>
                        <p className="text-xs text-amber-500 mt-0.5">Marcar paquete recibido</p>
                      </div>
                      <ChevronRight className="size-4 text-amber-300 shrink-0" />
                    </button>
                  )}

                  {canNotify && (
                    <button
                      type="button"
                      onClick={() => setView('notify')}
                      className="flex w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left transition hover:bg-blue-100"
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg border border-blue-200 bg-white">
                        <Bell className="size-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-blue-800">Enviar notificación</p>
                        <p className="text-xs text-blue-400 mt-0.5">Mensaje a los residentes</p>
                      </div>
                      <ChevronRight className="size-4 text-blue-300 shrink-0" />
                    </button>
                  )}

                  {canRenderCallAction && (
                    <button
                      type="button"
                      onClick={() => void handleStartCall()}
                      disabled={Boolean(call) || residentsQuery.isLoading || !occupied}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                        call || residentsQuery.isLoading || !occupied
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-70'
                          : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100',
                      )}
                    >
                      <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-200 bg-white">
                        <PhoneCall className="size-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-emerald-900">Llamar</p>
                        <p className="text-xs text-emerald-600 mt-0.5">
                          {residentsQuery.isLoading ? 'Verificando residentes...' : 'Audio en tiempo real con el movil'}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-emerald-300 shrink-0" />
                    </button>
                  )}

                  {!hasAvailableActions && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      Tu rol solo puede llamar a apartamentos con residentes activos.
                    </div>
                  )}

                </div>
              </div>

              {/* Residents */}
              {residentsQuery.isLoading ? (
                <p className="text-sm text-slate-400">Cargando residentes...</p>
              ) : residents.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Residentes
                  </p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {residents.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className={cn('size-2 rounded-full shrink-0', color.dot)} />
                        <span className="text-sm text-slate-800 font-medium">
                          {formatName(r.name, r.lastName)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-4 text-center">
                  <p className="text-xs text-slate-400">Sin residentes asignados</p>
                </div>
              )}

              {/* Frequent visitors */}
              {frequentVisitors.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Visitantes frecuentes
                  </p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {frequentVisitors.map((entry, idx) => {
                      const entryLabels: Record<string, string> = {
                        pedestrian: 'A pie', car: 'Carro', motorcycle: 'Moto', taxi: 'Taxi', other: 'Otro',
                      }
                      const entryLabel = entryLabels[entry.entryType ?? 'pedestrian'] ?? 'A pie'
                      const isVehicle = entry.entryType === 'car' || entry.entryType === 'motorcycle' || entry.entryType === 'taxi'
                      return (
                        <div key={`${entry.visitorId}-${entry.vehiclePlate ?? 'none'}-${idx}`} className="flex items-center gap-2 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {formatName(entry.visitor.name, entry.visitor.lastName)}
                            </p>
                            <p className="text-xs text-slate-400">
                              {entryLabel}
                              {isVehicle && entry.vehiclePlate ? ` · ${normalizePlate(entry.vehiclePlate)}` : ''}
                              {' · '}
                              {entry.visits}x
                            </p>
                          </div>
                          {canManageAccess && (
                            <button
                              type="button"
                              title="Ingreso rápido"
                              onClick={() => handleQuickEntry(entry)}
                              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition"
                            >
                              <Zap className="size-3.5" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Vehicles */}
              {vehicles.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Vehículos
                  </p>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                    {vehicles.map((v) => {
                      const vehicleEmoji = v.vehicleType === 'motorcycle' ? '🏍' : v.vehicleType === 'bicycle' ? '🚲' : '🚗'
                      const entryType = v.vehicleType === 'motorcycle' ? 'motorcycle' : 'car'
                      const residentVisitor = residents[0]
                      return (
                        <div key={v.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-sm text-slate-400">{vehicleEmoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm font-bold text-slate-800">{v.plate}</p>
                            <p className="text-xs text-slate-400">
                              {v.vehicleBrand?.name ?? '—'}{v.color ? ` · ${v.color}` : ''}
                            </p>
                          </div>
                          {canManageAccess && residentVisitor && (
                            <button
                              type="button"
                              title="Ingreso rápido"
                              onClick={() => {
                                setView('access')
                                setAccessEntryType(entryType as typeof accessEntryType)
                                setAccessVisitorCategory('visita')
                                setAccessVehiclePlate(v.plate)
                                setAccessVehicleBrandId(v.vehicleBrandId ?? '')
                                setAccessVehicleColor(v.color ?? '')
                                setAccessVehicleModel(v.model ?? '')
                                setAccessPhoto(null)
                                setAccessHistoryPhotoPath(null)
                                setAccessNotes('')
                                setAccessPhase({ kind: 'idle' })
                                setAccessSearchDoc('')
                              }}
                              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition"
                            >
                              <Zap className="size-3.5" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pending indicators */}
              {(pendingPkgs > 0 || unreadNotifs > 0) && (
                <div className="flex gap-2">
                  {pendingPkgs > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                      <Package className="size-3.5 text-amber-500" />
                      {pendingPkgs} sin entregar
                    </div>
                  )}
                  {unreadNotifs > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
                      <Bell className="size-3.5 text-blue-500" />
                      {unreadNotifs} sin leer
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Package view ── */}
          {view === 'package' && (
            <form
              className="space-y-4"
              onSubmit={pkgForm.handleSubmit(() => {
                if (packageSubmitting) return
                setPackageSubmitting(true)
                pkgMutation.mutate()
              })}
            >
              {residents.length > 0 && (
                <Field label="Residente (opcional)">
                  <FilterableSelect
                    open={packageResidentOpen}
                    onOpenChange={setPackageResidentOpen}
                    value={selectedResidentId ?? ''}
                    displayValue={selectedResident ? formatName(selectedResident.name, selectedResident.lastName) : ''}
                    placeholder="Sin residente específico"
                    searchPlaceholder="Filtrar residente..."
                    items={packageResidentOptions}
                    getKey={(r) => r.id}
                    getLabel={(r) => r.id ? formatName(r.name, r.lastName) : 'Sin residente específico'}
                    onSelect={(r) => {
                      pkgForm.setValue('residentId', r.id || '')
                      setPackageResidentOpen(false)
                    }}
                    searchValue={packageResidentSearch}
                    onSearchValueChange={setPackageResidentSearch}
                  />
                </Field>
              )}
              <Field label="Descripción (opcional)" error={pkgForm.formState.errors.description?.message}>
                <Textarea
                  {...pkgForm.register('description')}
                  placeholder="Caja mediana, sobre, pedido de farmacia..."
                  rows={2}
                />
              </Field>
              <Field label="Fotos (opcional)">
                <ImageCaptureControl
                  multiple
                  buttonLabel="Seleccionar fotos"
                  onFiles={handlePackagePhotoSelection}
                />
                <p className="mt-2 text-xs text-slate-400">Puedes adjuntar hasta 10 imágenes antes de guardar.</p>
                {packagePhotos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {packagePhotos.map((photo, index) => (
                      <div key={`${photo.name}-${photo.lastModified}-${photo.size}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-700">{photo.name}</p>
                          <p className="text-xs text-slate-400">{Math.round(photo.size / 1024)} KB</p>
                        </div>
                        <button
                          type="button"
                          className="text-slate-400 transition hover:text-slate-700"
                          onClick={() => removePackagePhoto(index)}
                          aria-label={`Eliminar ${photo.name}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Field>
              <Button type="submit" className="w-full" disabled={packageSubmitting || pkgMutation.isPending}>
                Guardar paquete
              </Button>
            </form>
          )}

          {/* ── Access view ── */}
          {view === 'access' && (
            <div className="space-y-4">
              {/* Step 1: search visitor */}
              {accessPhase.kind !== 'ready' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Paso 1 · Buscar visitante
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Número de cédula o documento"
                      value={accessSearchDoc}
                      onChange={(e) => {
                        setAccessSearchDoc(e.target.value)
                        if (accessPhase.kind !== 'idle') setAccessPhase({ kind: 'idle' })
                        setAccessPhoto(null)
                        setAccessHistoryPhotoPath(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAccessSearch()}
                      disabled={searchVisitorMutation.isPending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAccessSearch}
                      disabled={!accessSearchDoc.trim() || searchVisitorMutation.isPending}
                    >
                      <Search className="size-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Placa rápida"
                      value={accessPlateSearch}
                      onChange={(e) => {
                        setAccessPlateSearch(e.target.value.toUpperCase())
                        if (accessPhase.kind !== 'idle') setAccessPhase({ kind: 'idle' })
                        setAccessPhoto(null)
                        setAccessHistoryPhotoPath(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAccessPlateSearch()}
                      disabled={plateSearchMutation.isPending || accessMutation.isPending}
                      maxLength={15}
                      className="font-mono uppercase"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleAccessPlateSearch}
                      disabled={!accessPlateSearch.trim() || plateSearchMutation.isPending || accessMutation.isPending}
                    >
                      <Search className="size-4" />
                    </Button>
                  </div>

                  {/* Not found → create */}
                  {accessPhase.kind === 'not_found' && (
                    <div className="space-y-3">
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Visitante no encontrado. Completa los datos para crearlo.
                      </p>
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void createVisitorForm.handleSubmit((values) => {
                            if (createVisitorSubmitting) return
                            setCreateVisitorSubmitting(true)
                            createVisitorMutation.mutate(values)
                          })()
                        }}
                      >
                        <Field label="Nombre" error={createVisitorForm.formState.errors.name?.message}>
                          <Input {...createVisitorForm.register('name')} placeholder="Juan" />
                        </Field>
                        <Field label="Apellido" error={createVisitorForm.formState.errors.lastName?.message}>
                          <Input {...createVisitorForm.register('lastName')} placeholder="Pérez" />
                        </Field>
                        <Field label="Cédula">
                          <Input {...createVisitorForm.register('document')} placeholder="12345678" />
                        </Field>
                        <Field label="Teléfono (opcional)">
                          <Input {...createVisitorForm.register('phone')} placeholder="3001234567" />
                        </Field>
                        <Button
                          type="submit"
                          className="sm:col-span-2"
                          disabled={createVisitorSubmitting || createVisitorMutation.isPending}
                        >
                          Crear y continuar
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: confirm and register */}
	              {(accessPhase.kind === 'ready' || accessPhase.kind === 'not_found') && (
	                <div className="space-y-3">
	                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
	                    Paso 2 · Confirmar ingreso
	                  </p>
	                  {accessPhase.kind === 'ready' ? (
	                    <div className="flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
	                      <div>
	                        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Visitante</p>
	                        <p className="mt-1 font-semibold text-slate-900">
	                          {formatName(accessPhase.visitor.name, accessPhase.visitor.lastName)}
	                        </p>
	                        {accessPhase.visitor.document && (
	                          <p className="text-sm text-slate-500">CC {accessPhase.visitor.document}</p>
	                        )}
	                      </div>
	                      <button
	                        type="button"
	                        onClick={() => {
	                          setAccessPhase({ kind: 'idle' })
	                          setAccessSearchDoc('')
	                          setAccessPlateSearch('')
	                        }}
	                        className="text-slate-400 hover:text-slate-600"
	                      >
	                        <X className="size-4" />
	                      </button>
	                    </div>
	                  ) : (
	                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
	                      Crea el visitante en el paso 1 para habilitar el registro del ingreso.
	                    </div>
	                  )}

                  <fieldset disabled={accessPhase.kind !== 'ready'} className="space-y-3 disabled:opacity-60">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Categoría">
                      <Select
                        value={accessVisitorCategory}
                        onValueChange={(value) =>
                          setAccessVisitorCategory(value as (typeof ACCESS_VISITOR_CATEGORY_OPTIONS)[number]['value'])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCESS_VISITOR_CATEGORY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Tipo de entrada">
                      <Select
                        value={accessEntryType}
                        onValueChange={(value) =>
                          handleAccessEntryTypeChange(value as (typeof ACCESS_ENTRY_OPTIONS)[number]['value'])
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCESS_ENTRY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  {accessShowVehicleSection && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {accessIsCarOrMoto && (
                        <Field label="Marca">
                          <FilterableSelect
                            open={accessBrandOpen}
                            onOpenChange={setAccessBrandOpen}
                            value={accessVehicleBrandId}
                            displayValue={
                              (vehicleBrandsQuery.data ?? []).find((brand) => brand.id === accessVehicleBrandId)?.name ?? ''
                            }
                            placeholder="Selecciona marca"
                            searchPlaceholder="Filtrar marca..."
                            items={vehicleBrandsQuery.data ?? []}
                            getKey={(brand) => brand.id}
                            getLabel={(brand) => brand.name}
                            onSelect={(brand) => {
                              setAccessVehicleBrandId(brand.id)
                              setAccessBrandOpen(false)
                            }}
                            searchValue={accessBrandSearch}
                            onSearchValueChange={setAccessBrandSearch}
                          />
                        </Field>
                      )}

                      <Field label="Placa">
                        <Input
                          value={accessVehiclePlate}
                          onChange={(e) => setAccessVehiclePlate(e.target.value.toUpperCase())}
                          placeholder="ABC123"
                          maxLength={15}
                          className="uppercase"
                        />
                      </Field>

                      <Field label="Color (opcional)">
                        <Input value={accessVehicleColor} onChange={(e) => setAccessVehicleColor(e.target.value)} placeholder="Blanco" />
                      </Field>

                      <Field label="Modelo (opcional)">
                        <Input value={accessVehicleModel} onChange={(e) => setAccessVehicleModel(e.target.value)} placeholder="2024" />
                      </Field>
                    </div>
                  )}

                  <Field label="Foto del visitante (opcional)">
                    <ImageCaptureControl
                      buttonLabel={accessPhoto ? 'Cambiar foto' : accessHistoryPhotoPath ? 'Actualizar foto' : 'Seleccionar foto'}
                      onFiles={(files) => setAccessPhoto(files[0] ?? null)}
                    />
                    {!accessPhoto && accessHistoryPhotoPath && (
                      <p className="mt-2 text-xs text-emerald-600">
                        Se cargó la última foto registrada para este visitante.
                      </p>
                    )}
                    {effectiveAccessPhotoPreview && (
                      <div className="mt-3 relative w-fit">
                        <ImagePreviewDialog
                          src={effectiveAccessPhotoPreview}
                          alt="Visitante"
                          title="Foto del visitante"
                          className="size-24 rounded-lg border border-slate-200 bg-white"
                        />
                        {accessPhoto && (
                          <button
                            type="button"
                            className="absolute -right-2 -top-2 rounded-full border border-slate-300 bg-white p-1 text-slate-500 transition hover:text-slate-700"
                            onClick={() => setAccessPhoto(null)}
                            aria-label="Quitar foto"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </Field>

                    <Field label="Notas (opcional)">
                      <Textarea
                        value={accessNotes}
                        onChange={(e) => setAccessNotes(e.target.value)}
                        placeholder="Motivo de la visita, observaciones..."
                        rows={2}
                      />
                    </Field>
                    <Button
                      className="w-full"
                      disabled={accessSubmitting || accessMutation.isPending}
                      onClick={() => {
                        if (!activeAccessVisitor) return
                        handleRegisterAccess(activeAccessVisitor.id)
                      }}
                    >
                      Registrar ingreso
                    </Button>
                  </fieldset>
	                </div>
	              )}
            </div>
          )}

          {/* ── Exit view ── */}
          {view === 'exit' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Buscar visitante
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Número de cédula o documento"
                  value={exitSearchDoc}
                  onChange={(e) => {
                    setExitSearchDoc(e.target.value)
                    if (exitPhase.kind !== 'idle') setExitPhase({ kind: 'idle' })
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleExitSearch()}
                  disabled={searchOpenAccessMutation.isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExitSearch}
                  disabled={!exitSearchDoc.trim() || searchOpenAccessMutation.isPending}
                >
                  <Search className="size-4" />
                </Button>
              </div>

              {exitPhase.kind === 'not_found' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  No existe un visitante con ese documento.
                </div>
              )}

              {exitPhase.kind === 'no_open_access' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-600">
                  <strong>{formatName(exitPhase.visitor.name, exitPhase.visitor.lastName)}</strong> no tiene un ingreso abierto para registrar salida.
                </div>
              )}

              {exitPhase.kind === 'ready' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600">Ingreso abierto</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {formatName(exitPhase.visitor.name, exitPhase.visitor.lastName)}
                    </p>
                    {exitPhase.visitor.document && (
                      <p className="text-sm text-slate-500">CC {formatDocument(exitPhase.visitor.document)}</p>
                    )}
                    {exitPhase.openAccess.apartment && (
                      <p className="text-sm text-slate-500">
                        {exitPhase.openAccess.apartment.tower ? `Torre ${exitPhase.openAccess.apartment.tower} · ` : ''}
                        Apt. {exitPhase.openAccess.apartment.number}
                      </p>
                    )}
                    <p className="text-sm text-slate-500">Entrada: {formatDate(exitPhase.openAccess.entryTime)}</p>
                    <p className="text-sm text-slate-500">
                      {ACCESS_VISITOR_CATEGORY_OPTIONS.find((o) => o.value === exitPhase.openAccess.visitorCategory)?.label ?? 'Visita'}
                      {' · '}
                      {ACCESS_ENTRY_OPTIONS.find((o) => o.value === exitPhase.openAccess.entryType)?.label ?? 'A pie'}
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleConfirmExit}
                    disabled={exitSubmitting || registerExitMutation.isPending}
                  >
                    <LogOut className="mr-2 size-4" />
                    Confirmar salida
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ── Notify view ── */}
          {view === 'notify' && (
            <form
              className="space-y-4"
              onSubmit={notifyForm.handleSubmit(() => {
                if (notifySubmitting) return
                setNotifySubmitting(true)
                notifyMutation.mutate()
              })}
            >
              <Field
                label="Tipo de notificación"
                error={notifyForm.formState.errors.notificationTypeId?.message}
              >
                <Select
                  value={selectedTypeId}
                  onValueChange={(v: string) =>
                    notifyForm.setValue('notificationTypeId', v, { shouldValidate: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        notifTypesQuery.isLoading ? 'Cargando...' : 'Selecciona tipo'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {notifTypes.map((t: { id: string; name: string }) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Mensaje" error={notifyForm.formState.errors.message?.message}>
                <Textarea
                  {...notifyForm.register('message')}
                  placeholder="Escribe el mensaje para los residentes."
                  rows={3}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={notifySubmitting || notifyMutation.isPending}>
                Enviar notificación
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'building_map_selected_tower'

export function BuildingMapPage() {
  const { user } = useAuth()
  const canManageAccess = user?.role === 'administrator' || user?.role === 'porter'
  const canManagePackages = user?.role === 'administrator' || user?.role === 'porter'
  const canNotify = user?.role === 'administrator'
  const canCall =
    user?.role === 'porter' ||
    user?.role === 'pool_attendant'

  const [selectedApt, setSelectedApt] = useState<{
    apt: Apartment
    tower: Tower
    towerIdx: number
  } | null>(null)

  // Persist selected tower in localStorage
  const [selectedTowerId, setSelectedTowerId] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? '',
  )
  const [quickSearch, setQuickSearch] = useState('')
  const [plateSearch, setPlateSearch] = useState('')
  const [plateSearchResult, setPlateSearchResult] = useState<PlateLocationResult | undefined>()
  const [plateSearchLoading, setPlateSearchLoading] = useState(false)

  function selectTower(id: string) {
    setSelectedTowerId(id)
    localStorage.setItem(STORAGE_KEY, id)
    setSelectedApt(null)
  }

  const towersQuery = useQuery({
    queryKey: ['towers'],
    queryFn: api.getTowers,
    staleTime: STALE_5MIN,
  })
  const apartmentsQuery = useQuery({
    queryKey: ['apartments'],
    queryFn: () => api.getApartments({ limit: 1000 }),
    staleTime: STALE_5MIN,
  })
  const packagesQuery = useQuery({
    queryKey: ['packages'],
    queryFn: () => api.getPackages({ limit: 1000 }),
    enabled: canManagePackages,
    staleTime: STALE_1MIN,
  })
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.getAllNotifications({ limit: 1000 }),
    enabled: canNotify,
    staleTime: STALE_1MIN,
  })

  const towers = towersQuery.data ?? []
  const allApts = apartmentsQuery.data?.data ?? []
  const packages = canManagePackages ? packagesQuery.data?.data ?? [] : []
  const notifs = canNotify ? notificationsQuery.data?.data ?? [] : []

  const activeTowerId = towers.some((tower) => tower.id === selectedTowerId)
    ? selectedTowerId
    : (towers[0]?.id ?? '')
  const activeTower = towers.find((tower) => tower.id === activeTowerId)
  const activeTowerIdx = activeTower ? Math.max(towers.findIndex((tower) => tower.id === activeTower.id), 0) : 0
  const activeColor = activeTower ? palette(activeTowerIdx) : PALETTE[0]

  // Index: apartmentId → pending packages count
  const pkgByApt = useMemo(() => {
    const map = new Map<string, number>()
    for (const pkg of packages) {
      if (!pkg.delivered && pkg.apartmentId) {
        map.set(pkg.apartmentId, (map.get(pkg.apartmentId) ?? 0) + 1)
      }
    }
    return map
  }, [packages])

  // Index: apartmentId → unread notification count
  const notifByApt = useMemo(() => {
    const map = new Map<string, number>()
    for (const n of notifs) {
      if (!n.isRead && n.apartmentId) {
        map.set(n.apartmentId, (map.get(n.apartmentId) ?? 0) + 1)
      }
    }
    return map
  }, [notifs])

  const floorMap = new Map<number, Apartment[]>()
  if (activeTower) {
    for (const apt of allApts) {
      if (apt.towerId !== activeTower.id) continue
      const floor = apt.floor ?? 1
      const floorApartments = floorMap.get(floor)
      if (floorApartments) {
        floorApartments.push(apt)
      } else {
        floorMap.set(floor, [apt])
      }
    }
    for (const floorApartments of floorMap.values()) {
      floorApartments.sort((a, b) => a.number.localeCompare(b.number))
    }
  }

  const maxFloor = floorMap.size > 0 ? Math.max(...floorMap.keys()) : 0
  const floors = Array.from({ length: maxFloor }, (_, i) => i + 1)
  const towerStats = towers.map((tower, index) => {
    const towerApartments = allApts.filter((apartment) => apartment.towerId === tower.id)
    const occupied = towerApartments.filter((apartment) => (apartment.residentCount ?? 0) > 0).length
    return { tower, occupied, total: towerApartments.length, color: palette(index) }
  })

  const quickResults = buildQuickApartmentResults(allApts, towers, quickSearch)

  function selectApartmentFromSearch(result: QuickAptResult) {
    setSelectedTowerId(result.tower.id)
    localStorage.setItem(STORAGE_KEY, result.tower.id)
    setSelectedApt({ apt: result.apt, tower: result.tower, towerIdx: result.towerIdx })
    setQuickSearch('')
  }

  function selectApartmentById(apartmentId: string) {
    const apt = allApts.find((item) => item.id === apartmentId)
    if (!apt) return
    const towerIdx = towers.findIndex((tower) => tower.id === apt.towerId)
    const tower = towers[towerIdx]
    if (!tower) return
    setSelectedTowerId(tower.id)
    localStorage.setItem(STORAGE_KEY, tower.id)
    setSelectedApt({ apt, tower, towerIdx: Math.max(towerIdx, 0) })
  }

  function handlePlateSearchChange(value: string) {
    setPlateSearch(value.toUpperCase())
    setPlateSearchResult(undefined)
  }

  async function handlePlateSearch() {
    const plate = normalizePlate(plateSearch)
    if (!plate || plateSearchLoading) return
    setPlateSearch(plate)
    setPlateSearchLoading(true)
    try {
      setPlateSearchResult(await api.locatePlate(plate))
    } catch {
      toast.error('No fue posible consultar la placa')
    }
    setPlateSearchLoading(false)
  }

  function clearPlateSearch() {
    setPlateSearch('')
    setPlateSearchResult(undefined)
  }

  const isLoading =
    towersQuery.isLoading ||
    apartmentsQuery.isLoading ||
    (canManagePackages && packagesQuery.isLoading) ||
    (canNotify && notificationsQuery.isLoading)

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <SectionHeader
        eyebrow="Operacion"
        title="Plano del conjunto"
        description="Selecciona una torre y haz clic en cualquier unidad para ver detalles y registrar acciones."
      />

      {/* Tower selector tabs */}
      {!isLoading && towers.length > 0 && (
        <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-1 sm:px-6">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {towerStats.map(({ tower, occupied, total, color }) => {
                const isActive = tower.id === activeTowerId
                return (
                  <button
                    key={tower.id}
                    type="button"
                    onClick={() => selectTower(tower.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold whitespace-nowrap transition',
                      isActive
                        ? `${color.header} text-white border-transparent shadow-sm`
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {!isActive && (
                      <span className={cn('size-2 shrink-0 rounded-full', color.legend)} />
                    )}
                    {tower.name}
                    <span
                      className={cn(
                        'text-xs font-normal',
                        isActive ? 'text-white/70' : 'text-slate-400',
                      )}
                    >
                      {occupied}/{total}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex w-full shrink-0 flex-col gap-3 xl:w-auto xl:flex-row xl:items-center">
              <QuickApartmentSearch
                value={quickSearch}
                onChange={setQuickSearch}
                results={quickResults}
                onSelect={selectApartmentFromSearch}
              />
              <PlateLocationSearch
                value={plateSearch}
                result={plateSearchResult}
                isLoading={plateSearchLoading}
                onChange={handlePlateSearchChange}
                onSearch={handlePlateSearch}
                onClear={clearPlateSearch}
                onSelectApartment={selectApartmentById}
              />

              {(canManagePackages || canNotify) && (
                <div className="flex items-center gap-3 shrink-0 pl-1">
                  {canManagePackages && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="flex size-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-white">
                        1
                      </span>
                      Paquete
                    </div>
                  )}
                  {canNotify && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="flex size-4 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
                        1
                      </span>
                      Notif.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Grid area */}
      <div className="min-w-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center space-y-2">
              <div className="mx-auto size-8 rounded-full border-2 border-slate-200 border-t-slate-600 animate-spin" />
              <p className="text-sm text-slate-400">Cargando plano…</p>
            </div>
          </div>
        ) : towers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Sin torres registradas.
          </div>
        ) : !activeTower ? null : (
          <div className="h-full w-full min-w-0">
            <div
              className="grid h-full gap-2"
              style={{
                gridTemplateRows: `repeat(${Math.max(floors.length, 1)}, minmax(0, 1fr))`,
              }}
            >
              {floors.map((floor) => {
                const floorApts = floorMap.get(floor) ?? []
                return (
                  <div key={floor} className="flex min-h-0 min-w-0 items-stretch gap-4">
                    {/* Floor label */}
                    <div className="flex w-10 shrink-0 items-center justify-end text-right">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        P{floor}
                      </span>
                    </div>

                    {/* Apartments */}
                    <div
                      className="grid min-w-0 flex-1 gap-3"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(activeTower.apartmentsPerFloor, 1)}, minmax(0, 1fr))`,
                      }}
                    >
                      {floorApts.length > 0 ? (
                        floorApts.map((apt) => (
                          <AptCell
                            key={apt.id}
                            apt={apt}
                            color={activeColor}
                            isSelected={selectedApt?.apt.id === apt.id}
                            pendingPkgs={pkgByApt.get(apt.id) ?? 0}
                            unreadNotifs={notifByApt.get(apt.id) ?? 0}
                            onClick={() =>
                              setSelectedApt(
                                selectedApt?.apt.id === apt.id
                                  ? null
                                  : { apt, tower: activeTower, towerIdx: activeTowerIdx },
                              )
                            }
                          />
                        ))
                      ) : (
                        <div className="h-full min-h-0 w-full rounded-lg border border-dashed border-slate-100 bg-slate-50/50" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Apartment detail dialog */}
      {selectedApt && (
        <AptDetailDialog
          open={!!selectedApt}
          onClose={() => setSelectedApt(null)}
          apartment={selectedApt.apt}
          tower={selectedApt.tower}
          towerIdx={selectedApt.towerIdx}
          pendingPkgs={pkgByApt.get(selectedApt.apt.id) ?? 0}
          unreadNotifs={notifByApt.get(selectedApt.apt.id) ?? 0}
          canManageAccess={canManageAccess}
          canManagePackages={canManagePackages}
          canNotify={canNotify}
          canCall={canCall}
        />
      )}
    </div>
  )
}
