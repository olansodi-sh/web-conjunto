import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Newspaper, PlusCircle, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { SectionHeader } from '@/components/layout/section-header'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field } from '@/components/forms/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { ImageCaptureControl } from '@/components/ui/image-capture-control'
import { api } from '@/lib/api'
import { formatDate, fromDateTimeLocalValue, toDateTimeLocalValue, toDayKey, todayKey } from '@/lib/utils'
import { toast } from 'sonner'
import type { NewsItem } from '@/types/api'
import { useAuth } from '@/hooks/use-auth-context'

const STATIC_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/api\/v1\/?$/, '')

function newsImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null
  if (imageUrl.startsWith('http')) return imageUrl
  return `${STATIC_BASE}/${imageUrl.replace(/^\//, '')}`
}

const newsSchema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(200, 'Máximo 200 caracteres'),
  content: z.string().min(10, 'Mínimo 10 caracteres'),
  publishedAt: z.string().min(1, 'Selecciona fecha y hora'),
  categoryId: z.string().uuid('Selecciona una categoría'),
})

type FormValues = z.infer<typeof newsSchema>

const categorySchema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres').max(100),
})
type CategoryFormValues = z.infer<typeof categorySchema>

export function NewsPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const newsQuery = useQuery({
    queryKey: ['news', page],
    queryFn: () => api.getNews({ page, limit: 15 }),
    placeholderData: keepPreviousData,
  })
  const categoriesQuery = useQuery({ queryKey: ['news-categories'], queryFn: api.getNewsCategories })

  useEffect(
    () => () => {
      if (imagePreview?.startsWith('blob:')) URL.revokeObjectURL(imagePreview)
    },
    [imagePreview],
  )

  const news = newsQuery.data?.data ?? []
  const categories = categoriesQuery.data ?? []

  const form = useForm<FormValues>({
    resolver: zodResolver(newsSchema),
    defaultValues: {
      title: '',
      content: '',
      publishedAt: toDateTimeLocalValue(),
      categoryId: '',
    },
  })
  const selectedCategoryId = useWatch({ control: form.control, name: 'categoryId' })

  const categoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '' },
  })

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const created = await api.createNews({
        title: values.title,
        content: values.content,
        publishedAt: fromDateTimeLocalValue(values.publishedAt),
        categoryId: values.categoryId,
      })
      if (pendingImage) {
        await api.uploadNewsImage(created.id, pendingImage)
      }
      return created
    },
    onSuccess: () => {
      toast.success('Noticia creada')
      form.reset({ title: '', content: '', publishedAt: toDateTimeLocalValue(), categoryId: '' })
      setPendingImage(null)
      setImagePreview(null)
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['news'] })
    },
    onError: () => toast.error('No fue posible crear la noticia'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNews(id),
    onSuccess: () => {
      toast.success('Noticia eliminada')
      void queryClient.invalidateQueries({ queryKey: ['news'] })
    },
    onError: () => toast.error('No fue posible eliminar la noticia'),
  })

  const createCategoryMutation = useMutation({
    mutationFn: (values: CategoryFormValues) => api.createNewsCategory({ name: values.name }),
    onSuccess: () => {
      toast.success('Categoría creada')
      categoryForm.reset()
      setCategoryOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['news-categories'] })
    },
    onError: () => toast.error('No fue posible crear la categoría'),
  })

  function handleImageChange(files: File[]) {
    const file = files[0]
    if (!file) return
    setPendingImage(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleClose(v: boolean) {
    setOpen(v)
    if (!v) {
      form.reset({ title: '', content: '', publishedAt: toDateTimeLocalValue(), categoryId: '' })
      setPendingImage(null)
      setImagePreview(null)
    }
  }

  const columns: ColumnDef<NewsItem>[] = [
    {
      header: 'Imagen',
      cell: (row) =>
        row.imageUrl ? (
          <img
            src={newsImageUrl(row.imageUrl) ?? ''}
            alt={row.title}
            className="h-10 w-16 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-16 items-center justify-center rounded bg-muted text-muted-foreground">
            <ImagePlus className="size-4" />
          </div>
        ),
      className: 'w-20',
    },
    {
      header: 'Título',
      cell: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      header: 'Categoría',
      cell: (row) => row.category?.name ?? '—',
      className: 'hidden sm:table-cell',
    },
    {
      header: 'Publicado por',
      cell: (row) =>
        row.createdByEmployee
          ? `${row.createdByEmployee.name} ${row.createdByEmployee.lastName}`
          : '—',
      className: 'hidden md:table-cell',
    },
    {
      header: 'Fecha publicación',
      cell: (row) => formatDate(row.publishedAt),
      className: 'hidden lg:table-cell',
    },
    {
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => {
            if (confirm('¿Eliminar esta noticia?')) deleteMutation.mutate(row.id)
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
      className: 'w-10',
    },
  ]

  const thisMonth = news.filter(
    (n) => toDayKey(n.publishedAt).slice(0, 7) === todayKey().slice(0, 7),
  ).length

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow="Administración"
        title="Noticias"
        description="Publicaciones y comunicados para el conjunto"
        action={
          <div className="flex gap-2">
            <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Nueva categoría
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Nueva categoría</DialogTitle>
                  <DialogDescription>Agrega una categoría para clasificar las noticias.</DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={categoryForm.handleSubmit((v) => createCategoryMutation.mutate(v))}
                  className="space-y-4 pt-2"
                >
                  <Field label="Nombre" error={categoryForm.formState.errors.name?.message}>
                    <Input {...categoryForm.register('name')} placeholder="Ej. Mantenimiento" />
                  </Field>
                  <Button type="submit" className="w-full" disabled={createCategoryMutation.isPending}>
                    Crear
                  </Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={open} onOpenChange={handleClose}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 size-4" />
                  Nueva noticia
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nueva noticia</DialogTitle>
                  <DialogDescription>
                    Se publicará con tu usuario:{' '}
                    <span className="font-medium">
                      {user ? `${user.name} ${user.lastName}` : '—'}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={form.handleSubmit((v) => createMutation.mutate(v))}
                  className="space-y-4 pt-2"
                >
                  <Field label="Título" error={form.formState.errors.title?.message}>
                    <Input {...form.register('title')} placeholder="Título de la noticia" />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Categoría" error={form.formState.errors.categoryId?.message}>
                      <Select
                        onValueChange={(v) => form.setValue('categoryId', v, { shouldValidate: true })}
                        value={selectedCategoryId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Fecha y hora" error={form.formState.errors.publishedAt?.message}>
                      <Input
                        {...form.register('publishedAt')}
                        type="datetime-local"
                      />
                    </Field>
                  </div>

                  <Field label="Contenido" error={form.formState.errors.content?.message}>
                    <Textarea
                      {...form.register('content')}
                      placeholder="Escribe el contenido de la noticia..."
                      rows={4}
                    />
                  </Field>

                  <Field label="Imagen (opcional)">
                    {imagePreview ? (
                      <div className="relative">
                        <img
                          src={imagePreview}
                          alt="Vista previa"
                          className="h-36 w-full rounded-md object-cover"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-2 top-2 h-7 px-2 text-xs text-red-500 hover:text-red-600"
                          onClick={() => { setPendingImage(null); setImagePreview(null) }}
                        >
                          Quitar
                        </Button>
                      </div>
                    ) : (
                      <ImageCaptureControl buttonLabel="Seleccionar imagen" onFiles={handleImageChange} />
                    )}
                  </Field>

                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    Publicar
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-3">
          <KpiCard
            label="Total noticias"
            value={newsQuery.data?.meta.total ?? 0}
            detail="Publicaciones registradas en el sistema."
            icon={<Newspaper className="size-5" />}
          />
          <KpiCard
            label="Este mes"
            value={thisMonth}
            detail="Noticias publicadas en el mes actual."
            icon={<Newspaper className="size-5" />}
          />
          <KpiCard
            label="Categorías"
            value={categories.length}
            detail="Categorías disponibles para clasificar."
            icon={<Newspaper className="size-5" />}
          />
        </div>

        <DataTable
          data={news}
          columns={columns}
          searchPlaceholder="Buscar por título o categoría..."
          getSearchText={(row) =>
            [row.title, row.category?.name, row.createdByEmployee?.name, row.createdByEmployee?.lastName]
              .filter(Boolean)
              .join(' ')
          }
          isLoading={newsQuery.isLoading}
          emptyMessage="Sin noticias registradas."
          serverSide
          totalItems={newsQuery.data?.meta.total}
          currentPage={page}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
