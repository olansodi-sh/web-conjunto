import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { StatusBadge } from '@/components/ui/status-badge'
import { api } from '@/lib/api'
import { formatDate, formatTime } from '@/lib/utils'
import { useAuth } from '@/hooks/use-auth-context'
import { toast } from 'sonner'
import type { CommunitySpace, CommunitySpaceSchedule } from '@/types/api'

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type ScheduleDraft = {
  dayOfWeek: number
  isOpen: boolean
  startTime: string
  endTime: string
}

const baseSchema = z.object({
  name: z.string().min(1, 'Requerido').max(100),
  phase: z.string().min(1, 'Requerido').max(50),
  description: z.string().optional(),
})
type FormValues = z.infer<typeof baseSchema>

function buildDefaultSchedules(): ScheduleDraft[] {
  return DAY_LABELS.map((_, idx) => ({
    dayOfWeek: idx,
    isOpen: idx >= 1 && idx <= 5,
    startTime: '08:00',
    endTime: '18:00',
  }))
}

function buildDraftFromEntity(space: CommunitySpace): ScheduleDraft[] {
  const byDay = new Map((space.schedules ?? []).map((s) => [s.dayOfWeek, s]))
  return DAY_LABELS.map((_, dayOfWeek) => {
    const row = byDay.get(dayOfWeek)
    return {
      dayOfWeek,
      isOpen: Boolean(row?.isOpen),
      startTime: row?.startTime?.slice(0, 5) ?? '08:00',
      endTime: row?.endTime?.slice(0, 5) ?? '18:00',
    }
  })
}

function toSchedulePayload(rows: ScheduleDraft[]) {
  return rows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    isOpen: row.isOpen,
    startTime: row.isOpen ? row.startTime : null,
    endTime: row.isOpen ? row.endTime : null,
  }))
}

function formatSchedulesSummary(schedules?: CommunitySpaceSchedule[]) {
  if (!schedules || schedules.length === 0) {
    return 'Sin horario'
  }

  const open = schedules
    .filter((row) => row.isOpen && row.startTime && row.endTime)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)

  if (open.length === 0) {
    return 'Cerrado toda la semana'
  }

  return open
    .map((row) => `${DAY_LABELS[row.dayOfWeek].slice(0, 3)} ${formatTime(row.startTime)}-${formatTime(row.endTime)}`)
    .join(' · ')
}

function ScheduleGrid({ rows, onChange }: { rows: ScheduleDraft[]; onChange: (rows: ScheduleDraft[]) => void }) {
  function patchRow(dayOfWeek: number, patch: Partial<ScheduleDraft>) {
    onChange(rows.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)))
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.dayOfWeek} className="grid grid-cols-[120px_90px_1fr_1fr] gap-2 items-center rounded-md border px-3 py-2">
          <span className="text-sm font-medium">{DAY_LABELS[row.dayOfWeek]}</span>
          <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
            <input
              type="checkbox"
              checked={row.isOpen}
              onChange={(event) => patchRow(row.dayOfWeek, { isOpen: event.target.checked })}
            />
            Abierto
          </label>
          <Input
            type="time"
            value={row.startTime}
            disabled={!row.isOpen}
            onChange={(event) => patchRow(row.dayOfWeek, { startTime: event.target.value })}
          />
          <Input
            type="time"
            value={row.endTime}
            disabled={!row.isOpen}
            onChange={(event) => patchRow(row.dayOfWeek, { endTime: event.target.value })}
          />
        </div>
      ))}
    </div>
  )
}

function CreateSpaceDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(buildDefaultSchedules())
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(baseSchema) })

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.createCommunitySpace({
        ...data,
        schedules: toSchedulePayload(schedules),
      }),
    onSuccess: () => {
      toast.success('Zona creada')
      setOpen(false)
      reset()
      setSchedules(buildDefaultSchedules())
      void queryClient.invalidateQueries({ queryKey: ['community-spaces'] })
    },
    onError: () => toast.error('No fue posible crear la zona'),
  })

  function onOpenChange(value: boolean) {
    setOpen(value)
    if (!value) {
      reset()
      setSchedules(buildDefaultSchedules())
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1.5 size-3.5" />Nueva zona</Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,760px)]">
        <DialogHeader>
          <DialogTitle>Nueva zona común</DialogTitle>
          <DialogDescription>Configura datos generales y horario semanal por día.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={errors.name?.message}>
              <Input {...register('name')} placeholder="Ej: Parque fase de arriba" />
            </Field>
            <Field label="Fase / Ubicación" error={errors.phase?.message}>
              <Input {...register('phase')} placeholder="Ej: Fase de arriba" />
            </Field>
          </div>
          <Field label="Descripción (opcional)">
            <Textarea
              {...register('description')}
              placeholder="Descripción corta para los residentes..."
              rows={3}
              className="resize-none"
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Horario semanal</p>
            <ScheduleGrid rows={schedules} onChange={setSchedules} />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creando...' : 'Crear zona'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditSpaceDialog({ space }: { space: CommunitySpace }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(() => buildDraftFromEntity(space))

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { name: space.name, phase: space.phase, description: space.description ?? '' },
  })

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.updateCommunitySpace(space.id, {
        ...data,
        description: data.description?.trim() || undefined,
        schedules: toSchedulePayload(schedules),
      }),
    onSuccess: () => {
      toast.success('Zona actualizada')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['community-spaces'] })
    },
    onError: () => toast.error('No fue posible actualizar la zona'),
  })

  function onOpenChange(value: boolean) {
    setOpen(value)
    if (value) {
      reset({ name: space.name, phase: space.phase, description: space.description ?? '' })
      setSchedules(buildDraftFromEntity(space))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">
          <Pencil className="mr-1 size-3" /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,760px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar zona: {space.name}</DialogTitle>
          <DialogDescription>Modifica los datos generales y el horario semanal.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" error={errors.name?.message}>
              <Input {...register('name')} placeholder="Ej: Parque fase de arriba" />
            </Field>
            <Field label="Fase / Ubicación" error={errors.phase?.message}>
              <Input {...register('phase')} placeholder="Ej: Fase de arriba" />
            </Field>
          </div>
          <Field label="Descripción (opcional)">
            <Textarea
              {...register('description')}
              placeholder="Descripción corta para los residentes..."
              rows={3}
              className="resize-none"
            />
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">Horario semanal</p>
            <ScheduleGrid rows={schedules} onChange={setSchedules} />
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CommunitySpacesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'administrator'
  const queryClient = useQueryClient()
  const { data: spaces = [], isLoading } = useQuery({
    queryKey: ['community-spaces'],
    queryFn: api.getCommunitySpaces,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCommunitySpace(id),
    onSuccess: () => {
      toast.success('Zona eliminada')
      void queryClient.invalidateQueries({ queryKey: ['community-spaces'] })
    },
    onError: () => toast.error('No fue posible eliminar la zona'),
  })

  const columns = useMemo<ColumnDef<CommunitySpace>[]>(() => [
    {
      header: 'Nombre',
      cell: (row) => (
        <div>
          <p className="font-semibold text-slate-900">{row.name}</p>
          {row.description && <p className="text-xs text-slate-400 mt-0.5 max-w-xs truncate">{row.description}</p>}
        </div>
      ),
    },
    {
      header: 'Fase',
      cell: (row) => <span className="text-slate-600">{row.phase}</span>,
    },
    {
      header: 'Horarios',
      cell: (row) => <span className="text-xs text-slate-600">{formatSchedulesSummary(row.schedules)}</span>,
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
      header: 'Creado',
      cell: (row) => formatDate(row.createdAt),
    },
    ...(isAdmin ? [{
      header: '',
      className: 'text-right',
      cell: (row: CommunitySpace) => (
        <div className="flex justify-end gap-2">
          <EditSpaceDialog space={row} />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
            onClick={() => {
              if (confirm(`¿Eliminar "${row.name}"?`)) deleteMutation.mutate(row.id)
            }}
          >
            Eliminar
          </Button>
        </div>
      ),
    }] : []),
  ], [deleteMutation, isAdmin])

  return (
    <div className="flex flex-col gap-6 p-6">
      <SectionHeader
        eyebrow="Zonas Comunes"
        title="Zonas Comunes"
        description="Espacios de uso libre para todos los residentes del conjunto y su horario por día."
        action={isAdmin ? <CreateSpaceDialog /> : undefined}
      />
      <DataTable
        columns={columns}
        data={spaces}
        isLoading={isLoading}
        getSearchText={(row) => [row.name, row.phase, row.description].filter(Boolean).join(' ')}
        searchPlaceholder="Buscar zona..."
      />
    </div>
  )
}
