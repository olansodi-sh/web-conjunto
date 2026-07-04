import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Download,
  ExternalLink,
  GitMerge,
  Loader2,
  Mail,
  RefreshCw,
  User,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { SectionHeader } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import { beginGlobalRequest, endGlobalRequest } from '@/lib/network-loading'
import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { UPLOADS_URL } from '@/lib/constants'
import type {
  ApprovalPreviewResident,
  ApprovalPreviewSubmittedPerson,
  ApprovalPreviewVehicle,
  ApprovedResident,
  RegistrationApprovalPreview,
  RegistrationRequest,
} from '@/types/api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const PREDEFINED_REJECT_REASONS = [
  'Datos mal redactados',
  'Foto del recibo ilegible o no válida',
  'La foto de la persona no es válida: debe ser una selfie del rostro, no una foto de otro objeto',
  'La información no corresponde al apartamento',
  'Falta información obligatoria',
]

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
}

function PhotoPreview({ path }: { path?: string | null }) {
  if (!path) return <span className="text-xs text-muted-foreground italic">Sin foto</span>
  const src = `${UPLOADS_URL}/${path.replace(/\\/g, '/').replace(/^\/+/, '')}`
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
      <ExternalLink className="size-3" /> Ver foto
    </a>
  )
}

function ResidentMiniCard({ resident, title, tone }: { resident: ApprovalPreviewResident; title: string; tone: 'slate' | 'blue' }) {
  const inactive = resident.isActive === false
  return (
    <div className={cn('rounded-lg border p-3 text-xs', tone === 'blue' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50')}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {inactive && <Badge className="bg-slate-200 text-slate-600 border-slate-300">Deshabilitado</Badge>}
      </div>
      <p className={cn('text-sm font-medium', inactive ? 'text-slate-500 line-through' : 'text-slate-900')}>
        {resident.name} {resident.lastName}
      </p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        <p>Cédula: {resident.document}</p>
        {resident.phone && <p>Tel: {resident.phone}</p>}
        {resident.email && <p>Email: {resident.email}</p>}
        {resident.residentType && <p>Tipo: {resident.residentType}</p>}
      </div>
    </div>
  )
}

function VehicleMiniCard({ vehicle }: { vehicle: ApprovalPreviewVehicle }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
      <p className="text-sm font-semibold text-slate-900">{vehicle.plate}</p>
      <p className="mt-0.5 text-muted-foreground">
        {[vehicle.brandName, vehicle.model, vehicle.color, vehicle.vehicleType].filter(Boolean).join(' · ')}
      </p>
    </div>
  )
}

function CurrentApartmentState({ preview }: { preview: RegistrationApprovalPreview }) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ya registrado en este apartamento</p>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Users className="size-3.5" /> Residentes actuales ({preview.currentResidents.length})
        </p>
        {preview.currentResidents.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Ninguno.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {preview.currentResidents.map((r) => (
              <ResidentMiniCard key={r.id} resident={r} title="Residente" tone="slate" />
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vehículos actuales ({preview.currentVehicles.length})</p>
        {preview.currentVehicles.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">Ninguno.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {preview.currentVehicles.map((v) => (
              <VehicleMiniCard key={v.id} vehicle={v} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ApprovalPanel({
  request,
  onBack,
  onApproved,
}: {
  request: RegistrationRequest
  onBack: () => void
  onApproved: (residents: ApprovedResident[]) => void
}) {
  const queryClient = useQueryClient()
  const { data: preview, isLoading } = useQuery({
    queryKey: ['registration-approval-preview', request.id],
    queryFn: () => api.getRegistrationApprovalPreview(request.id),
  })

  const approveMut = useMutation({
    mutationFn: (mode: 'replace' | 'merge') => api.approveRegistrationRequest(request.id, mode),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['registration-requests'] })
      toast.success('Solicitud aprobada')
      onApproved(data.residents)
    },
    onError: () => toast.error('Error al aprobar'),
  })

  if (isLoading || !preview) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ChevronLeft className="size-4" /> Volver al detalle
      </button>

      <div>
        <h3 className="text-base font-semibold text-slate-900">Confirmar aprobación</h3>
        <p className="text-sm text-muted-foreground">{preview.apartmentLabel ?? 'Apartamento'}</p>
      </div>

      <CurrentApartmentState preview={preview} />

      {/* Submitted persons + conflict comparison */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Personas enviadas ({preview.submittedPersons.length})
        </p>
        <div className="space-y-2">
          {preview.submittedPersons.map((p, i) => (
            <SubmittedPersonRow key={i} person={p} />
          ))}
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <p className="flex items-center gap-1.5 font-medium text-slate-900">
          <AlertTriangle className="size-4 text-amber-500" /> ¿Cómo deseas aprobar?
        </p>
        <p>
          <strong>Reemplazar ocupantes:</strong> deshabilita las cuentas de los{' '}
          {preview.currentResidents.length} residente(s) actual(es) (se conservan para auditoría) y deja como
          ocupantes a las personas enviadas.
        </p>
        <p>
          <strong>Mantener actuales:</strong> conserva a los residentes actuales y agrega/actualiza con lo enviado.
        </p>
        <p className="text-xs text-muted-foreground">
          En ambos casos: los vehículos con placa nueva se agregan; las placas ya registradas se omiten.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          disabled={approveMut.isPending}
          onClick={() => approveMut.mutate('replace')}
        >
          {approveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Aprobar y reemplazar ocupantes
        </Button>
        <Button
          variant="outline"
          disabled={approveMut.isPending}
          onClick={() => approveMut.mutate('merge')}
        >
          <GitMerge className="size-4" />
          Aprobar y mantener actuales
        </Button>
      </div>
    </div>
  )
}

function SubmittedPersonRow({ person }: { person: ApprovalPreviewSubmittedPerson }) {
  const existing = person.existingResident
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <User className="size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{person.name} {person.lastName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge className={person.isOwner ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
            {person.isOwner ? 'Propietario' : 'Arrendatario'}
          </Badge>
          {existing ? (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200">Ya existe</Badge>
          ) : (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Nuevo</Badge>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Cédula: {person.document}</span>
        {person.birthDate && <span>Nacimiento: {person.birthDate}</span>}
        {person.phone && <span>Tel: {person.phone}</span>}
        {person.email && <span>Email: {person.email}</span>}
      </div>
      {existing && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <ResidentMiniCard resident={existing} title="Datos actuales" tone="slate" />
          <ResidentMiniCard
            resident={{
              id: 'submitted',
              name: person.name,
              lastName: person.lastName,
              document: person.document,
              phone: person.phone,
              email: person.email,
              birthDate: person.birthDate,
            }}
            title="Datos enviados"
            tone="blue"
          />
        </div>
      )}
    </div>
  )
}

function RejectPanel({
  request,
  onBack,
  onRejected,
}: {
  request: RegistrationRequest
  onBack: () => void
  onRejected: () => void
}) {
  const queryClient = useQueryClient()
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [detail, setDetail] = useState('')

  const builtReason = [
    ...selectedReasons,
    ...(detail.trim() ? [detail.trim()] : []),
  ].join('. ')

  const rejectMut = useMutation({
    mutationFn: () => api.rejectRegistrationRequest(request.id, builtReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registration-requests'] })
      toast.success('Solicitud rechazada. Se notificó por correo a las personas.')
      onRejected()
    },
    onError: () => toast.error('Error al rechazar'),
  })

  function toggleReason(reason: string) {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    )
  }

  const canReject = builtReason.trim().length > 0

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-slate-900">
        <ChevronLeft className="size-4" /> Volver al detalle
      </button>

      <div>
        <h3 className="text-base font-semibold text-slate-900">Rechazar solicitud</h3>
        <p className="text-sm text-muted-foreground">
          Se enviará un correo a <strong>todas las personas</strong> de la solicitud con el motivo.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivos frecuentes</p>
        <div className="flex flex-wrap gap-2">
          {PREDEFINED_REJECT_REASONS.map((reason) => {
            const active = selectedReasons.includes(reason)
            return (
              <button
                key={reason}
                type="button"
                onClick={() => toggleReason(reason)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition',
                  active
                    ? 'border-rose-300 bg-rose-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                {reason}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Detalle adicional (opcional)</p>
        <Textarea
          placeholder="Explica con más detalle el motivo del rechazo..."
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
        />
      </div>

      {canReject && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p className="text-xs font-semibold uppercase tracking-wide">Motivo que se enviará</p>
          <p className="mt-1">{builtReason}</p>
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Cancelar
        </Button>
        <Button
          className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
          disabled={!canReject || rejectMut.isPending}
          onClick={() => rejectMut.mutate()}
        >
          {rejectMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
          Confirmar rechazo
        </Button>
      </div>
    </div>
  )
}

function ApprovedResult({ residents }: { residents: ApprovedResident[] }) {
  const STATUS_TEXT: Record<ApprovedResident['status'], string> = {
    created: 'Nuevo',
    replaced: 'Datos reemplazados',
    merged: 'Datos mezclados',
  }
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
        <CheckCircle className="size-4" /> Solicitud aprobada
      </p>
      <p className="mb-3 text-xs text-emerald-700">
        A cada residente con correo se le enviaron sus credenciales automáticamente (a los que ya existían se les generó una contraseña nueva). Guarda las contraseñas por si necesitas entregarlas manualmente.
      </p>
      <div className="space-y-1.5">
        {residents.map((r) => (
          <div key={r.document} className="rounded bg-white px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{r.name} ({r.document})</span>
              {r.password ? (
                <span className="font-mono font-semibold tracking-wider text-emerald-700">{r.password}</span>
              ) : (
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{STATUS_TEXT[r.status]}</Badge>
              )}
            </div>
            {r.password && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                <Badge className="bg-slate-100 text-slate-600 border-slate-200">{STATUS_TEXT[r.status]}</Badge>
                {r.email && (
                  <span className={cn('flex items-center gap-1', r.emailSent ? 'text-emerald-600' : 'text-amber-600')}>
                    <Mail className="size-3" />
                    {r.emailSent ? `Enviado a ${r.email}` : 'No se pudo enviar el correo'}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function RequestDetail({ request, onClose }: { request: RegistrationRequest; onClose: () => void }) {
  const [view, setView] = useState<'detail' | 'approve' | 'reject'>('detail')
  const [approvedResidents, setApprovedResidents] = useState<ApprovedResident[] | null>(null)

  const { data: preview } = useQuery({
    queryKey: ['registration-approval-preview', request.id],
    queryFn: () => api.getRegistrationApprovalPreview(request.id),
    enabled: request.status === 'pending',
  })

  const tower = request.tower as any
  const apartment = request.apartment as any
  const location = [tower?.code, tower?.name, apartment?.number].filter(Boolean).join(' · ')

  if (view === 'approve' && !approvedResidents) {
    return (
      <ApprovalPanel
        request={request}
        onBack={() => setView('detail')}
        onApproved={(residents) => {
          setApprovedResidents(residents)
          setView('detail')
        }}
      />
    )
  }

  if (view === 'reject') {
    return (
      <RejectPanel
        request={request}
        onBack={() => setView('detail')}
        onRejected={onClose}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge className={STATUS_CLASSES[request.status]}>{STATUS_LABELS[request.status]}</Badge>
        <span className="text-sm text-muted-foreground">{location}</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatDate(request.submittedAt)}</span>
      </div>

      {request.submittedLat && request.submittedLng && (
        <p className="text-xs text-muted-foreground">
          Coordenadas: {request.submittedLat.toFixed(6)}, {request.submittedLng.toFixed(6)}
        </p>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recibo de administración</p>
        <PhotoPreview path={request.receiptPhotoPath} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Personas ({request.persons.length})
        </p>
        <div className="space-y-3">
          {request.persons.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-slate-50 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <User className="size-4 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{p.name} {p.lastName}</span>
                </div>
                <Badge className={p.isOwner ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
                  {p.isOwner ? 'Propietario' : 'Arrendatario'}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Cédula: {p.document}</span>
                {p.birthDate && <span>Nacimiento: {p.birthDate}</span>}
                {p.phone && <span>Tel: {p.phone}</span>}
                {p.email && <span>Email: {p.email}</span>}
              </div>
              {p.photoPath && (
                <div className="mt-1.5">
                  <PhotoPreview path={p.photoPath} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {request.vehicles.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vehículos ({request.vehicles.length})
          </p>
          <div className="space-y-2">
            {request.vehicles.map((v) => (
              <div key={v.id} className="rounded-lg border border-border bg-slate-50 p-3 text-sm">
                <span className="font-medium">{v.plate}</span>
                <span className="ml-2 text-muted-foreground">{v.brandName} {v.model} · {v.color} · {v.vehicleType}</span>
                {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {request.status === 'pending' && preview && <CurrentApartmentState preview={preview} />}

      {approvedResidents && <ApprovedResult residents={approvedResidents} />}

      {request.status === 'rejected' && request.rejectionReason && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <p className="font-medium">Motivo de rechazo</p>
          <p className="mt-1 text-xs">{request.rejectionReason}</p>
        </div>
      )}

      {request.status === 'pending' && !approvedResidents && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={() => setView('reject')}
          >
            <XCircle className="size-4" />
            Rechazar
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setView('approve')}
          >
            <CheckCircle className="size-4" />
            Aprobar
          </Button>
        </div>
      )}
    </div>
  )
}

export function RegistrationsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['registration-requests', statusFilter],
    queryFn: () => api.getRegistrationRequests(statusFilter ? { status: statusFilter } : undefined),
  })

  const { data: detail } = useQuery({
    queryKey: ['registration-request', selectedId],
    queryFn: () => api.getRegistrationRequest(selectedId!),
    enabled: !!selectedId,
  })

  const columns: ColumnDef<RegistrationRequest>[] = [
    {
      header: 'Apartamento',
      cell: (row) => {
        const tower = row.tower as any
        const apt = row.apartment as any
        return (
          <div>
            <p className="font-medium">{apt?.number ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{tower?.code} {tower?.name}</p>
          </div>
        )
      },
    },
    {
      header: 'Personas',
      cell: (row) => <span className="text-sm">{row.persons.length}</span>,
    },
    {
      header: 'Vehículos',
      cell: (row) => <span className="text-sm">{row.vehicles.length}</span>,
    },
    {
      header: 'Estado',
      cell: (row) => (
        <Badge className={STATUS_CLASSES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
      ),
    },
    {
      header: 'Enviada',
      cell: (row) => <span className="text-sm text-muted-foreground">{formatDate(row.submittedAt)}</span>,
    },
    {
      header: '',
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={() => setSelectedId(row.id)}>
          Ver detalle
        </Button>
      ),
    },
  ]

  const handleDownloadExcel = async () => {
    const requestId = beginGlobalRequest()
    try {
      const approved = await api.getRegistrationRequests({ status: 'approved' })
      if (!approved.length) {
        toast.info('No hay solicitudes aprobadas para descargar')
        return
      }

      const rows = approved.flatMap((req) => {
        const tower = req.tower as { code?: string; name?: string } | null
        const apt = req.apartment as { number?: string } | null
        const towerLabel = tower ? `${tower.code ?? ''} - ${tower.name ?? ''}`.replace(/^ - /, '') : '—'
        const aptNumber = apt?.number ?? '—'

        return req.persons.map((person) => {
          const vehiclesStr = req.vehicles
            .map((v) => {
              const parts = [v.plate, v.brandName, v.model, v.color, v.vehicleType].filter(Boolean)
              return parts.join(' · ')
            })
            .join('; ')

          return {
            Torre: towerLabel,
            Apartamento: aptNumber,
            Nombre: person.name,
            Apellido: person.lastName,
            'Cédula/Pasaporte': person.document,
            Teléfono: person.phone ?? '',
            Email: person.email ?? '',
            Tipo: person.isOwner ? 'Propietario' : 'Arrendatario',
            'Fecha de Nacimiento': person.birthDate ?? '',
            Vehículos: vehiclesStr,
            'Fecha de Solicitud': formatDate(req.submittedAt),
          }
        })
      })

      rows.sort((a, b) => {
        const tc = a.Torre.localeCompare(b.Torre)
        if (tc !== 0) return tc
        const ac = a.Apartamento.localeCompare(b.Apartamento, undefined, { numeric: true })
        if (ac !== 0) return ac
        return `${a.Apellido} ${a.Nombre}`.localeCompare(`${b.Apellido} ${b.Nombre}`)
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Aprobados')

      const colWidths = Object.keys(rows[0] ?? {}).map((key) => ({
        wch: Math.max(
          key.length,
          ...rows.map((r) => String(r[key as keyof typeof r] ?? '').length),
        ),
      }))
      ws['!cols'] = colWidths

      XLSX.writeFile(wb, `solicitudes-aprobadas-${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success('Excel descargado exitosamente')
    } catch {
      toast.error('Error al descargar el Excel')
    } finally {
      endGlobalRequest(requestId)
    }
  }

  const STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'approved', label: 'Aprobados' },
    { value: 'rejected', label: 'Rechazados' },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      <SectionHeader
        eyebrow="Administración"
        title="Solicitudes de Registro"
        description="Revisión de solicitudes enviadas por futuros residentes"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                statusFilter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadExcel}>
          <Download className="size-4" />
          Descargar Excel
        </Button>
      </div>

      <DataTable columns={columns} data={requests} isLoading={isLoading} />

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de solicitud</DialogTitle>
          </DialogHeader>
          {detail ? (
            <RequestDetail request={detail} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
