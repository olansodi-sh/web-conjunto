import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Bell, Building2, Car, KeyRound, Mail, Pencil, Plus, Sparkles, Trash2, User, UserCheck, Users, X } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FilterableSelect } from '@/components/ui/filterable-select'
import { DataTable, type ColumnDef, type FilterDef } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { UPLOADS_URL } from '@/lib/constants'
import { formatDate, formatDocument, formatName, normalizePlate } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { toast } from 'sonner'
import type { Resident } from '@/types/api'

// ─── Resident photo (avatar + click to enlarge) ───────────────────────────────

function resolvePhoto(path?: string | null): string | null {
  if (!path) return null
  return `${UPLOADS_URL}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
}

function ResidentPhoto({ resident }: { resident: Resident }) {
  const [open, setOpen] = useState(false)
  const src = resolvePhoto(resident.photoPath)

  if (!src) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100">
        <User className="size-5 text-slate-400" />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          aria-label="Ver foto en detalle"
        >
          <img src={src} alt={formatName(resident.name, resident.lastName)} className="h-11 w-11 rounded-full object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,460px)]">
        <DialogHeader>
          <DialogTitle>{formatName(resident.name, resident.lastName)}</DialogTitle>
          <DialogDescription>CC {formatDocument(resident.document)}</DialogDescription>
        </DialogHeader>
        <img
          src={src}
          alt={formatName(resident.name, resident.lastName)}
          className="max-h-[70vh] w-full rounded-lg object-contain bg-slate-50"
        />
      </DialogContent>
    </Dialog>
  )
}

// ─── Manage apartments dialog (multi-apartment) ───────────────────────────────

const quickNotifySchema = z.object({
  notificationTypeId: z.string().uuid('Selecciona un tipo'),
  message: z.string().min(4, 'Mínimo 4 caracteres'),
})

function NotifyResidentDialog({ resident }: { resident: Resident }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const residentApartmentId = resident.apartment?.id ?? resident.apartmentId ?? null
  const canNotify = Boolean(residentApartmentId)

  const typesQuery = useQuery({
    queryKey: ['notification-types'],
    queryFn: api.getNotificationTypes,
    enabled: open,
  })

  const form = useForm<z.infer<typeof quickNotifySchema>>({
    resolver: zodResolver(quickNotifySchema),
    defaultValues: { notificationTypeId: '', message: '' },
  })

  const selectedTypeId = useWatch({ control: form.control, name: 'notificationTypeId' })

  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof quickNotifySchema>) =>
      api.createNotification({
        apartmentId: residentApartmentId,
        residentId: resident.id,
        notificationTypeId: values.notificationTypeId,
        message: values.message,
      }),
    onSuccess: () => {
      toast.success('Notificación enviada')
      form.reset()
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
    },
    onError: () => toast.error('No fue posible enviar la notificación'),
  })

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) form.reset()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={!canNotify}
          title={!canNotify ? 'El residente debe tener apartamento asignado' : undefined}
        >
          <Bell className="size-3" />
          Notificar
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,520px)]">
        <DialogHeader>
          <DialogTitle>
            Notificar a {formatName(resident.name, resident.lastName)}
          </DialogTitle>
          <DialogDescription>
            {resident.apartment
              ? `${resident.apartment.towerData?.name ?? 'Torre'} · Apt. ${resident.apartment.number}`
              : 'Apartamento no disponible'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <Field label="Tipo" error={form.formState.errors.notificationTypeId?.message}>
            <Select
              onValueChange={(v) => form.setValue('notificationTypeId', v, { shouldValidate: true })}
              value={selectedTypeId}
            >
              <SelectTrigger>
                <SelectValue placeholder={typesQuery.isLoading ? 'Cargando...' : 'Selecciona tipo'} />
              </SelectTrigger>
              <SelectContent>
                {(typesQuery.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Mensaje" error={form.formState.errors.message?.message}>
            <Input {...form.register('message')} placeholder="Escribe el mensaje para el residente" />
          </Field>

          <Button type="submit" className="w-full" disabled={createMutation.isPending || !canNotify}>
            Enviar notificación
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageApartmentsDialog({ resident }: { resident: Resident }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedTowerId, setSelectedTowerId] = useState('')
  const [selectedApartmentId, setSelectedApartmentId] = useState('')
  const [towerOpen, setTowerOpen] = useState(false)
  const [towerSearch, setTowerSearch] = useState('')
  const [aptOpen, setAptOpen] = useState(false)
  const [aptSearch, setAptSearch] = useState('')

  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })
  const apartmentsQuery = useQuery({
    queryKey: ['apartments', selectedTowerId],
    queryFn: () => api.getApartments({ towerId: selectedTowerId || undefined, limit: 200 }),
    enabled: Boolean(selectedTowerId),
  })
  const myApartmentsQuery = useQuery({
    queryKey: ['resident-apartments', resident.id],
    queryFn: () => api.getResidentApartments(resident.id),
    enabled: open,
  })

  const towers = towersQuery.data ?? []
  const apartments = (apartmentsQuery.data?.data ?? []).filter((a) => a.towerId === selectedTowerId)
  const myApartments = myApartmentsQuery.data ?? []
  const selectedTower = towers.find((t) => t.id === selectedTowerId)
  const selectedApartment = apartments.find((a) => a.id === selectedApartmentId)

  const addMutation = useMutation({
    mutationFn: () => api.addResidentApartment(resident.id, selectedApartmentId),
    onSuccess: () => {
      toast.success('Apartamento agregado')
      setSelectedTowerId('')
      setSelectedApartmentId('')
      void queryClient.invalidateQueries({ queryKey: ['resident-apartments', resident.id] })
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
    },
    onError: () => toast.error('No fue posible agregar el apartamento'),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeResidentApartment(id),
    onSuccess: () => {
      toast.success('Apartamento removido')
      void queryClient.invalidateQueries({ queryKey: ['resident-apartments', resident.id] })
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
    },
    onError: () => toast.error('No fue posible remover el apartamento'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
          <Building2 className="size-3" />
          Apartamentos
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,520px)]">
        <DialogHeader>
          <DialogTitle>{formatName(resident.name, resident.lastName)} — Apartamentos</DialogTitle>
          <DialogDescription>Gestiona los apartamentos asignados a este residente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current apartments */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asignados actualmente</p>
            {myApartmentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : myApartments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin apartamentos asignados.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {myApartments.map((ra) => (
                  <div key={ra.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        {ra.apartment?.towerData?.name ?? `Torre`} · Apt. {ra.apartment?.number}
                      </p>
                      <p className="text-xs text-muted-foreground">Piso {ra.apartment?.floor ?? '—'}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removeMutation.mutate(ra.id)}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new apartment */}
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Plus className="size-3" /> Agregar apartamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Torre">
                <FilterableSelect
                  open={towerOpen}
                  onOpenChange={setTowerOpen}
                  value={selectedTowerId}
                  displayValue={selectedTower?.name ?? ''}
                  placeholder="Selecciona torre"
                  searchPlaceholder="Filtrar torre..."
                  items={towers}
                  getKey={(t) => t.id}
                  getLabel={(t) => `${t.name} (${t.code})`}
                  onSelect={(t) => {
                    setSelectedTowerId(t.id)
                    setSelectedApartmentId('')
                    setTowerOpen(false)
                    setAptOpen(true)
                  }}
                  searchValue={towerSearch}
                  onSearchValueChange={setTowerSearch}
                />
              </Field>
              <Field label="Apartamento">
                <FilterableSelect
                  open={aptOpen}
                  onOpenChange={setAptOpen}
                  value={selectedApartmentId}
                  displayValue={selectedApartment ? `Apt. ${selectedApartment.number}` : ''}
                  placeholder={!selectedTowerId ? 'Primero torre' : 'Selecciona apt.'}
                  searchPlaceholder="Filtrar..."
                  disabled={!selectedTowerId}
                  items={apartments}
                  getKey={(a) => a.id}
                  getLabel={(a) => `Apt. ${a.number}${a.floor != null ? ` · Piso ${a.floor}` : ''}`}
                  onSelect={(a) => {
                    setSelectedApartmentId(a.id)
                    setAptOpen(false)
                  }}
                  searchValue={aptSearch}
                  onSearchValueChange={setAptSearch}
                />
              </Field>
            </div>
            <Button
              className="w-full"
              size="sm"
              onClick={() => addMutation.mutate()}
              disabled={!selectedApartmentId || addMutation.isPending}
            >
              <Plus className="mr-1.5 size-3.5" /> Agregar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Create resident dialog ───────────────────────────────────────────────────

// ─── Correo temporal ──────────────────────────────────────────────────────────
// El correo es obligatorio en la práctica (la API exige un email válido y sin él
// no hay restablecimiento de clave). Cuando el residente no tiene uno a la mano,
// el chip propone un placeholder derivado de sus datos. El dominio .local es
// reservado y no enrutable: nunca saldrá un correo real hacia estas direcciones.
export const TEMP_EMAIL_DOMAIN = 'temporal.local'

const EMAIL_MAX_LENGTH = 100 // columna residents.email → varchar(100)

function slugifyForEmail(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes y diéresis
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Arma "nombre.apellido.documento@temporal.local". Se incluye el documento
 * porque el correo es UNIQUE en base de datos y dos residentes homónimos son
 * plausibles; el documento (obligatorio y único) garantiza que no colisionen.
 */
export function buildTempEmail(name: string, lastName: string, document: string) {
  const first = slugifyForEmail(name)
  const last = slugifyForEmail(lastName)
  if (!first || !last) return null

  const doc = slugifyForEmail(document)
  const localPart = (doc ? `${first}.${last}.${doc}` : `${first}.${last}`).slice(
    0,
    EMAIL_MAX_LENGTH - TEMP_EMAIL_DOMAIN.length - 1,
  )

  return `${localPart}@${TEMP_EMAIL_DOMAIN}`
}

export function isTempEmail(email?: string) {
  return Boolean(email?.trim().toLowerCase().endsWith(`@${TEMP_EMAIL_DOMAIN}`))
}

// ─── Vehículo en el alta de residente ─────────────────────────────────────────
// El vehículo cuelga del APARTAMENTO (tabla resident_vehicles), no del residente,
// y por eso el apartamento es obligatorio en el alta. La placa es única en todo
// el conjunto: no puede repetirse ni en el mismo apartamento ni en otro.

/** El residente sí se creó, pero el vehículo no: el mensaje debe distinguirlo. */
class VehicleStepError extends Error {}

const VEHICLE_TYPES = [
  { value: 'car', label: 'Carro' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'truck', label: 'Camioneta / Camión' },
  { value: 'bicycle', label: 'Bicicleta' },
  { value: 'other', label: 'Otro' },
] as const

const residentSchema = z
  .object({
    name: z.string().min(2),
    lastName: z.string().min(2),
    document: z.string().min(4).max(50),
    phone: z.string().max(20).optional().or(z.literal('')),
    email: z.string().email().optional().or(z.literal('')),
    password: z.string().min(6),
    residentTypeId: z.string().uuid(),
    towerId: z.string().uuid({ message: 'Selecciona una torre' }),
    apartmentId: z.string().uuid({ message: 'Selecciona un apartamento' }),
    // Vehículo (opcional en bloque, pero coherente si se empieza a llenar)
    hasVehicle: z.boolean(),
    vehicleType: z.string().optional().or(z.literal('')),
    vehicleBrandId: z.string().optional().or(z.literal('')),
    plate: z.string().max(15, 'Máx. 15 caracteres').optional().or(z.literal('')),
    vehicleColor: z.string().max(40).optional().or(z.literal('')),
    vehicleModel: z.string().max(60).optional().or(z.literal('')),
    vehicleNotes: z.string().max(500).optional().or(z.literal('')),
  })
  .superRefine((values, ctx) => {
    if (!values.hasVehicle) return

    if (!values.plate?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['plate'], message: 'Placa requerida' })
    }
    if (!values.vehicleBrandId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleBrandId'], message: 'Selecciona la marca' })
    }
    if (!values.vehicleType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleType'], message: 'Selecciona el tipo' })
    }
  })

type FormValues = z.infer<typeof residentSchema>

function CreateResidentDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [towerOpen, setTowerOpen] = useState(false)
  const [towerSearch, setTowerSearch] = useState('')
  const [aptOpen, setAptOpen] = useState(false)
  const [aptSearch, setAptSearch] = useState('')

  const residentTypesQuery = useQuery({ queryKey: ['resident-types'], queryFn: api.getResidentTypes })
  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })

  const [brandOpen, setBrandOpen] = useState(false)
  const [brandSearch, setBrandSearch] = useState('')

  const form = useForm<FormValues>({
    resolver: zodResolver(residentSchema),
    defaultValues: {
      name: '', lastName: '', document: '', phone: '', email: '',
      password: '', residentTypeId: '', towerId: '', apartmentId: '',
      hasVehicle: false, vehicleType: 'car', vehicleBrandId: '', plate: '',
      vehicleColor: '', vehicleModel: '', vehicleNotes: '',
    },
  })

  const selectedResidentTypeId = useWatch({ control: form.control, name: 'residentTypeId' })
  const selectedTowerId = useWatch({ control: form.control, name: 'towerId' })
  const selectedApartmentId = useWatch({ control: form.control, name: 'apartmentId' })

  const watchedName = useWatch({ control: form.control, name: 'name' })
  const watchedLastName = useWatch({ control: form.control, name: 'lastName' })
  const watchedDocument = useWatch({ control: form.control, name: 'document' })
  const watchedEmail = useWatch({ control: form.control, name: 'email' })

  const suggestedEmail = buildTempEmail(watchedName ?? '', watchedLastName ?? '', watchedDocument ?? '')
  const showEmailSuggestion = Boolean(suggestedEmail) && !watchedEmail?.trim()
  const usingTempEmail = isTempEmail(watchedEmail)

  const apartmentsQuery = useQuery({
    queryKey: ['apartments', selectedTowerId],
    queryFn: () => api.getApartments({ towerId: selectedTowerId || undefined, limit: 200 }),
    enabled: Boolean(selectedTowerId),
  })

  const towers = towersQuery.data ?? []
  const apartments = (apartmentsQuery.data?.data ?? []).filter((a) => a.towerId === selectedTowerId)
  const selectedTower = towers.find((t) => t.id === selectedTowerId)
  const selectedApartment = apartments.find((a) => a.id === selectedApartmentId)

  // ── Vehículo ───────────────────────────────────────────────────────────────
  const hasVehicle = useWatch({ control: form.control, name: 'hasVehicle' })
  const watchedPlate = useWatch({ control: form.control, name: 'plate' })
  const selectedVehicleType = useWatch({ control: form.control, name: 'vehicleType' })
  const selectedBrandId = useWatch({ control: form.control, name: 'vehicleBrandId' })

  const brandsQuery = useQuery({
    queryKey: ['vehicle-brands'],
    queryFn: api.getVehicleBrands,
    enabled: hasVehicle,
  })
  const brands = brandsQuery.data ?? []
  const selectedBrand = brands.find((b) => b.id === selectedBrandId)

  const normalizedPlate = normalizePlate(watchedPlate ?? '')
  const debouncedPlate = useDebouncedValue(normalizedPlate, 400)

  // Aviso temprano de placa duplicada: la regla la impone la API, pero verla
  // mientras se escribe evita crear el residente y fallar en el último paso.
  const plateCheckQuery = useQuery({
    queryKey: ['resident-vehicle-by-plate', debouncedPlate],
    queryFn: () => api.getResidentVehicleByPlate(debouncedPlate),
    enabled: hasVehicle && debouncedPlate.length >= 5,
    retry: false,
  })
  const plateTaken = hasVehicle ? (plateCheckQuery.data ?? null) : null
  const plateIsChecking = plateCheckQuery.isFetching && debouncedPlate !== ''

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const {
        towerId: _t, apartmentId,
        hasVehicle: withVehicle, vehicleType, vehicleBrandId, plate,
        vehicleColor, vehicleModel, vehicleNotes,
        ...residentPayload
      } = values

      // La API exige un correo valido: un string vacio la hace fallar con un 400
      // generico. Si el residente no tiene correo, se usa el temporal derivado de
      // sus datos en vez de dejar caer el registro completo.
      const email =
        residentPayload.email?.trim() ||
        buildTempEmail(residentPayload.name, residentPayload.lastName, residentPayload.document) ||
        undefined

      const resident = await api.createResident({
        ...residentPayload,
        email,
        phone: residentPayload.phone?.trim() || undefined,
      })
      await api.assignResidentApartment(resident.id, apartmentId)

      // El vehículo se crea de último: si su placa choca, el residente ya quedó
      // guardado, así que el error se reporta aparte para no perder ese trabajo.
      if (withVehicle) {
        try {
          await api.createResidentVehicle({
            apartmentId,
            vehicleBrandId,
            vehicleType: vehicleType || 'car',
            plate: normalizePlate(plate ?? ''),
            color: vehicleColor?.trim() || undefined,
            model: vehicleModel?.trim() || undefined,
            notes: vehicleNotes?.trim() || undefined,
          })
        } catch (err: any) {
          const msg = err?.response?.data?.message
          throw new VehicleStepError(
            typeof msg === 'string' ? msg : 'No fue posible registrar el vehículo',
          )
        }
      }

      return resident
    },
    onSuccess: () => {
      toast.success(hasVehicle ? 'Residente y vehículo registrados' : 'Residente creado')
      form.reset()
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
      void queryClient.invalidateQueries({ queryKey: ['resident-vehicles'] })
    },
    onError: (err: any) => {
      // El residente quedó creado; solo falló el vehículo. Se cierra el diálogo
      // para no invitar a reenviarlo (duplicaría el residente) y se explica
      // que el vehículo se registra aparte.
      if (err instanceof VehicleStepError) {
        toast.error(`Residente creado, pero el vehículo no: ${err.message}`, { duration: 8000 })
        form.reset()
        setOpen(false)
        void queryClient.invalidateQueries({ queryKey: ['residents'] })
        return
      }

      const msg = err?.response?.data?.message
      if (typeof msg === 'string' && msg.toLowerCase().includes('already')) {
        toast.error('Ya existe un residente con ese documento o correo')
      } else {
        toast.error('No fue posible crear el residente')
      }
    },
  })

  function handleClose(v: boolean) {
    setOpen(v)
    if (!v) {
      form.reset()
      setTowerOpen(false)
      setAptOpen(false)
      setBrandOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button>Nuevo residente</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,760px)]">
        <DialogHeader>
          <DialogTitle>Crear residente</DialogTitle>
          <DialogDescription>
            Nombre, documento, tipo, credenciales y apartamento. El vehículo es opcional.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <Field label="Nombre" error={form.formState.errors.name?.message}>
            <Input {...form.register('name')} placeholder="Ana" />
          </Field>
          <Field label="Apellido" error={form.formState.errors.lastName?.message}>
            <Input {...form.register('lastName')} placeholder="García" />
          </Field>
          <Field label="Documento" error={form.formState.errors.document?.message}>
            <Input {...form.register('document')} placeholder="10203040" />
          </Field>
          <Field label="Teléfono" error={form.formState.errors.phone?.message}>
            <Input {...form.register('phone')} placeholder="3001234567" />
          </Field>
          <Field
            label="Correo"
            error={form.formState.errors.email?.message}
            hint={
              usingTempEmail
                ? 'Correo temporal: no recibirá notificaciones por correo ni podrá restablecer su clave hasta registrar uno real.'
                : showEmailSuggestion
                  ? `Si lo dejas vacío se usará ${suggestedEmail}`
                  : undefined
            }
          >
            <Input {...form.register('email')} type="email" placeholder="ana@email.com" />
            {showEmailSuggestion && (
              <button
                type="button"
                onClick={() => form.setValue('email', suggestedEmail!, { shouldValidate: true })}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                title="El residente no tiene correo: usar uno temporal derivado de sus datos"
              >
                <Sparkles className="size-3 shrink-0" />
                <span className="truncate">Sin correo: usar {suggestedEmail}</span>
              </button>
            )}
          </Field>
          <Field label="Contraseña" error={form.formState.errors.password?.message}>
            <Input {...form.register('password')} type="password" placeholder="Mínimo 6 caracteres" />
          </Field>
          <Field
            label="Tipo de residente"
            error={form.formState.errors.residentTypeId?.message}
            className="md:col-span-2"
          >
            <Select
              onValueChange={(v) => form.setValue('residentTypeId', v, { shouldValidate: true })}
              value={selectedResidentTypeId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {(residentTypesQuery.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Apartment — requerido */}
          <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Apartamento</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Torre" error={form.formState.errors.towerId?.message}>
                <FilterableSelect
                  open={towerOpen}
                  onOpenChange={setTowerOpen}
                  value={selectedTowerId ?? ''}
                  displayValue={selectedTower?.name ?? ''}
                  placeholder="Selecciona torre"
                  searchPlaceholder="Filtrar torre..."
                  items={towers}
                  getKey={(t) => t.id}
                  getLabel={(t) => `${t.name} (${t.code})`}
                  onSelect={(t) => {
                    form.setValue('towerId', t.id, { shouldValidate: true })
                    form.setValue('apartmentId', '')
                    setTowerOpen(false)
                    setAptOpen(true)
                  }}
                  searchValue={towerSearch}
                  onSearchValueChange={setTowerSearch}
                />
              </Field>
              <Field label="Apartamento" error={form.formState.errors.apartmentId?.message}>
                <FilterableSelect
                  open={aptOpen}
                  onOpenChange={setAptOpen}
                  value={selectedApartmentId ?? ''}
                  displayValue={selectedApartment ? `Apt. ${selectedApartment.number}` : ''}
                  placeholder={!selectedTowerId ? 'Primero elige torre' : 'Selecciona apt.'}
                  searchPlaceholder="Filtrar por número o piso..."
                  disabled={!selectedTowerId}
                  items={apartments}
                  getKey={(a) => a.id}
                  getLabel={(a) => `Apt. ${a.number}${a.floor != null ? ` · Piso ${a.floor}` : ''}`}
                  onSelect={(a) => {
                    form.setValue('apartmentId', a.id, { shouldValidate: true })
                    setAptOpen(false)
                  }}
                  searchValue={aptSearch}
                  onSearchValueChange={setAptSearch}
                />
              </Field>
            </div>
          </div>

          {/* Vehículo — opcional, atado al apartamento */}
          <div className="md:col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-slate-300 accent-slate-900"
                checked={hasVehicle ?? false}
                onChange={(e) => form.setValue('hasVehicle', e.target.checked, { shouldValidate: true })}
              />
              <span>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Car className="size-3.5" />
                  Vehículo (opcional)
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Registra aquí mismo el carro o la moto del residente.
                </span>
              </span>
            </label>

            {hasVehicle && !selectedApartmentId && (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="size-3.5 shrink-0" />
                El vehículo se registra a nombre del apartamento: elige torre y apartamento arriba.
              </p>
            )}

            {hasVehicle && selectedApartmentId && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Tipo" error={form.formState.errors.vehicleType?.message}>
                    <Select
                      value={selectedVehicleType || 'car'}
                      onValueChange={(v) => form.setValue('vehicleType', v, { shouldValidate: true })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Marca" error={form.formState.errors.vehicleBrandId?.message}>
                    <FilterableSelect
                      open={brandOpen}
                      onOpenChange={setBrandOpen}
                      value={selectedBrandId ?? ''}
                      displayValue={selectedBrand?.name ?? ''}
                      placeholder={brandsQuery.isLoading ? 'Cargando marcas...' : 'Selecciona marca'}
                      searchPlaceholder="Filtrar marca..."
                      items={brands}
                      getKey={(b) => b.id}
                      getLabel={(b) => b.name}
                      onSelect={(b) => {
                        form.setValue('vehicleBrandId', b.id, { shouldValidate: true })
                        setBrandOpen(false)
                      }}
                      searchValue={brandSearch}
                      onSearchValueChange={setBrandSearch}
                    />
                  </Field>
                </div>

                <Field
                  label="Placa"
                  error={form.formState.errors.plate?.message}
                  hint={
                    plateIsChecking
                      ? 'Verificando placa...'
                      : plateTaken
                        ? undefined
                        : 'Única en todo el conjunto. Se guarda como ABC 123.'
                  }
                >
                  <Input
                    {...form.register('plate', { setValueAs: (v: string) => normalizePlate(v) })}
                    placeholder="ABC 123"
                    autoCapitalize="characters"
                    className={plateTaken ? 'border-destructive focus-visible:ring-destructive' : undefined}
                  />
                  {plateTaken && (
                    <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                      <span>
                        Esta placa ya está registrada
                        {plateTaken.apartmentId === selectedApartmentId
                          ? ' en este mismo apartamento.'
                          : ` en ${plateTaken.apartment?.towerData?.name ? `${plateTaken.apartment.towerData.name} · ` : ''}Apt. ${plateTaken.apartment?.number ?? '—'}.`}
                        {' '}Un vehículo no puede estar en dos apartamentos.
                      </span>
                    </p>
                  )}
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Color" error={form.formState.errors.vehicleColor?.message}>
                    <Input {...form.register('vehicleColor')} placeholder="Blanco" />
                  </Field>
                  <Field label="Modelo" error={form.formState.errors.vehicleModel?.message}>
                    <Input {...form.register('vehicleModel')} placeholder="2020" />
                  </Field>
                </div>

                <Field label="Observaciones" error={form.formState.errors.vehicleNotes?.message}>
                  <Input {...form.register('vehicleNotes')} placeholder="Parqueadero 12, sticker vencido..." />
                </Field>
              </div>
            )}
          </div>

          <Button
            className="md:col-span-2"
            type="submit"
            disabled={createMutation.isPending || Boolean(plateTaken)}
          >
            {createMutation.isPending
              ? 'Guardando…'
              : hasVehicle
                ? 'Guardar residente y vehículo'
                : 'Guardar residente'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit resident dialog ─────────────────────────────────────────────────────

const editResidentSchema = z.object({
  name: z.string().min(2, 'Mín. 2 caracteres').max(50),
  lastName: z.string().min(2, 'Mín. 2 caracteres').max(50),
  document: z.string().min(4, 'Mín. 4 caracteres').max(50),
  phone: z.string().max(20).optional().or(z.literal('')),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
})
type EditResidentValues = z.infer<typeof editResidentSchema>

function EditResidentDialog({ resident }: { resident: Resident }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const form = useForm<EditResidentValues>({
    resolver: zodResolver(editResidentSchema),
    defaultValues: {
      name: resident.name,
      lastName: resident.lastName,
      document: resident.document,
      phone: resident.phone ?? '',
      email: resident.email ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: EditResidentValues) =>
      api.updateResident(resident.id, {
        name: data.name.trim(),
        lastName: data.lastName.trim(),
        document: data.document.trim(),
        phone: data.phone?.trim() || undefined,
        email: data.email?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Residente actualizado')
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
      setOpen(false)
    },
    onError: () => toast.error('No fue posible actualizar el residente'),
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar residente">
          <Pencil className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar residente</DialogTitle>
          <DialogDescription>{formatName(resident.name, resident.lastName)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={form.formState.errors.name?.message}>
              <Input {...form.register('name')} placeholder="Ana" />
            </Field>
            <Field label="Apellido" error={form.formState.errors.lastName?.message}>
              <Input {...form.register('lastName')} placeholder="García" />
            </Field>
          </div>
          <Field label="Documento" error={form.formState.errors.document?.message}>
            <Input {...form.register('document')} placeholder="10203040" />
          </Field>
          <Field label="Teléfono" error={form.formState.errors.phone?.message}>
            <Input {...form.register('phone')} placeholder="3001234567" />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input {...form.register('email')} type="email" placeholder="ana@email.com" />
          </Field>
          <Button type="submit" disabled={mutation.isPending} className="self-end">
            {mutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Request password reset ──────────────────────────────────────────────────

function ResetPasswordButton({ resident }: { resident: Resident }) {
  const [open, setOpen] = useState(false)
  // Un correo temporal (@temporal.local) no es enrutable: el enlace nunca llegaría.
  const hasEmail = Boolean(resident.email?.trim()) && !isTempEmail(resident.email ?? undefined)

  const mutation = useMutation({
    mutationFn: () => api.requestResidentPasswordReset(resident.id),
    onSuccess: (res) => {
      if (res.emailSent) {
        toast.success(`Enlace de restablecimiento enviado a ${resident.email}`)
      } else {
        toast.warning('Se generó el enlace, pero no se pudo enviar el correo. Revisa la configuración de correo.')
      }
      setOpen(false)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      toast.error(typeof msg === 'string' ? msg : 'No fue posible generar el restablecimiento')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={!hasEmail}
          title={
            hasEmail
              ? undefined
              : isTempEmail(resident.email ?? undefined)
                ? 'El residente tiene un correo temporal: registra uno real para poder enviarle el enlace'
                : 'El residente no tiene correo registrado'
          }
        >
          <KeyRound className="size-3" />
          Restablecer clave
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,460px)]">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Se enviará un enlace seguro de un solo uso al correo de{' '}
            {formatName(resident.name, resident.lastName)}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="rounded-lg border bg-slate-50 px-3 py-2.5 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Correo destino</p>
            <p className="mt-0.5 font-medium text-slate-800">{resident.email ?? '—'}</p>
          </div>
          <p className="text-xs text-slate-500">
            El residente podrá fijar una nueva contraseña desde el enlace. El enlace vence pronto y solo
            puede usarse una vez. Cualquier enlace anterior quedará invalidado.
          </p>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !hasEmail}>
            {mutation.isPending ? 'Enviando…' : 'Enviar enlace de restablecimiento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ResidentsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'administrator'
  // El portero gestiona el directorio (alta, edición, notificación, estado, clave);
  // la asignación múltiple de apartamentos sigue siendo exclusiva del administrador.
  const canManage = isAdmin || user?.role === 'porter'
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tableFilters, setTableFilters] = useState<Record<string, string>>({})
  const [quickTowerId, setQuickTowerId] = useState('')
  const [quickApartmentId, setQuickApartmentId] = useState('')
  const [towerOpen, setTowerOpen] = useState(false)
  const [towerSearch, setTowerSearch] = useState('')
  const [aptOpen, setAptOpen] = useState(false)
  const [aptSearch, setAptSearch] = useState('')

  const residentsQuery = useQuery({
    queryKey: ['residents', page, search, tableFilters, quickApartmentId],
    queryFn: () => api.getResidents({
      page, limit: 15,
      search: search || undefined,
      apartmentId: quickApartmentId || undefined,
      ...tableFilters,
    }),
    placeholderData: keepPreviousData,
  })
  const residentTypesQuery = useQuery({ queryKey: ['resident-types'], queryFn: api.getResidentTypes })
  const towersQuery = useQuery({ queryKey: ['towers'], queryFn: api.getTowers })
  const quickApartmentsQuery = useQuery({
    queryKey: ['apartments', 'quick', quickTowerId],
    queryFn: () => api.getApartments({ towerId: quickTowerId, limit: 500 }),
    enabled: Boolean(quickTowerId),
  })
  const residents = residentsQuery.data?.data ?? []

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? api.deactivateResident(id) : api.activateResident(id),
    onSuccess: (_, vars) => {
      toast.success(vars.isActive ? 'Residente inactivado' : 'Residente activado')
      void queryClient.invalidateQueries({ queryKey: ['residents'] })
    },
    onError: () => toast.error('No fue posible cambiar el estado'),
  })

  const typeFilterOptions = (residentTypesQuery.data ?? []).map((t) => ({ value: t.id, label: t.name }))
  const towerFilterOptions = (towersQuery.data ?? []).map((t) => ({ value: t.id, label: t.name }))

  const filters: FilterDef[] = [
    ...(typeFilterOptions.length > 0 ? [{ key: 'typeId', placeholder: 'Tipo', options: typeFilterOptions }] : []),
    {
      key: 'isActive',
      placeholder: 'Estado',
      options: [
        { value: 'true', label: 'Activo' },
        { value: 'false', label: 'Inactivo' },
      ],
    },
    {
      key: 'hasApartment',
      placeholder: 'Apartamento',
      options: [
        { value: 'yes', label: 'Con apartamento' },
        { value: 'no', label: 'Sin apartamento' },
      ],
    },
    ...(towerFilterOptions.length > 0 ? [{ key: 'towerId', placeholder: 'Torre', options: towerFilterOptions }] : []),
  ]

  const columns: ColumnDef<Resident>[] = [
    {
      header: 'Foto',
      cell: (row) => <ResidentPhoto resident={row} />,
    },
    {
      header: 'Residente',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">
            {formatName(row.name, row.lastName)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">CC {formatDocument(row.document)}</p>
        </div>
      ),
    },
    {
      header: 'Tipo',
      cell: (row) => <span className="text-slate-600">{row.residentType?.name ?? '—'}</span>,
    },
    {
      header: 'Apartamento',
      cell: (row) => {
        const apts = row.apartments?.length ? row.apartments : row.apartment ? [row.apartment] : []
        if (apts.length === 0) return <span className="text-xs text-slate-400">Sin asignar</span>
        return (
          <div className="space-y-1">
            {apts.map((apt) => (
              <div key={apt.id} className="text-sm">
                <p className="text-slate-700">{apt.towerData?.name ?? `Torre ${apt.tower}`}</p>
                <p className="text-xs text-slate-400">Apt. {apt.number}</p>
              </div>
            ))}
          </div>
        )
      },
    },
    {
      header: 'Contacto',
      cell: (row) => (
        <div className="text-xs">
          {isTempEmail(row.email ?? undefined) ? (
            <p className="flex items-center gap-1 text-amber-600" title="Correo temporal pendiente de reemplazar">
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">{row.email}</span>
            </p>
          ) : (
            <p className="text-slate-600">{row.email ?? '—'}</p>
          )}
          <p className="text-slate-400 mt-0.5">{row.phone ?? '—'}</p>
        </div>
      ),
    },
    {
      header: 'Estado',
      cell: (row) => (
        <StatusBadge
          label={row.isActive ? 'Activo' : 'Inactivo'}
          variant={row.isActive ? 'green' : 'slate'}
        />
      ),
    },
    {
      header: 'Desde',
      cell: (row) => <span className="whitespace-nowrap text-xs text-slate-400">{formatDate(row.createdAt)}</span>,
    },
    {
      header: 'Acciones',
      className: 'text-right',
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {canManage && <EditResidentDialog resident={row} />}
          {canManage && <NotifyResidentDialog resident={row} />}
          {isAdmin && <ManageApartmentsDialog resident={row} />}
          {canManage && <ResetPasswordButton resident={row} />}
          {canManage && (
            <Button
              size="sm"
              variant={row.isActive ? 'secondary' : 'outline'}
              className="h-7 text-xs"
              onClick={() => {
                if (
                  !row.isActive ||
                  confirm(
                    `¿Inhabilitar a ${row.name} ${row.lastName}? No podrá iniciar sesión y saldrá del listado, pero se conserva para auditoría (visible con el filtro "Inactivo").`,
                  )
                ) {
                  toggleActiveMutation.mutate({ id: row.id, isActive: row.isActive })
                }
              }}
              disabled={toggleActiveMutation.isPending}
            >
              {row.isActive ? 'Inhabilitar' : 'Activar'}
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <SectionHeader
        eyebrow={isAdmin ? 'Administración' : 'Operación'}
        title="Residentes"
        description="Directorio de residentes del conjunto."
        action={canManage ? <CreateResidentDialog /> : undefined}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            label="Total"
            value={residentsQuery.data?.meta.total ?? 0}
            detail="Residentes registrados en el sistema."
            icon={<Users className="size-5" />}
          />
          <KpiCard
            label="Activos"
            value={residents.filter((r) => r.isActive).length}
            detail="Residentes con estado activo."
            icon={<UserCheck className="size-5" />}
          />
          <KpiCard
            label="Sin apartamento"
            value={residents.filter((r) => !r.apartmentId).length}
            detail="Sin unidad habitacional asignada."
            icon={<Mail className="size-5" />}
          />
        </div>

        {/* Quick apartment filter */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <Building2 className="size-4 shrink-0 text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Filtro por apartamento:</span>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <FilterableSelect
              open={towerOpen}
              onOpenChange={setTowerOpen}
              value={quickTowerId}
              displayValue={(towersQuery.data ?? []).find((t) => t.id === quickTowerId)?.name ?? ''}
              placeholder="Torre"
              searchPlaceholder="Buscar torre..."
              items={towersQuery.data ?? []}
              getKey={(t) => t.id}
              getLabel={(t) => t.name}
              searchValue={towerSearch}
              onSearchValueChange={setTowerSearch}
              onSelect={(t) => {
                setQuickTowerId(t.id)
                setQuickApartmentId('')
                setTowerOpen(false)
                setAptOpen(true)
              }}
            />
            <FilterableSelect
              open={aptOpen}
              onOpenChange={setAptOpen}
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
              searchValue={aptSearch}
              onSearchValueChange={setAptSearch}
              onSelect={(a) => { setQuickApartmentId(a.id); setAptOpen(false); setPage(1) }}
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

        <DataTable
          data={residents}
          columns={columns}
          searchPlaceholder="Buscar nombre, documento o correo..."
          getSearchText={(row) =>
            [row.name, row.lastName, row.document, row.email, row.phone].filter(Boolean).join(' ')
          }
          filters={filters}
          getFilterValues={(row) => ({
            typeId: row.residentTypeId,
            isActive: String(row.isActive),
            hasApartment: row.apartmentId ? 'yes' : 'no',
            towerId: row.apartment?.towerId ?? '',
          })}
          isLoading={residentsQuery.isLoading}
          emptyMessage="Sin residentes registrados."
          serverSide
          totalItems={residentsQuery.data?.meta.total}
          currentPage={page}
          onPageChange={setPage}
          onSearchChange={(v) => { setSearch(v); setPage(1) }}
          onFiltersChange={(v) => { setTableFilters(v); setPage(1) }}
        />
      </div>
    </div>
  )
}
