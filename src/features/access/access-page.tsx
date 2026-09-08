import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, CalendarX2, Clock3, DoorOpen, LogOut, Search, UserRoundPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScanInput, extractDocumentFromBarcode } from '@/hooks/use-webhid-scanner'
import { parseColombianCedula } from '@/lib/colombian-cedula'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { FilterableSelect } from '@/components/ui/filterable-select'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type ColumnDef, type FilterDef } from '@/components/ui/data-table'
import { StatusBadge, type StatusVariant } from '@/components/ui/status-badge'
import { ImageCaptureControl } from '@/components/ui/image-capture-control'
import { ImagePreviewDialog } from '@/components/ui/image-preview-dialog'
import { useAuth } from '@/hooks/use-auth-context'
import { UPLOADS_URL } from '@/lib/constants'
import { api } from '@/lib/api'
import { formatDate, formatDocument, formatName, normalizePlate } from '@/lib/utils'
import { toast } from 'sonner'
import type { AccessAudit, Visitor, VisitorSearchResult } from '@/types/api'

const ENTRY_TYPE_OPTIONS = [
  { value: 'pedestrian', label: 'A pie' },
  { value: 'car', label: 'Carro' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'other', label: 'Otros' },
] as const

const ENTRY_TYPE_LABELS: Record<string, string> = {
  pedestrian: 'A pie',
  car: 'Carro',
  motorcycle: 'Moto',
  taxi: 'Taxi',
  other: 'Otros',
}

const VISITOR_CATEGORY_OPTIONS = [
  { value: 'visita', label: 'Visita' },
  { value: 'domiciliario', label: 'Domiciliario' },
] as const

const VISITOR_CATEGORY_LABELS: Record<string, string> = {
  visita: 'Visita',
  domiciliario: 'Domiciliario',
}

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

function getEntryTypeVariant(entryType: AccessAudit['entryType']): StatusVariant {
  if (entryType === 'car') return 'blue'
  if (entryType === 'motorcycle') return 'amber'
  if (entryType === 'taxi') return 'violet'
  if (entryType === 'other') return 'slate'
  return 'green'
}

function getVisitorCategoryVariant(category?: string | null): StatusVariant {
  return category === 'domiciliario' ? 'amber' : 'blue'
}

function vehicleTypeToEntryType(vehicleType?: string | null): AccessAudit['entryType'] {
  if (vehicleType === 'motorcycle') return 'motorcycle'
  return 'car'
}

const createVisitorSchema = z.object({
  name: z.string().min(2),
  lastName: z.string().min(2),
  document: z.string().max(50).optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
})

const entrySchema = z
  .object({
    towerId: z.string().uuid({ message: 'Selecciona una torre' }),
    apartmentId: z.string().uuid({ message: 'Selecciona un apartamento' }),
    entryType: z.enum(['pedestrian', 'car', 'motorcycle', 'taxi', 'other']),
    visitorCategory: z.enum(['visita', 'domiciliario']),
    vehicleBrandId: z.string().optional().or(z.literal('')),
    vehicleColor: z.string().max(40).optional().or(z.literal('')),
    vehiclePlate: z.string().max(15).optional().or(z.literal('')),
    vehicleModel: z.string().max(60).optional().or(z.literal('')),
    notes: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((values, context) => {
    const isCarOrMoto = values.entryType === 'car' || values.entryType === 'motorcycle'
    const isTaxi = values.entryType === 'taxi'
    const hasVehicle = isCarOrMoto || isTaxi

    // Marca: requerida solo para carro y moto
    if (isCarOrMoto && !values.vehicleBrandId) {
      context.addIssue({ code: 'custom', path: ['vehicleBrandId'], message: 'Selecciona una marca' })
    }

    // Placa: requerida para carro, moto y taxi
    if (hasVehicle && !values.vehiclePlate?.trim()) {
      context.addIssue({ code: 'custom', path: ['vehiclePlate'], message: 'Ingresa la placa' })
    }
  })

type SearchPhase =
  | { kind: 'idle' }
  | { kind: 'not_found'; document: string }
  | { kind: 'ready'; visitor: Visitor }

function VisitorCard({ visitor, onClear }: { visitor: Visitor; onClear: () => void }) {
  return (
    <div className="flex items-start justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">Visitante encontrado</p>
        <p className="mt-1 font-semibold text-slate-900">
          {formatName(visitor.name, visitor.lastName)}
        </p>
        {visitor.document && <p className="text-sm text-slate-500">CC {formatDocument(visitor.document)}</p>}
        {visitor.phone && <p className="text-sm text-slate-400">{visitor.phone}</p>}
      </div>
      <button type="button" onClick={onClear} className="mt-0.5 text-slate-400 hover:text-slate-600">
        <X className="size-4" />
      </button>
    </div>
  )
}

function ManageVehicleBrandsDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const brandSchema = z.object({ name: z.string().min(2, 'Mínimo 2 caracteres').max(60) })

  const brandForm = useForm<z.infer<typeof brandSchema>>({
    resolver: zodResolver(brandSchema),
    defaultValues: { name: '' },
  })

  const brandsQuery = useQuery({
    queryKey: ['vehicle-brands'],
    queryFn: api.getVehicleBrands,
    enabled: open,
  })

  const createMutation = useMutation({
    mutationFn: api.createVehicleBrand,
    onSuccess: () => {
      toast.success('Marca creada')
      brandForm.reset()
      void queryClient.invalidateQueries({ queryKey: ['vehicle-brands'] })
    },
    onError: () => toast.error('No fue posible crear la marca'),
    onSettled: () => setSubmitting(false),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Marcas de vehículo</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,520px)]">
        <DialogHeader>
          <DialogTitle>Marcas de vehículo</DialogTitle>
          <DialogDescription>
            Crea nuevas marcas disponibles para el registro de ingreso vehicular.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex items-end gap-2"
          onSubmit={brandForm.handleSubmit((values) => {
            if (submitting) return
            setSubmitting(true)
            createMutation.mutate(values)
          })}
        >
          <div className="flex-1">
            <Field label="Nueva marca" error={brandForm.formState.errors.name?.message}>
              <Input {...brandForm.register('name')} placeholder="Ej. Mazda" />
            </Field>
          </div>
          <Button type="submit" disabled={submitting || createMutation.isPending}>Agregar</Button>
        </form>

        <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white">
          {brandsQuery.isLoading ? (
            <p className="px-3 py-4 text-sm text-slate-400">Cargando marcas...</p>
          ) : (brandsQuery.data ?? []).length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400">Sin marcas registradas.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {(brandsQuery.data ?? []).map((brand) => (
                <div key={brand.id} className="px-3 py-2 text-sm text-slate-700">
                  {brand.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function RegisterEntryDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [searchDoc, setSearchDoc] = useState('')
  const [phase, setPhase] = useState<SearchPhase>({ kind: 'idle' })
  const [aptOpen, setAptOpen] = useState(false)
  const [aptSearch, setAptSearch] = useState('')
  const [brandOpen, setBrandOpen] = useState(false)
  const [brandSearch, setBrandSearch] = useState('')
  const [plateSearch, setPlateSearch] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [historyPhotoPath, setHistoryPhotoPath] = useState<string | null>(null)
  const [createVisitorSubmitting, setCreateVisitorSubmitting] = useState(false)
  const [entrySubmitting, setEntrySubmitting] = useState(false)
  const lastScannedTextRef = useRef('')

  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const historyPhotoPreview = useMemo(() => resolveUploadPath(historyPhotoPath), [historyPhotoPath])
  const effectivePhotoPreview = photoPreview ?? historyPhotoPreview
  useEffect(
    () => () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    },
    [photoPreview],
  )

  const brandsQuery = useQuery({ queryKey: ['vehicle-brands'], queryFn: api.getVehicleBrands })
  const apartmentsQuery = useQuery({
    queryKey: ['apartments', 'access-entry-all'],
    queryFn: () => api.getApartments({ limit: 1000 }),
  })

  const createVisitorForm = useForm<z.infer<typeof createVisitorSchema>>({
    resolver: zodResolver(createVisitorSchema),
    defaultValues: { name: '', lastName: '', document: '', phone: '' },
  })

  const entryForm = useForm<z.infer<typeof entrySchema>>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      towerId: '',
      apartmentId: '',
      entryType: 'pedestrian',
      visitorCategory: 'visita',
      vehicleBrandId: '',
      vehicleColor: '',
      vehiclePlate: '',
      vehicleModel: '',
      notes: '',
    },
  })

  const selectedEntryType = useWatch({ control: entryForm.control, name: 'entryType' })
  const selectedVisitorCategory = useWatch({ control: entryForm.control, name: 'visitorCategory' })
  const selectedVehicleBrandId = useWatch({ control: entryForm.control, name: 'vehicleBrandId' }) ?? ''
  const selectedApartmentId = useWatch({ control: entryForm.control, name: 'apartmentId' }) ?? ''
  const isCarOrMoto = selectedEntryType === 'car' || selectedEntryType === 'motorcycle'
  const isTaxi = selectedEntryType === 'taxi'
  const showVehicleSection = isCarOrMoto || isTaxi

  function handleEntryTypeChange(value: z.infer<typeof entrySchema>['entryType']) {
    entryForm.setValue('entryType', value, { shouldValidate: true })
    const isVehicleType = value === 'car' || value === 'motorcycle' || value === 'taxi'
    if (!isVehicleType) {
      entryForm.setValue('vehicleBrandId', '')
      entryForm.setValue('vehicleColor', '')
      entryForm.setValue('vehiclePlate', '')
      entryForm.setValue('vehicleModel', '')
      setBrandOpen(false)
      setBrandSearch('')
    }
    // When switching to taxi, clear brand (not required for taxi)
    if (value === 'taxi') {
      entryForm.setValue('vehicleBrandId', '')
      setBrandOpen(false)
      setBrandSearch('')
    }
  }

  function applyVisitorLastAccessDefaults(searchResult: VisitorSearchResult | null) {
    const entryType = searchResult?.lastAccess?.entryType ?? 'pedestrian'
    const hasVehicleData = entryType === 'car' || entryType === 'motorcycle' || entryType === 'taxi'
    const lastIsCarOrMoto = entryType === 'car' || entryType === 'motorcycle'

    entryForm.reset({
      towerId: '',
      apartmentId: '',
      entryType,
      visitorCategory: searchResult?.lastAccess?.visitorCategory ?? 'visita',
      vehicleBrandId: lastIsCarOrMoto ? searchResult?.lastAccess?.vehicleBrandId ?? '' : '',
      vehicleColor: hasVehicleData ? searchResult?.lastAccess?.vehicleColor ?? '' : '',
      vehiclePlate: hasVehicleData ? searchResult?.lastAccess?.vehiclePlate ?? '' : '',
      vehicleModel: hasVehicleData ? searchResult?.lastAccess?.vehicleModel ?? '' : '',
      notes: '',
    })

    setAptOpen(false)
    setBrandOpen(false)
    setBrandSearch('')

    setPhotoFile(null)
    setHistoryPhotoPath(
      searchResult?.visitor?.photoPath?.trim() ||
      searchResult?.lastAccess?.visitorPhotoPath?.trim() ||
      null
    )
  }

  function applyAccessDefaultsFromAudit(lastAccess: AccessAudit) {
    const entryType = lastAccess.entryType ?? 'pedestrian'
    const hasVehicleData = entryType === 'car' || entryType === 'motorcycle' || entryType === 'taxi'
    const lastIsCarOrMoto = entryType === 'car' || entryType === 'motorcycle'
    const towerId = lastAccess.apartment?.towerId ?? ''

    entryForm.reset({
      towerId,
      apartmentId: lastAccess.apartmentId ?? '',
      entryType,
      visitorCategory: lastAccess.visitorCategory ?? 'visita',
      vehicleBrandId: lastIsCarOrMoto ? lastAccess.vehicleBrandId ?? '' : '',
      vehicleColor: hasVehicleData ? lastAccess.vehicleColor ?? '' : '',
      vehiclePlate: hasVehicleData ? lastAccess.vehiclePlate ?? '' : '',
      vehicleModel: hasVehicleData ? lastAccess.vehicleModel ?? '' : '',
      notes: '',
    })

    setAptOpen(false)
    setBrandOpen(false)
    setBrandSearch('')
    setPhotoFile(null)
    setHistoryPhotoPath(lastAccess.visitor?.photoPath?.trim() || lastAccess.visitorPhotoPath?.trim() || null)
  }

  const createVisitorMutation = useMutation({
    mutationFn: api.createVisitor,
    onSuccess: (visitor) => {
      toast.success('Visitante creado')
      createVisitorForm.reset()
      void queryClient.invalidateQueries({ queryKey: ['visitors'] })
      setPhase({ kind: 'ready', visitor })
      applyVisitorLastAccessDefaults(null)
    },
    onError: () => toast.error('No fue posible crear el visitante'),
    onSettled: () => setCreateVisitorSubmitting(false),
  })

  const searchVisitorMutation = useMutation({
    mutationFn: api.searchVisitorByDocument,
    onSuccess: (result) => {
      if (!result.visitor) {
        const searchedDocument = searchDoc.trim()
        setPhase({ kind: 'not_found', document: searchedDocument })
        createVisitorForm.setValue('document', searchedDocument)
        const cedula = parseColombianCedula(lastScannedTextRef.current)
        if (cedula && cedula.documentNumber === searchedDocument) {
          createVisitorForm.setValue('name', `${cedula.firstName1} ${cedula.firstName2}`.trim())
          createVisitorForm.setValue('lastName', `${cedula.lastName1} ${cedula.lastName2}`.trim())
        }
        applyVisitorLastAccessDefaults(null)
        return
      }

      toast.success('Visitante encontrado')
      setPhase({ kind: 'ready', visitor: result.visitor })
      applyVisitorLastAccessDefaults(result)
    },
    onError: () => toast.error('No fue posible consultar el visitante'),
  })

  const accessMutation = useMutation({
    mutationFn: ({ payload, photo }: { payload: Record<string, unknown>; photo?: File | null }) =>
      api.createAccessAudit(payload, photo ?? undefined),
    onSuccess: () => {
      toast.success('Ingreso registrado')
      handleReset()
      void queryClient.invalidateQueries({ queryKey: ['access-audit'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'No fue posible registrar el ingreso')),
    onSettled: () => {
      setEntrySubmitting(false)
    },
  })

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
          toast.error(`La placa ${result.plate} pertenece a un apartamento sin residentes activos`)
          return
        }

        const vehicle = result.vehicle
        accessMutation.mutate({
          payload: {
            residentId: resident.id,
            apartmentId: vehicle.apartmentId,
            entryType: vehicleTypeToEntryType(vehicle.vehicleType),
            vehicleBrandId: vehicle.vehicleBrandId,
            vehicleColor: vehicle.color ?? undefined,
            vehiclePlate: vehicle.plate,
            vehicleModel: vehicle.model ?? undefined,
            notes: 'Entrada rápida por placa',
          },
        })
        setPlateSearch('')
        return
      }

      if (!result.lastAccess.visitor) {
        toast.error('La placa tiene historial, pero no tiene visitante asociado')
        return
      }

      toast.success('Visitante encontrado por placa')
      setPhase({ kind: 'ready', visitor: result.lastAccess.visitor })
      setSearchDoc(result.lastAccess.visitor.document ?? '')
      applyAccessDefaultsFromAudit(result.lastAccess)
      setPlateSearch('')
    },
    onError: () => toast.error('No fue posible consultar la placa'),
  })

  const handleSearch = useCallback(() => {
    const normalizedDocument = searchDoc.trim()
    if (!normalizedDocument) return
    searchVisitorMutation.mutate(normalizedDocument)
  }, [searchDoc, searchVisitorMutation])

  const canScan = open && (phase.kind === 'idle' || phase.kind === 'not_found')
  useScanInput(useCallback((value: string) => {
    const doc = extractDocumentFromBarcode(value)
    if (!doc) {
      toast.error('Código no legible. En la cédula digital escanea el código MRZ (las 3 líneas de letras y números del reverso), no el QR.')
      return
    }
    lastScannedTextRef.current = value
    setSearchDoc(doc)
    searchVisitorMutation.mutate(doc)
  }, [searchVisitorMutation]), canScan)

  const handleReset = () => {
    setSearchDoc('')
    setPlateSearch('')
    setPhase({ kind: 'idle' })
    setAptOpen(false)
    setBrandOpen(false)
    createVisitorForm.reset()
    entryForm.reset({
      towerId: '',
      apartmentId: '',
      entryType: 'pedestrian',
      visitorCategory: 'visita',
      vehicleBrandId: '',
      vehicleColor: '',
      vehiclePlate: '',
      vehicleModel: '',
      notes: '',
    })
    setPhotoFile(null)
    setHistoryPhotoPath(null)
    setCreateVisitorSubmitting(false)
    setEntrySubmitting(false)
    setOpen(false)
  }

  const activeVisitor = phase.kind === 'ready' ? phase.visitor : null

  const filteredApartments = apartmentsQuery.data?.data ?? []
  const selectedApartment = filteredApartments.find((apt) => apt.id === selectedApartmentId) ?? null

  const handleEntrySubmit = entryForm.handleSubmit((values) => {
    if (!activeVisitor) return
    if (entrySubmitting) return
    setEntrySubmitting(true)
    const existingPhoto = historyPhotoPath?.trim() || null

    const payload: Record<string, unknown> = {
      visitorId: activeVisitor.id,
      apartmentId: values.apartmentId,
      entryType: values.entryType,
      visitorCategory: values.visitorCategory,
      notes: values.notes || undefined,
      visitorPhotoPath: photoFile ? undefined : existingPhoto ?? undefined,
    }

    const submitIsCarOrMoto = values.entryType === 'car' || values.entryType === 'motorcycle'
    const submitIsTaxi = values.entryType === 'taxi'
    if (submitIsCarOrMoto || submitIsTaxi) {
      if (submitIsCarOrMoto) payload.vehicleBrandId = values.vehicleBrandId || undefined
      payload.vehicleColor = values.vehicleColor?.trim() || undefined
      payload.vehiclePlate = normalizePlate(values.vehiclePlate) || undefined
      payload.vehicleModel = values.vehicleModel?.trim() || undefined
    }

    accessMutation.mutate({ payload, photo: photoFile })
  })

  function handlePlateSearch() {
    const normalizedPlate = plateSearch.trim()
    if (!normalizedPlate) return
    plateSearchMutation.mutate(normalizedPlate)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleReset()
        setOpen(v)
      }}
    >
      <DialogTrigger asChild>
        <Button>Registrar ingreso</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,620px)] max-h-[90vh] p-0 overflow-hidden gap-0 flex flex-col">
        <DialogHeader className="mb-0 p-5 pb-3">
          <DialogTitle>Registrar ingreso</DialogTitle>
          <DialogDescription>
            Busca por cédula o placa para registrar la entrada.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 pt-3 pb-6 touch-pan-y">
          {phase.kind !== 'ready' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Paso 1 · Buscar visitante
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="Número de cédula o documento"
                  value={searchDoc}
                  onChange={(e) => {
                    setSearchDoc(e.target.value)
                    if (phase.kind !== 'idle') setPhase({ kind: 'idle' })
                    setPhotoFile(null)
                    setHistoryPhotoPath(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={searchVisitorMutation.isPending}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSearch}
                  disabled={!searchDoc.trim() || searchVisitorMutation.isPending}
                >
                  <Search className="size-4" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Placa rápida"
                  value={plateSearch}
                  onChange={(e) => setPlateSearch(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handlePlateSearch()}
                  disabled={plateSearchMutation.isPending || accessMutation.isPending}
                  maxLength={15}
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePlateSearch}
                  disabled={!plateSearch.trim() || plateSearchMutation.isPending || accessMutation.isPending}
                >
                  <Search className="size-4" />
                </Button>
              </div>

              {phase.kind === 'not_found' && (
                <div className="space-y-3 pt-1">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-600">
                      Visitante no encontrado
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      No existe un visitante con cédula <strong>{phase.document}</strong>. Completa los datos para crearlo.
                    </p>
                  </div>
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
                      <Input {...createVisitorForm.register('name')} placeholder="Laura" />
                    </Field>
                    <Field label="Apellido" error={createVisitorForm.formState.errors.lastName?.message}>
                      <Input {...createVisitorForm.register('lastName')} placeholder="Sánchez" />
                    </Field>
                    <Field label="Documento" error={createVisitorForm.formState.errors.document?.message}>
                      <Input {...createVisitorForm.register('document')} placeholder="12345678" />
                    </Field>
                    <Field label="Teléfono" error={createVisitorForm.formState.errors.phone?.message}>
                      <Input {...createVisitorForm.register('phone')} placeholder="3001234567" />
                    </Field>
                    <Button type="submit" className="sm:col-span-2" disabled={createVisitorSubmitting || createVisitorMutation.isPending}>
                      <UserRoundPlus className="mr-2 size-4" />
                      Crear visitante y continuar
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

	          {(phase.kind === 'ready' || phase.kind === 'not_found') && (
	            <div className="space-y-3">
	              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
	                Paso 2 · Datos del ingreso
	              </p>
	              {phase.kind === 'ready' ? (
	                <VisitorCard visitor={phase.visitor} onClear={() => setPhase({ kind: 'idle' })} />
	              ) : (
	                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
	                  Crea el visitante en el paso 1 para habilitar el registro del ingreso.
	                </div>
	              )}

	              <form className="space-y-3" onSubmit={handleEntrySubmit}>
	                <fieldset disabled={phase.kind !== 'ready'} className="space-y-3 disabled:opacity-60">
	                <Field label="Apartamento" error={entryForm.formState.errors.apartmentId?.message ?? entryForm.formState.errors.towerId?.message}>
                  <FilterableSelect
                    open={aptOpen}
                    onOpenChange={setAptOpen}
                    value={selectedApartmentId}
                    displayValue={
                      selectedApartment
                        ? `${selectedApartment.tower ?? 'Torre'} · Apt. ${selectedApartment.number}`
                        : ''
                    }
                    placeholder="Buscar torre o apto"
                    searchPlaceholder="Buscar torre o apto"
                    items={filteredApartments}
                    getKey={(a) => a.id}
                    getLabel={(a) => `${a.tower ?? 'Torre'} · Apt. ${a.number}${a.floor != null ? ` · Piso ${a.floor}` : ''}`}
                    onSelect={(a) => {
                      entryForm.setValue('towerId', a.towerId, { shouldValidate: true })
                      entryForm.setValue('apartmentId', a.id, { shouldValidate: true })
                      setAptOpen(false)
                    }}
                    searchValue={aptSearch}
                    onSearchValueChange={setAptSearch}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Categoría" error={entryForm.formState.errors.visitorCategory?.message}>
                    <Select
                      value={selectedVisitorCategory ?? 'visita'}
                      onValueChange={(value) =>
                        entryForm.setValue('visitorCategory', value as z.infer<typeof entrySchema>['visitorCategory'], {
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {VISITOR_CATEGORY_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Tipo de entrada" error={entryForm.formState.errors.entryType?.message}>
                    <Select
                      value={selectedEntryType ?? 'pedestrian'}
                      onValueChange={(value) => handleEntryTypeChange(value as z.infer<typeof entrySchema>['entryType'])}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {ENTRY_TYPE_OPTIONS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {showVehicleSection && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {isCarOrMoto && (
                      <Field label="Marca" error={entryForm.formState.errors.vehicleBrandId?.message}>
                        <FilterableSelect
                          open={brandOpen}
                          onOpenChange={setBrandOpen}
                          value={selectedVehicleBrandId}
                          displayValue={
                            (brandsQuery.data ?? []).find((brand) => brand.id === selectedVehicleBrandId)
                              ?.name ?? ''
                          }
                          placeholder="Selecciona marca"
                          searchPlaceholder="Filtrar marca..."
                          items={brandsQuery.data ?? []}
                          getKey={(brand) => brand.id}
                          getLabel={(brand) => brand.name}
                          onSelect={(brand) => {
                            entryForm.setValue('vehicleBrandId', brand.id, { shouldValidate: true })
                            setBrandOpen(false)
                          }}
                          searchValue={brandSearch}
                          onSearchValueChange={setBrandSearch}
                        />
                      </Field>
                    )}

                    <Field label="Placa" error={entryForm.formState.errors.vehiclePlate?.message}>
                      <Input
                        {...entryForm.register('vehiclePlate', { setValueAs: (v: string) => normalizePlate(v) })}
                        placeholder="ABC123"
                        maxLength={15}
                        className="uppercase"
                      />
                    </Field>

                    <Field label="Color (opcional)" error={entryForm.formState.errors.vehicleColor?.message}>
                      <Input {...entryForm.register('vehicleColor')} placeholder="Blanco" />
                    </Field>

                    <Field label="Modelo (opcional)" error={entryForm.formState.errors.vehicleModel?.message}>
                      <Input {...entryForm.register('vehicleModel')} placeholder="2024" maxLength={60} />
                    </Field>
                  </div>
                )}

                <Field label="Foto del visitante (opcional)">
                  <ImageCaptureControl
                    buttonLabel={photoFile ? 'Cambiar foto' : historyPhotoPath ? 'Actualizar foto' : 'Seleccionar foto'}
                    onFiles={(files) => setPhotoFile(files[0] ?? null)}
                  />
                  {!photoFile && historyPhotoPath && (
                    <p className="mt-2 text-xs text-emerald-600">Se cargó la última foto registrada para este visitante.</p>
                  )}
                  {effectivePhotoPreview && (
                    <div className="mt-3 relative w-fit">
                      <ImagePreviewDialog
                        src={effectivePhotoPreview}
                        alt="Visitante"
                        title="Foto del visitante"
                        className="size-24 rounded-lg border border-slate-200 bg-white"
                      />
                      {photoFile && (
                        <button
                          type="button"
                          onClick={() => setPhotoFile(null)}
                          className="absolute -right-2 -top-2 rounded-full border border-slate-300 bg-white p-1 text-slate-500 hover:text-slate-700"
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
                    {...entryForm.register('notes')}
                    placeholder="Ej. visita autorizada, ingreso en vehículo particular."
                    rows={2}
                  />
                </Field>

                <Button type="submit" className="w-full" disabled={entrySubmitting || accessMutation.isPending}>
                  <DoorOpen className="mr-2 size-4" />
                  Confirmar ingreso
                </Button>
                </fieldset>
	              </form>
	            </div>
	          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ExitPhase =
  | { kind: 'idle' }
  | { kind: 'not_found' }
  | { kind: 'no_open_access'; visitor: Visitor }
  | { kind: 'ready'; visitor: Visitor; openAccess: AccessAudit }

function RegisterExitDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [searchDoc, setSearchDoc] = useState('')
  const [phase, setPhase] = useState<ExitPhase>({ kind: 'idle' })
  const [submitting, setSubmitting] = useState(false)

  const searchMutation = useMutation({
    mutationFn: api.searchOpenAccessByDocument,
    onSuccess: (result) => {
      if (!result.visitor) {
        setPhase({ kind: 'not_found' })
        return
      }
      if (!result.openAccess) {
        setPhase({ kind: 'no_open_access', visitor: result.visitor })
        return
      }
      setPhase({ kind: 'ready', visitor: result.visitor, openAccess: result.openAccess })
    },
    onError: () => toast.error('No fue posible consultar el visitante'),
  })

  const exitMutation = useMutation({
    mutationFn: (id: string) => api.registerExit(id),
    onSuccess: () => {
      toast.success('Salida registrada')
      handleReset()
      void queryClient.invalidateQueries({ queryKey: ['access-audit'] })
      void queryClient.invalidateQueries({ queryKey: ['access-audit-stats'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'No fue posible registrar la salida')),
    onSettled: () => setSubmitting(false),
  })

  const handleSearch = useCallback(() => {
    const normalizedDocument = searchDoc.trim()
    if (!normalizedDocument) return
    searchMutation.mutate(normalizedDocument)
  }, [searchDoc, searchMutation])

  const canScan = open && phase.kind !== 'ready'
  useScanInput(useCallback((value: string) => {
    const doc = extractDocumentFromBarcode(value)
    if (!doc) {
      toast.error('Código no legible. En la cédula digital escanea el código MRZ (las 3 líneas de letras y números del reverso), no el QR.')
      return
    }
    setSearchDoc(doc)
    searchMutation.mutate(doc)
  }, [searchMutation]), canScan)

  function handleReset() {
    setSearchDoc('')
    setPhase({ kind: 'idle' })
    setSubmitting(false)
    setOpen(false)
  }

  function handleConfirmExit() {
    if (phase.kind !== 'ready') return
    if (submitting) return
    setSubmitting(true)
    exitMutation.mutate(phase.openAccess.id)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleReset()
        setOpen(v)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Registrar salida</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,480px)] p-0 overflow-hidden gap-0 flex flex-col">
        <DialogHeader className="mb-0 p-5 pb-3">
          <DialogTitle>Registrar salida</DialogTitle>
          <DialogDescription>Busca por cédula para cerrar un ingreso abierto.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5 pt-3 pb-6">
          <div className="flex gap-2">
            <Input
              placeholder="Número de cédula o documento"
              value={searchDoc}
              onChange={(e) => {
                setSearchDoc(e.target.value)
                if (phase.kind !== 'idle') setPhase({ kind: 'idle' })
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={searchMutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleSearch}
              disabled={!searchDoc.trim() || searchMutation.isPending}
            >
              <Search className="size-4" />
            </Button>
          </div>

          {phase.kind === 'not_found' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              No existe un visitante con ese documento.
            </div>
          )}

          {phase.kind === 'no_open_access' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-slate-600">
              <strong>{formatName(phase.visitor.name, phase.visitor.lastName)}</strong> no tiene un ingreso abierto para registrar salida.
            </div>
          )}

          {phase.kind === 'ready' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">Ingreso abierto</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatName(phase.visitor.name, phase.visitor.lastName)}
                </p>
                {phase.visitor.document && (
                  <p className="text-sm text-slate-500">CC {formatDocument(phase.visitor.document)}</p>
                )}
                {phase.openAccess.apartment && (
                  <p className="text-sm text-slate-500">
                    {phase.openAccess.apartment.tower ? `Torre ${phase.openAccess.apartment.tower} · ` : ''}
                    Apt. {phase.openAccess.apartment.number}
                  </p>
                )}
                <p className="text-sm text-slate-500">Entrada: {formatDate(phase.openAccess.entryTime)}</p>
                <p className="text-sm text-slate-500">
                  {VISITOR_CATEGORY_LABELS[phase.openAccess.visitorCategory ?? 'visita']} ·{' '}
                  {ENTRY_TYPE_LABELS[phase.openAccess.entryType]}
                </p>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={handleConfirmExit}
                disabled={submitting || exitMutation.isPending}
              >
                <LogOut className="mr-2 size-4" />
                Confirmar salida
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getPersonName(item: AccessAudit): string {
  if (item.visitor) return formatName(item.visitor.name, item.visitor.lastName)
  if (item.resident) return formatName(item.resident.name, item.resident.lastName)
  return 'Ingreso registrado'
}

function getVehicleSummary(item: AccessAudit) {
  const hasVehicleData = item.entryType === 'car' || item.entryType === 'motorcycle'
  if (!hasVehicleData) return '—'

  const parts = [item.vehicleBrand?.name, item.vehicleModel, item.vehicleColor, normalizePlate(item.vehiclePlate)]
    .filter(Boolean)
    .join(' · ')

  return parts || '—'
}

export function AccessPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({})
  const [quickTowerId, setQuickTowerId] = useState('')
  const [quickApartmentId, setQuickApartmentId] = useState('')
  const [quickTowerOpen, setQuickTowerOpen] = useState(false)
  const [quickTowerSearch, setQuickTowerSearch] = useState('')
  const [quickAptOpen, setQuickAptOpen] = useState(false)
  const [quickAptSearch, setQuickAptSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const accessQuery = useQuery({
    queryKey: ['access-audit', page, search, tableFilters, quickApartmentId, dateFrom, dateTo],
    queryFn: () => api.getAccessAudit({
      page,
      limit: 15,
      search: search || undefined,
      apartmentId: quickApartmentId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      ...tableFilters,
    }),
    placeholderData: keepPreviousData,
  })
  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })
  const quickApartmentsQuery = useQuery({
    queryKey: ['apartments', 'access-quick', quickTowerId],
    queryFn: () => api.getApartments({ towerId: quickTowerId, limit: 500 }),
    enabled: Boolean(quickTowerId),
  })
  const statsQuery = useQuery({
    queryKey: ['access-audit-stats'],
    queryFn: api.getAccessAuditStats,
    refetchInterval: 30_000,
  })
  const accessAudit = accessQuery.data?.data ?? []

  const towerFilterOptions = useMemo(
    () =>
      (towersQuery.data ?? [])
        .map((tower) => ({ value: tower.id, label: tower.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [towersQuery.data],
  )

  const filters: FilterDef[] = [
    {
      key: 'type',
      placeholder: 'Tipo',
      options: [
        { value: 'visitor', label: 'Visitante' },
        { value: 'resident', label: 'Residente' },
      ],
    },
    {
      key: 'entryType',
      placeholder: 'Ingreso',
      options: ENTRY_TYPE_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    },
    {
      key: 'visitorCategory',
      placeholder: 'Categoría',
      options: VISITOR_CATEGORY_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    },
    {
      key: 'entryTime',
      type: 'period',
      placeholder: 'Período',
      options: [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Última semana' },
        { value: 'month', label: 'Último mes' },
        { value: 'quarter', label: 'Últimos 3 meses' },
      ],
    },
    ...(towerFilterOptions.length > 0 ? [{ key: 'towerId', placeholder: 'Torre', options: towerFilterOptions }] : []),
  ]

  const columns: ColumnDef<AccessAudit>[] = [
    {
      header: 'Visitante',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{getPersonName(row)}</p>
          {row.visitor?.document && <p className="text-xs text-slate-400 mt-0.5">CC {formatDocument(row.visitor.document)}</p>}
        </div>
      ),
    },
    {
      header: 'Tipo',
      cell: (row) => (
        <StatusBadge
          label={row.visitor ? 'Visitante' : 'Residente'}
          variant={row.visitor ? 'violet' : 'blue'}
        />
      ),
    },
    {
      header: 'Ingreso',
      cell: (row) => (
        <StatusBadge
          label={ENTRY_TYPE_LABELS[row.entryType] ?? 'A pie'}
          variant={getEntryTypeVariant(row.entryType)}
        />
      ),
    },
    {
      header: 'Categoría',
      cell: (row) =>
        row.visitorCategory ? (
          <StatusBadge
            label={VISITOR_CATEGORY_LABELS[row.visitorCategory] ?? 'Visita'}
            variant={getVisitorCategoryVariant(row.visitorCategory)}
          />
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      header: 'Vehículo',
      cell: (row) => <span className="text-xs text-slate-600">{getVehicleSummary(row)}</span>,
    },
    {
      header: 'Foto',
      cell: (row) => {
        const src = resolveUploadPath(row.visitorPhotoPath)
        if (!src) return <span className="text-slate-400">—</span>

        return (
          <ImagePreviewDialog
            src={src}
            alt="Visitante"
            title="Foto del visitante"
            description={getPersonName(row)}
            className="size-10 rounded-md border border-slate-200 bg-white"
          />
        )
      },
    },
    {
      header: 'Destino',
      cell: (row) =>
        row.apartment ? (
          <div className="text-sm">
            <p className="text-slate-700">{row.apartment.tower ? `Torre ${row.apartment.tower}` : '—'}</p>
            <p className="text-xs text-slate-400">Apt. {row.apartment.number}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      header: 'Entrada',
      cell: (row) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(row.entryTime)}</span>,
    },
    {
      header: 'Salida',
      cell: (row) => {
        if (row.exitTime) {
          return <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(row.exitTime)}</span>
        }
        const isToday = new Date(row.entryTime).toDateString() === new Date().toDateString()
        return isToday ? <StatusBadge label="Dentro" variant="green" /> : <span className="text-slate-400">—</span>
      },
    },
    {
      header: 'Registró',
      cell: (row) => (
        <span className="text-xs text-slate-500">
          {row.authorizedByEmployee
            ? formatName(row.authorizedByEmployee.name, row.authorizedByEmployee.lastName)
            : '—'}
        </span>
      ),
    },
    {
      header: 'Notas',
      cell: (row) => <span className="line-clamp-1 max-w-[180px] text-xs text-slate-500">{row.notes ?? '—'}</span>,
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow="Porteria"
        title="Accesos"
        description="Registro de ingresos al conjunto. Incluye tipo de entrada, datos de vehículo y foto del visitante."
        action={
          <div className="flex items-center gap-2">
            {user?.role === 'administrator' && <ManageVehicleBrandsDialog />}
            <RegisterExitDialog />
            <RegisterEntryDialog />
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            label="Ingresos totales"
            value={statsQuery.data?.total ?? accessQuery.data?.meta.total ?? 0}
            detail="Entradas registradas en el sistema."
            icon={<DoorOpen className="size-5" />}
          />
          <KpiCard
            label="Hoy"
            value={statsQuery.data?.today ?? 0}
            detail="Ingresos registrados hoy."
            icon={<Clock3 className="size-5" />}
          />
          <KpiCard
            label="Visitantes únicos hoy"
            value={statsQuery.data?.uniqueVisitorsToday ?? 0}
            detail="Visitantes distintos que ingresaron hoy."
            icon={<UserRoundPlus className="size-5" />}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <Building2 className="size-4 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Filtro por apartamento:</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <FilterableSelect
              open={quickTowerOpen}
              onOpenChange={setQuickTowerOpen}
              value={quickTowerId}
              displayValue={(towersQuery.data ?? []).find((t) => t.id === quickTowerId)?.name ?? ''}
              placeholder="Torre"
              searchPlaceholder="Buscar torre..."
              items={towersQuery.data ?? []}
              getKey={(t) => t.id}
              getLabel={(t) => t.name}
              searchValue={quickTowerSearch}
              onSearchValueChange={setQuickTowerSearch}
              onSelect={(t) => {
                setQuickTowerId(t.id)
                setQuickApartmentId('')
                setQuickTowerOpen(false)
                setQuickAptOpen(true)
                setPage(1)
              }}
            />
            <FilterableSelect
              open={quickAptOpen}
              onOpenChange={setQuickAptOpen}
              value={quickApartmentId}
              displayValue={quickApartmentId
                ? `Apt. ${(quickApartmentsQuery.data?.data ?? []).find((a) => a.id === quickApartmentId)?.number ?? ''}`
                : ''}
              placeholder={quickTowerId ? 'Apartamento' : 'Primero selecciona torre'}
              searchPlaceholder="Buscar apartamento..."
              disabled={!quickTowerId}
              items={quickApartmentsQuery.data?.data ?? []}
              getKey={(a) => a.id}
              getLabel={(a) => `Apt. ${a.number}`}
              searchValue={quickAptSearch}
              onSearchValueChange={setQuickAptSearch}
              onSelect={(a) => { setQuickApartmentId(a.id); setQuickAptOpen(false); setPage(1) }}
            />
            {(quickTowerId || quickApartmentId) && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
                onClick={() => { setQuickTowerId(''); setQuickApartmentId(''); setPage(1) }}
              >
                <X className="size-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <CalendarX2 className="size-4 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Rango de fechas:</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 shrink-0">Desde</label>
              <input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-500 shrink-0">Hasta</label>
              <input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700"
                onClick={() => { setDateFrom(''); setDateTo(''); setPage(1) }}
              >
                <X className="size-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        <DataTable
          data={accessAudit}
          columns={columns}
          searchPlaceholder="Buscar visitante, placa, marca o apartamento..."
          getSearchText={(row) =>
            [
              row.visitor ? `${formatName(row.visitor.name, row.visitor.lastName)} ${row.visitor.document ?? ''}` : null,
              row.resident ? formatName(row.resident.name, row.resident.lastName) : null,
              row.apartment ? `${row.apartment.tower} ${row.apartment.number}` : null,
              row.vehicleBrand?.name,
              row.vehiclePlate,
              row.vehicleModel,
              row.vehicleColor,
              ENTRY_TYPE_LABELS[row.entryType],
              row.notes,
            ]
              .filter(Boolean)
              .join(' ')
          }
          filters={filters}
          getFilterValues={(row) => ({
            type: row.visitor ? 'visitor' : 'resident',
            entryType: row.entryType,
            visitorCategory: row.visitorCategory ?? '',
            entryTime: row.entryTime,
            towerId: row.apartment?.towerId ?? '',
          })}
          isLoading={accessQuery.isLoading}
          emptyMessage="Sin ingresos registrados."
          serverSide
          totalItems={accessQuery.data?.meta.total}
          currentPage={page}
          onPageChange={setPage}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          onFiltersChange={(v) => { setTableFilters(v); setPage(1) }}
        />
      </div>
    </div>
  )
}
