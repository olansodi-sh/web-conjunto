import { apiClient } from '@/lib/api-client'
import type { ApiRequestConfig } from '@/lib/api-client'
import type {
  AccessAudit,
  Apartment,
  ApartmentStats,
  AuthResponse,
  CallPorterAvailability,
  CallsIceConfigResponse,
  CatalogOption,
  CommonArea,
  CommunitySpace,
  Employee,
  Fine,
  FineType,
  NewsCategory,
  NewsItem,
  NotificationItem,
  PackageItem,
  PackagePhoto,
  PaginatedResponse,
  PlateLocationResult,
  PlateSearchResult,
  PoolEntry,
  PoolResidentSearchResult,
  PoolSummary,
  Reservation,
  Resident,
  ResidentStats,
  ResidentApartment,
  ResidentVehicle,
  RegistrationLink,
  RegistrationRequest,
  RegistrationApprovalPreview,
  ApprovedResident,
  SessionUser,
  Tower,
  VehicleBrand,
  Visitor,
  VisitorSearchResult,
} from '@/types/api'

async function unwrap<T>(promise: Promise<{ data: T }>) {
  const { data } = await promise
  return data
}

export const api = {
  loginResident: (payload: { identifier: string; password: string }) =>
    unwrap<AuthResponse>(apiClient.post('/auth/login/resident', payload)),
  loginEmployee: (payload: { username: string; password: string }) =>
    unwrap<AuthResponse>(apiClient.post('/auth/login/employee', payload)),
  getSession: (config?: ApiRequestConfig) => unwrap<SessionUser>(apiClient.get('/auth/me', config)),

  getResidents: (params?: { apartmentId?: string; page?: number; limit?: number; search?: string; typeId?: string; isActive?: string; hasApartment?: string; towerId?: string }) =>
    unwrap<PaginatedResponse<Resident>>(apiClient.get('/residents', { params })),
  getResidentsStats: () =>
    unwrap<ResidentStats>(apiClient.get('/residents/stats')),
  createResident: (payload: Record<string, unknown>) =>
    unwrap<Resident>(apiClient.post('/residents', payload)),
  updateResident: (id: string, payload: Record<string, unknown>) =>
    unwrap<Resident>(apiClient.patch(`/residents/${id}`, payload)),
  deleteResident: (id: string) =>
    unwrap<void>(apiClient.delete(`/residents/${id}`)),
  activateResident: (id: string) =>
    unwrap<Resident>(apiClient.patch(`/residents/${id}/activate`)),
  deactivateResident: (id: string) =>
    unwrap<Resident>(apiClient.patch(`/residents/${id}/deactivate`)),
  assignResidentApartment: (id: string, apartmentId: string) =>
    unwrap<Resident>(apiClient.patch(`/residents/${id}/assign-apartment`, { apartmentId })),
  unassignResidentApartment: (id: string) =>
    unwrap<Resident>(apiClient.patch(`/residents/${id}/unassign-apartment`)),

  // ─── Password reset (admin-initiated, public confirmation) ─────────────────
  requestResidentPasswordReset: (residentId: string) =>
    unwrap<{ emailSent: boolean }>(apiClient.post('/password-resets/request', { residentId })),
  validatePasswordResetToken: (token: string) =>
    unwrap<{ valid: boolean; name?: string }>(
      apiClient.get('/password-resets/validate', { params: { token }, skipGlobalLoader: true } as ApiRequestConfig),
    ),
  confirmPasswordReset: (token: string, password: string) =>
    unwrap<{ success: boolean }>(apiClient.post('/password-resets/confirm', { token, password })),

  getEmployees: (params?: { page?: number; limit?: number; search?: string; roleId?: string; isActive?: string }) =>
    unwrap<PaginatedResponse<Employee>>(apiClient.get('/employees', { params })),
  createEmployee: (payload: Record<string, unknown>) =>
    unwrap<Employee>(apiClient.post('/employees', payload)),
  updateEmployee: (id: string, payload: Record<string, unknown>) =>
    unwrap<Employee>(apiClient.patch(`/employees/${id}`, payload)),
  activateEmployee: (id: string) =>
    unwrap<Employee>(apiClient.patch(`/employees/${id}/activate`)),
  deactivateEmployee: (id: string) =>
    unwrap<Employee>(apiClient.patch(`/employees/${id}/deactivate`)),

  getTowers: () => unwrap<Tower[]>(apiClient.get('/towers')),
  createTower: (payload: Record<string, unknown>) =>
    unwrap<Tower>(apiClient.post('/towers', payload)),
  getApartments: (params?: { towerId?: string; page?: number; limit?: number; search?: string; occupancy?: string }) =>
    unwrap<PaginatedResponse<Apartment>>(apiClient.get('/apartments', { params })),
  getApartmentsStats: () =>
    unwrap<ApartmentStats>(apiClient.get('/apartments/stats')),
  createApartment: (payload: Record<string, unknown>) =>
    unwrap<Apartment>(apiClient.post('/apartments', payload)),

  getReservations: (params?: { page?: number; limit?: number; search?: string; status?: string; reservationDate?: string }) =>
    unwrap<PaginatedResponse<Reservation>>(apiClient.get('/reservations', { params })),
  getMyReservations: () => unwrap<Reservation[]>(apiClient.get('/reservations/my')),
  createReservation: (payload: Record<string, unknown>) =>
    unwrap<Reservation>(apiClient.post('/reservations', payload)),
  updateReservationStatus: (id: string, payload: Record<string, unknown>) =>
    unwrap<Reservation>(apiClient.patch(`/reservations/${id}/status`, payload)),

  getNotifications: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<NotificationItem>>(apiClient.get('/notifications/my', { params })),
  getAllNotifications: (params?: { page?: number; limit?: number; search?: string; isRead?: string; typeId?: string; createdAt?: string }) =>
    unwrap<PaginatedResponse<NotificationItem>>(apiClient.get('/notifications', { params })),
  markNotificationRead: (id: string) =>
    unwrap<NotificationItem>(apiClient.patch(`/notifications/${id}/read`)),
  createNotification: (payload: Record<string, unknown>) =>
    unwrap<NotificationItem>(apiClient.post('/notifications', payload)),

  getMyPackages: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<PackageItem>>(apiClient.get('/packages/my', { params })),
  getPackages: (params?: { page?: number; limit?: number; search?: string; delivered?: string; arrivalTime?: string; towerId?: string; apartmentId?: string }) =>
    unwrap<PaginatedResponse<PackageItem>>(apiClient.get('/packages', { params })),
  createPackage: (payload: Record<string, unknown>, photos?: File[]) => {
    if (!photos?.length) {
      return unwrap<PackageItem>(apiClient.post('/packages', payload))
    }

    const form = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, String(value))
      }
    })
    photos.forEach((file) => form.append('photos', file))

    return unwrap<PackageItem>(
      apiClient.post('/packages', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
  },
  markPackageDelivered: (id: string, payload: Record<string, unknown>, deliveryPhoto: File) => {
    const form = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, String(value))
      }
    })
    form.append('deliveryPhoto', deliveryPhoto)

    return unwrap<PackageItem>(
      apiClient.patch(`/packages/${id}/deliver`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
  },
  getPackagePhotos: (id: string) =>
    unwrap<PackagePhoto[]>(apiClient.get(`/packages/${id}/photos`)),
  uploadPackagePhoto: (id: string, file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return unwrap<PackagePhoto>(
      apiClient.post(`/packages/${id}/photos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
  },

  getVisitors: (params?: { page?: number; limit?: number; search?: string }) =>
    unwrap<PaginatedResponse<Visitor>>(apiClient.get('/visitors', { params })),
  getVisitorsAll: () => unwrap<Visitor[]>(apiClient.get('/visitors', { params: { all: 'true' } })),
  searchVisitorByDocument: (document: string) =>
    unwrap<VisitorSearchResult>(apiClient.get('/visitors/search', { params: { document } })),
  createVisitor: (payload: Record<string, unknown>) =>
    unwrap<Visitor>(apiClient.post('/visitors', payload)),
  updateVisitor: (id: string, payload: Record<string, unknown>) =>
    unwrap<Visitor>(apiClient.patch(`/visitors/${id}`, payload)),
  uploadVisitorPhoto: (id: string, file: File) => {
    const form = new FormData()
    form.append('photo', file)
    return unwrap<Visitor>(apiClient.patch(`/visitors/${id}/photo`, form, { headers: { 'Content-Type': 'multipart/form-data' } }))
  },

  getVehicleBrands: () => unwrap<VehicleBrand[]>(apiClient.get('/vehicle-brands')),
  createVehicleBrand: (payload: { name: string }) =>
    unwrap<VehicleBrand>(apiClient.post('/vehicle-brands', payload)),

  getResidentVehicles: (params?: { page?: number; limit?: number; search?: string; apartmentId?: string }) =>
    unwrap<PaginatedResponse<ResidentVehicle>>(apiClient.get('/resident-vehicles', { params })),
  getResidentVehiclesByApartment: (apartmentId: string) =>
    unwrap<ResidentVehicle[]>(apiClient.get(`/resident-vehicles/by-apartment/${apartmentId}`)),
  getResidentVehicleByPlate: (plate: string) =>
    unwrap<ResidentVehicle | null>(apiClient.get(`/resident-vehicles/by-plate/${encodeURIComponent(plate)}`)),
  createResidentVehicle: (payload: Record<string, unknown>) =>
    unwrap<ResidentVehicle>(apiClient.post('/resident-vehicles', payload)),
  updateResidentVehicle: (id: string, payload: Record<string, unknown>) =>
    unwrap<ResidentVehicle>(apiClient.patch(`/resident-vehicles/${id}`, payload)),
  deleteResidentVehicle: (id: string) =>
    unwrap<void>(apiClient.delete(`/resident-vehicles/${id}`)),

  getAccessAudit: (params?: { page?: number; limit?: number; search?: string; type?: string; entryType?: string; visitorCategory?: string; entryTime?: string; dateFrom?: string; dateTo?: string; towerId?: string; apartmentId?: string }) =>
    unwrap<PaginatedResponse<AccessAudit>>(apiClient.get('/access-audit', { params })),
  searchAccessByPlate: (plate: string) =>
    unwrap<PlateSearchResult>(apiClient.get('/access-audit/search-plate', { params: { plate } })),
  locatePlate: (plate: string) =>
    unwrap<PlateLocationResult>(apiClient.get('/access-audit/locate-plate', { params: { plate } })),
  searchOpenAccessByDocument: (document: string) =>
    unwrap<{ visitor: Visitor | null; openAccess: AccessAudit | null }>(
      apiClient.get('/access-audit/search-open-by-document', { params: { document } }),
    ),
  getAccessAuditStats: () =>
    unwrap<{ total: number; today: number; uniqueVisitorsToday: number }>(apiClient.get('/access-audit/stats')),
  getFrequentVisitors: (apartmentId: string, limit = 5) =>
    unwrap<Array<{ visitorId: string; visitor: import('@/types/api').Visitor; vehiclePlate: string | null; entryType: string; visits: number; lastSeen: string }>>(
      apiClient.get('/access-audit/frequent-visitors', { params: { apartmentId, limit } }),
    ),
  getVisitorPlates: (visitorId: string) =>
    unwrap<Array<{ vehiclePlate: string; times: number; firstSeen: string; lastAccessId: string }>>(
      apiClient.get(`/access-audit/visitor/${visitorId}/plates`),
    ),
  updateAccessPlate: (accessId: string, vehiclePlate: string) =>
    unwrap<AccessAudit>(apiClient.patch(`/access-audit/${accessId}/plate`, { vehiclePlate })),
  createAccessAudit: (payload: Record<string, unknown>, photo?: File) => {
    const form = new FormData()
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        form.append(key, String(value))
      }
    })
    if (photo) {
      form.append('photo', photo)
    }

    return unwrap<AccessAudit>(
      apiClient.post('/access-audit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
  },
  registerExit: (id: string) =>
    unwrap<AccessAudit>(apiClient.patch(`/access-audit/${id}/exit`)),

  getFineTypes: () => unwrap<FineType[]>(apiClient.get('/fine-types')),
  createFineType: (payload: { name: string; value: number }) =>
    unwrap<FineType>(apiClient.post('/fine-types', payload)),
  updateFineTypeValue: (id: string, payload: { value: number }) =>
    unwrap<FineType>(apiClient.patch(`/fine-types/${id}/value`, payload)),

  getFines: (params?: {
    search?: string
    towerId?: string
    apartmentId?: string
    residentId?: string
    fineTypeId?: string
    createdByEmployeeId?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    limit?: number
  }) => unwrap<PaginatedResponse<Fine>>(apiClient.get('/fines', { params })),
  createFine: (payload: { apartmentId: string; residentId?: string; fineTypeId: string; amount?: number; notes?: string }) =>
    unwrap<Fine>(apiClient.post('/fines', payload)),
  downloadFinesReportPdf: async (params?: {
    towerId?: string
    apartmentId?: string
    residentId?: string
    fineTypeId?: string
    createdByEmployeeId?: string
    dateFrom?: string
    dateTo?: string
  }) => {
    const { data } = await apiClient.get<Blob>('/fines/reports/pdf', {
      params,
      responseType: 'blob',
    })

    return data
  },

  getPoolEntries: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<PoolEntry>>(apiClient.get('/pool-entries', { params })),
  createPoolEntry: (payload: Record<string, unknown>) =>
    unwrap<PoolEntry>(apiClient.post('/pool-entries', payload)),
  searchPoolResidents: (apartmentId: string) =>
    unwrap<PoolResidentSearchResult>(
      apiClient.get('/pool-entries/resident-search', { params: { apartmentId } }),
    ),
  getPoolSummary: (dateFrom?: string, dateTo?: string) =>
    unwrap<PoolSummary>(
      apiClient.get('/pool-entries/reports/summary', { params: { dateFrom, dateTo } }),
    ),
  downloadPoolReportPdf: async (dateFrom?: string, dateTo?: string) => {
    const { data } = await apiClient.get<Blob>('/pool-entries/reports/pdf', {
      params: { dateFrom, dateTo },
      responseType: 'blob',
    })

    return data
  },

  getResidentTypes: () => unwrap<CatalogOption[]>(apiClient.get('/resident-types')),
  getEmployeeRoles: () => unwrap<CatalogOption[]>(apiClient.get('/employee-roles')),
  getApartmentStatuses: () => unwrap<CatalogOption[]>(apiClient.get('/apartment-statuses')), // unused, kept for reference
  getCommonAreas: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<CommonArea>>(apiClient.get('/common-areas', { params })),
  createCommonArea: (payload: Record<string, unknown>) => unwrap<CommonArea>(apiClient.post('/common-areas', payload)),
  updateCommonArea: (id: string, payload: Record<string, unknown>) => unwrap<CommonArea>(apiClient.patch(`/common-areas/${id}`, payload)),
  deleteCommonArea: (id: string) => unwrap<void>(apiClient.delete(`/common-areas/${id}`)),
  getReservationStatuses: () => unwrap<CatalogOption[]>(apiClient.get('/reservation-statuses')),
  getNotificationTypes: () => unwrap<CatalogOption[]>(apiClient.get('/notification-types')),

  getNewsCategories: () => unwrap<NewsCategory[]>(apiClient.get('/news-categories')),
  createNewsCategory: (payload: Record<string, unknown>) =>
    unwrap<NewsCategory>(apiClient.post('/news-categories', payload)),

  getNews: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<NewsItem>>(apiClient.get('/news', { params })),
  createNews: (payload: Record<string, unknown>) =>
    unwrap<NewsItem>(apiClient.post('/news', payload)),
  updateNews: (id: string, payload: Record<string, unknown>) =>
    unwrap<NewsItem>(apiClient.patch(`/news/${id}`, payload)),
  deleteNews: (id: string) => apiClient.delete(`/news/${id}`),
  uploadNewsImage: (id: string, file: File) => {
    const form = new FormData()
    form.append('image', file)
    return unwrap<NewsItem>(
      apiClient.post(`/news/${id}/upload-image`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    )
  },

  getResidentApartments: (residentId: string) =>
    unwrap<ResidentApartment[]>(apiClient.get(`/resident-apartments/by-resident/${residentId}`)),
  addResidentApartment: (residentId: string, apartmentId: string) =>
    unwrap<ResidentApartment>(apiClient.post('/resident-apartments', { residentId, apartmentId })),
  removeResidentApartment: (id: string) => apiClient.delete(`/resident-apartments/${id}`),

  getCommunitySpaces: () => unwrap<CommunitySpace[]>(apiClient.get('/community-spaces')),
  createCommunitySpace: (payload: Record<string, unknown>) => unwrap<CommunitySpace>(apiClient.post('/community-spaces', payload)),
  updateCommunitySpace: (id: string, payload: Record<string, unknown>) => unwrap<CommunitySpace>(apiClient.patch(`/community-spaces/${id}`, payload)),
  deleteCommunitySpace: (id: string) => unwrap<void>(apiClient.delete(`/community-spaces/${id}`)),
  getCallPorters: () => unwrap<CallPorterAvailability[]>(apiClient.get('/calls/porters')),
  getCallHistory: (params?: { page?: number; limit?: number; search?: string; status?: string; direction?: string; createdAt?: string }) =>
    unwrap<PaginatedResponse<import('@/features/calls/types').CallSessionPayload>>(apiClient.get('/calls/history', { params })),
  getCallsIceConfig: () => unwrap<CallsIceConfigResponse>(apiClient.get('/calls/ice-config')),
  createCallTrace: (payload: {
    callId: string
    source: 'web' | 'mobile' | 'api'
    stage: string
    message: string
    level?: 'info' | 'warn' | 'error'
    metadata?: Record<string, unknown> | null
  }) => unwrap<{ ok: boolean }>(apiClient.post('/calls/trace', payload)),

  getAssemblies: (params?: { page?: number; limit?: number }) =>
    unwrap<PaginatedResponse<import('@/features/assemblies/types').AssemblyItem>>(apiClient.get('/assemblies', { params })),
  createAssembly: (payload: Record<string, unknown>) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.post('/assemblies', payload)),
  getAssembly: (id: string) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.get(`/assemblies/${id}`)),
  startAssembly: (id: string) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.post(`/assemblies/${id}/start`)),
  finishAssembly: (id: string) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.post(`/assemblies/${id}/finish`)),
  openQuestion: (assemblyId: string, questionId: string) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.post(`/assemblies/${assemblyId}/questions/${questionId}/open`)),
  closeQuestion: (assemblyId: string, questionId: string) =>
    unwrap<import('@/features/assemblies/types').AssemblyItem>(apiClient.post(`/assemblies/${assemblyId}/questions/${questionId}/close`)),
  getPublicAssemblyStats: (publicId: string) =>
    unwrap<import('@/features/assemblies/types').PublicStats>(apiClient.get(`/assemblies/public/${publicId}`)),
  verifyAssemblyToken: (publicId: string, token: string) =>
    unwrap<{ questionText: string; vote: string; isValid: boolean; rejectedReason: string | null }[]>(
      apiClient.get(`/assemblies/public/${publicId}/verify`, { params: { token } }),
    ),

  // Registration links & requests
  getRegistrationLinks: () =>
    unwrap<RegistrationLink[]>(apiClient.get('/resident-registrations/links')),
  createRegistrationLink: (payload: { label: string; geofenceLat: number; geofenceLng: number; geofenceRadiusM: number }) =>
    unwrap<RegistrationLink>(apiClient.post('/resident-registrations/links', payload)),
  toggleRegistrationLink: (id: string) =>
    unwrap<RegistrationLink>(apiClient.patch(`/resident-registrations/links/${id}/toggle`)),
  deleteRegistrationLink: (id: string) =>
    unwrap<void>(apiClient.delete(`/resident-registrations/links/${id}`)),
  getRegistrationRequests: (params?: { status?: string; linkId?: string; apartmentId?: string }) =>
    unwrap<RegistrationRequest[]>(apiClient.get('/resident-registrations/requests', { params })),
  getRegistrationRequest: (id: string) =>
    unwrap<RegistrationRequest>(apiClient.get(`/resident-registrations/requests/${id}`)),
  getRegistrationApprovalPreview: (id: string) =>
    unwrap<RegistrationApprovalPreview>(
      apiClient.get(`/resident-registrations/requests/${id}/approval-preview`),
    ),
  approveRegistrationRequest: (id: string, mode: 'replace' | 'merge' = 'merge') =>
    unwrap<{ residents: ApprovedResident[] }>(
      apiClient.post(`/resident-registrations/requests/${id}/approve`, { mode }),
    ),
  rejectRegistrationRequest: (id: string, rejectionReason: string) =>
    unwrap<RegistrationRequest>(apiClient.post(`/resident-registrations/requests/${id}/reject`, { rejectionReason })),
  getPublicRegistrationLink: (publicId: string) =>
    unwrap<{ label: string; geofenceLat: number; geofenceLng: number; geofenceRadiusM: number; towers: Tower[]; apartments: Apartment[]; residentTypes: CatalogOption[]; vehicleBrands: VehicleBrand[] }>(
      apiClient.get(`/resident-registrations/public/${publicId}`),
    ),
  submitRegistration: (publicId: string, formData: FormData) =>
    unwrap<RegistrationRequest>(
      apiClient.post(`/resident-registrations/public/${publicId}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    ),
}
