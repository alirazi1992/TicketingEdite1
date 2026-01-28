import { apiRequest } from "./api-client"
import type {
  ApiTechnicianResponse,
  ApiTechnicianCreateRequest,
  ApiTechnicianUpdateRequest,
  ApiTechnicianStatusUpdateRequest,
} from "./api-types"

/**
 * Get all technicians (Admin only)
 * Backend route: GET /api/admin/technicians
 */
export async function getAllTechnicians(
  token: string | null,
  includeDeleted = false
): Promise<ApiTechnicianResponse[]> {
  if (!token) {
    throw new Error("Authentication required")
  }
  const query = includeDeleted ? "?includeDeleted=true" : ""
  return apiRequest<ApiTechnicianResponse[]>(`/api/admin/technicians${query}`, {
    method: "GET",
    token,
  })
}

/**
 * Get technician by ID (Admin only)
 * Note: This endpoint may not exist in UsersController - check backend implementation
 */
export async function getTechnicianById(
  token: string | null,
  id: string
): Promise<ApiTechnicianResponse> {
  if (!token) {
    throw new Error("Authentication required")
  }
  // Check if TechniciansController exists with /api/admin/technicians route
  // If not, this will 404 - handle gracefully if needed
  return apiRequest<ApiTechnicianResponse>(`/api/admin/technicians/${id}`, {
    method: "GET",
    token,
  })
}

/**
 * Create a new technician (Admin only)
 */
export async function createTechnician(
  token: string | null,
  technician: ApiTechnicianCreateRequest
): Promise<ApiTechnicianResponse> {
  if (!token) {
    throw new Error("Authentication required")
  }
  return apiRequest<ApiTechnicianResponse>("/api/admin/technicians", {
    method: "POST",
    token,
    body: technician,
  })
}

/**
 * Update technician (Admin only)
 */
export async function updateTechnician(
  token: string | null,
  id: string,
  technician: ApiTechnicianUpdateRequest
): Promise<ApiTechnicianResponse> {
  if (!token) {
    throw new Error("Authentication required")
  }
  return apiRequest<ApiTechnicianResponse>(`/api/admin/technicians/${id}`, {
    method: "PUT",
    token,
    body: technician,
  })
}

/**
 * Update technician status (active/inactive) (Admin only)
 */
export async function updateTechnicianStatus(
  token: string | null,
  id: string,
  isActive: boolean
): Promise<void> {
  if (!token) {
    throw new Error("Authentication required")
  }
  
  const requestBody = { isActive }
  console.log("[technicians-api] Updating technician status:", { id, isActive, requestBody })
  
  try {
    await apiRequest(`/api/admin/technicians/${id}/status`, {
      method: "PATCH",
      token,
      body: requestBody,
    })
    console.log("[technicians-api] Technician status updated successfully")
  } catch (error: any) {
    console.error("[technicians-api] Failed to update technician status:", {
      id,
      isActive,
      status: error?.status,
      message: error?.message,
      body: error?.body,
    })
    throw error
  }
}

/**
 * Assign technician to ticket (Admin only)
 */
export async function assignTechnicianToTicket(
  token: string | null,
  ticketId: string,
  technicianId: string
): Promise<any> {
  if (!token) {
    throw new Error("Authentication required")
  }
  return apiRequest(`/api/tickets/${ticketId}/assign-technician`, {
    method: "PUT",
    token,
    body: { technicianId },
  })
}

/**
 * Soft delete a technician (Admin only)
 */
export async function deleteTechnician(
  token: string | null,
  id: string
): Promise<{ technicianId: string; isDeleted: boolean; alreadyDeleted: boolean }> {
  if (!token) {
    throw new Error("Authentication required")
  }
  return apiRequest(`/api/admin/technicians/${id}`, {
    method: "DELETE",
    token,
  })
}
