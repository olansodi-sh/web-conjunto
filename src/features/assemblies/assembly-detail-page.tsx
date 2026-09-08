import { useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Clock3,
  Play,
  Square,
  CheckSquare,
  ChevronRight,
  ExternalLink,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { SectionHeader } from '@/components/layout/section-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth-context'
import {
  useAssembly,
  useStartAssembly,
  useFinishAssembly,
  useOpenQuestion,
  useCloseQuestion,
} from './hooks/use-assemblies'
import { useAssemblySocket } from './hooks/use-assembly-socket'
import { AssemblyLivePanel } from './assembly-live-panel'
import type { AssemblyQuestion } from './types'
import { todayKey } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activa',
  finished: 'Finalizada',
  pending: 'Pendiente',
  closed: 'Cerrada',
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  active: 'bg-green-50 text-green-700 border-green-200',
  finished: 'bg-gray-100 text-gray-500 border-gray-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
}

export function AssemblyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()
  const qc = useQueryClient()
  const { data: assembly, isLoading } = useAssembly(id!)

  const handleReconnect = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['assemblies', id] })
  }, [qc, id])

  const wsState = useAssemblySocket(
    assembly?.status === 'active' ? id : undefined,
    assembly?.status === 'active' ? token : null,
    handleReconnect,
  )

  const startAssembly = useStartAssembly()
  const finishAssembly = useFinishAssembly()
  const openQuestion = useOpenQuestion()
  const closeQuestion = useCloseQuestion()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!assembly) return null

  const today = todayKey()
  const canStart = assembly.scheduledDate <= today && assembly.status === 'draft'
  const webBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:5173'
  const publicUrl = `${webBase}/public/assembly/${assembly.publicId}`

  const activeQuestion =
    wsState.currentQuestion ?? assembly.questions.find((q) => q.status === 'active') ?? null
  const questionCount = assembly.questions.length
  const closedQuestions = assembly.questions.filter((q) => q.status === 'closed').length
  const pendingQuestions = assembly.questions.filter((q) => q.status === 'pending').length
  const statusDetail =
    assembly.status === 'draft'
      ? canStart
        ? 'Lista para iniciar desde el panel.'
        : `Programada para ${assembly.scheduledDate}.`
      : assembly.status === 'active'
        ? 'Votación en curso y sincronizada en tiempo real.'
        : 'Sesión cerrada y lista para auditoría.'
  const liveBadgeMeta =
    wsState.connectionState === 'connected'
      ? {
          label: 'En vivo',
          detail: 'El tablero está recibiendo eventos en tiempo real.',
          className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          icon: <Wifi className="h-3.5 w-3.5" />,
        }
      : wsState.connectionState === 'offline'
        ? {
            label: 'Sin red',
            detail: 'El navegador está offline. El canal retomará cuando vuelva la conexión.',
            className: 'border-rose-200 bg-rose-50 text-rose-700',
            icon: <WifiOff className="h-3.5 w-3.5" />,
          }
        : {
            label: 'Reconectando',
            detail: 'Hay red disponible, pero el socket está reconectando el canal.',
            className: 'border-amber-200 bg-amber-50 text-amber-700',
            icon: <WifiOff className="h-3.5 w-3.5" />,
          }
  const channelValue =
    assembly.status === 'active'
      ? liveBadgeMeta.label
      : assembly.status === 'finished'
        ? 'Cerrado'
        : 'Preparado'
  const channelDetail =
    assembly.status === 'active'
      ? liveBadgeMeta.detail
      : assembly.status === 'finished'
        ? 'La URL pública queda disponible para verificación.'
        : 'Se activará cuando inicies la asamblea.'

  const handleStart = async () => {
    try {
      await startAssembly.mutateAsync(assembly.id)
      toast.success('Asamblea iniciada')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error al iniciar'
      toast.error(message)
    }
  }

  const handleFinish = async () => {
    try {
      await finishAssembly.mutateAsync(assembly.id)
      toast.success('Asamblea finalizada')
    } catch {
      toast.error('Error al finalizar')
    }
  }

  const handleOpen = async (q: AssemblyQuestion) => {
    try {
      await openQuestion.mutateAsync({ assemblyId: assembly.id, questionId: q.id })
      toast.success('Pregunta abierta')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error'
      toast.error(message)
    }
  }

  const handleClose = async (q: AssemblyQuestion) => {
    try {
      await closeQuestion.mutateAsync({ assemblyId: assembly.id, questionId: q.id })
      toast.success('Pregunta cerrada')
    } catch {
      toast.error('Error al cerrar')
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Asamblea"
        title={assembly.title}
        description={assembly.description ?? 'Sin descripción'}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/assemblies">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>

            {assembly.status === 'draft' && (
              <Button
                size="sm"
                disabled={!canStart || startAssembly.isPending}
                onClick={handleStart}
                title={
                  !canStart
                    ? `La asamblea está programada para ${assembly.scheduledDate}. Reprogramar para iniciarla hoy.`
                    : undefined
                }
              >
                <Play className="mr-2 h-4 w-4" />
                Iniciar asamblea
              </Button>
            )}

            {assembly.status === 'active' && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    URL pública
                  </a>
                </Button>
                <Button variant="destructive" size="sm" onClick={handleFinish} disabled={finishAssembly.isPending}>
                  <Square className="mr-2 h-4 w-4" />
                  Finalizar
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 px-4 sm:px-6 xl:grid-cols-4">
        <KpiCard
          label="Estado"
          value={STATUS_LABELS[assembly.status]}
          detail={statusDetail}
          icon={assembly.status === 'active' ? <Wifi className="size-4" /> : <Clock3 className="size-4" />}
        />
        <KpiCard
          label="Programada"
          value={assembly.scheduledDate}
          detail={assembly.startedAt ? 'La sesión ya fue iniciada.' : 'Fecha oficial de convocatoria.'}
          icon={<CalendarDays className="size-4" />}
        />
        <KpiCard
          label="Preguntas"
          value={questionCount}
          detail={`${closedQuestions} cerradas · ${activeQuestion ? '1 activa' : `${pendingQuestions} pendientes`}`}
          icon={<ClipboardList className="size-4" />}
        />
        <KpiCard
          label="Canal"
          value={channelValue}
          detail={channelDetail}
          icon={
            assembly.status === 'active'
              ? wsState.connected
                ? <Wifi className="size-4" />
                : <WifiOff className="size-4" />
              : <ExternalLink className="size-4" />
          }
        />
      </div>

      <div className="grid gap-4 px-4 pb-6 sm:px-6 2xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contexto de la asamblea</CardTitle>
              <CardDescription>
                Resumen operativo y contenido de la sesión con el mismo framing visual del resto del panel.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Descripción</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {assembly.description ?? 'Sin descripción registrada para esta convocatoria.'}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Seguimiento</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Estado actual</span>
                    <Badge className={STATUS_CLASSES[assembly.status]}>{STATUS_LABELS[assembly.status]}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Pregunta activa</span>
                    <span className="font-medium text-slate-900">{activeQuestion ? 'Sí' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Progreso</span>
                    <span className="font-medium text-slate-900">
                      {closedQuestions}/{questionCount} cerradas
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">URL pública</span>
                    <span className="font-medium text-slate-900">{assembly.status === 'draft' ? 'Lista' : 'Disponible'}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preguntas</CardTitle>
              <CardDescription>
                Abre o cierra cada pregunta desde esta secuencia operativa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {assembly.questions
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-start lg:justify-between"
                  >
                    <div className="min-w-0 space-y-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-6 text-slate-900">{q.text}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {q.status === 'pending'
                              ? 'Lista para ser abierta cuando termine la pregunta activa.'
                              : q.status === 'active'
                                ? 'Recibiendo votos en este momento.'
                                : 'Pregunta cerrada y consolidada.'}
                          </p>
                        </div>
                      </div>

                      {q.status !== 'pending' ? (
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">✅ {q.stats.yesCount}</span>
                          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">❌ {q.stats.noCount}</span>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">⬜ {q.stats.blankCount}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                            Pendientes: {q.stats.totalPending}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 self-start">
                      <Badge className={STATUS_CLASSES[q.status]}>{STATUS_LABELS[q.status]}</Badge>

                      {assembly.status === 'active' && q.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpen(q)}
                          disabled={openQuestion.isPending}
                        >
                          <ChevronRight className="mr-1 h-4 w-4" />
                          Abrir
                        </Button>
                      )}

                      {assembly.status === 'active' && q.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleClose(q)}
                          disabled={closeQuestion.isPending}
                        >
                          <CheckSquare className="mr-1 h-4 w-4" />
                          Cerrar
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Centro de control</CardTitle>
              <CardDescription>
                Estado del canal público, conexión del tablero y advertencias operativas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_CLASSES[assembly.status]}>{STATUS_LABELS[assembly.status]}</Badge>
                  {assembly.status === 'active' ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${liveBadgeMeta.className}`}
                    >
                      <>
                        {liveBadgeMeta.icon}
                        {liveBadgeMeta.label}
                      </>
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{statusDetail}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">URL pública</p>
                <p className="mt-2 break-all text-sm leading-6 text-slate-700">{publicUrl}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Abrir vista pública
                    </a>
                  </Button>
                </div>
              </div>

              {!canStart && assembly.status === 'draft' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  La fecha programada es futura. Si quieres iniciarla hoy debes reprogramar la convocatoria antes.
                </div>
              ) : null}
            </CardContent>
          </Card>

          {assembly.status === 'active' ? (
            <AssemblyLivePanel
              question={activeQuestion}
              stats={wsState.stats}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Panel en vivo</CardTitle>
                <CardDescription>
                  Los resultados aparecen aquí cuando la asamblea está activa.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  {assembly.status === 'finished'
                    ? 'La asamblea finalizó. Conserva la URL pública para auditoría y verificación.'
                    : 'Inicia la asamblea para habilitar el seguimiento de la pregunta activa y los votos en tiempo real.'}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
