import type {
  ApiTicketActivityDto,
  ApiTicketMessageDto,
  ApiTicketPriority,
  ApiTicketResponse,
  ApiTicketStatus,
} from "@/lib/api-types"
import type { CategoriesData } from "@/services/categories-types"
import type { Ticket, TicketPriority, TicketResponse } from "@/types"
import type { TicketStatus } from "@/lib/ticket-status"

// Direct mapping: API statuses now match frontend status type exactly
// Backend sends: "Submitted" | "SeenRead" | "Open" | "InProgress" | "AnsweredSolved" | "Redo"
// Frontend uses the same enum keys internally and displays Persian labels via ticket-status.ts
const statusFromApi: Record<ApiTicketStatus, TicketStatus> = {
  Submitted: "Submitted",
  SeenRead: "SeenRead",
  Open: "Open",
  InProgress: "InProgress",
  AnsweredSolved: "AnsweredSolved",
  Redo: "Redo",
}

const statusToApi: Record<TicketStatus, ApiTicketStatus> = {
  Submitted: "Submitted",
  SeenRead: "SeenRead",
  Open: "Open",
  InProgress: "InProgress",
  AnsweredSolved: "AnsweredSolved",
  Redo: "Redo",
}

const priorityFromApi: Record<ApiTicketPriority, TicketPriority> = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "urgent",
}

const priorityToApi: Record<TicketPriority, ApiTicketPriority> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Critical",
}

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "category"

export const mapApiStatusToUi = (status: ApiTicketStatus): TicketStatus => statusFromApi[status] ?? "Submitted"

export const mapUiStatusToApi = (status: TicketStatus): ApiTicketStatus => statusToApi[status] ?? "Submitted"

export const mapApiPriorityToUi = (priority: ApiTicketPriority): TicketPriority => priorityFromApi[priority] ?? "medium"

export const mapUiPriorityToApi = (priority: TicketPriority): ApiTicketPriority => priorityToApi[priority] ?? "Medium"

export const mapApiMessageToResponse = (message: ApiTicketMessageDto): TicketResponse => ({
  id: message.id,
  authorName: message.authorName,
  authorEmail: message.authorEmail,
  status: message.status ? mapApiStatusToUi(message.status) : "Submitted",
  message: message.message,
  timestamp: message.createdAt,
})

export const mapApiTicketToUi = (
  ticket: ApiTicketResponse,
  categories: CategoriesData,
  responses: TicketResponse[] = [],
): Ticket => {
  const categoryEntry = Object.entries(categories).find(([, cat]) => cat.backendId === ticket.categoryId)
  const categorySlug = categoryEntry?.[0] ?? slugify(ticket.categoryName)
  const subcategoryEntry = categoryEntry?.[1].subIssues
    ? Object.entries(categoryEntry[1].subIssues).find(([, sub]) => sub.backendId === ticket.subcategoryId)
    : undefined
  const subcategorySlug = subcategoryEntry?.[0] ?? (ticket.subcategoryName ? slugify(ticket.subcategoryName) : null)

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: mapApiStatusToUi(ticket.displayStatus ?? ticket.status),
    canonicalStatus: ticket.canonicalStatus ? mapApiStatusToUi(ticket.canonicalStatus) : mapApiStatusToUi(ticket.status),
    priority: mapApiPriorityToUi(ticket.priority),
    category: categorySlug,
    categoryLabel: categoryEntry?.[1].label ?? ticket.categoryName,
    categoryId: ticket.categoryId,
    subcategory: subcategorySlug,
    subcategoryLabel: subcategoryEntry?.[1].label ?? ticket.subcategoryName ?? null,
    subcategoryId: ticket.subcategoryId ?? null,
    clientId: ticket.createdByUserId,
    clientName: ticket.createdByName,
    clientEmail: ticket.createdByEmail,
    clientPhone: ticket.createdByPhoneNumber ?? null,
    department: ticket.createdByDepartment ?? null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt ?? null,
    dueDate: ticket.dueDate ?? null,
    lastActivityAt: ticket.lastActivityAt ?? null,
    assignedTo: ticket.assignedToUserId ?? null,
    assignedTechnicianName: ticket.assignedTechnicianName ?? ticket.assignedToName ?? null,
    assignedTechnicianEmail: ticket.assignedToEmail ?? null,
    assignedTechnicianPhone: ticket.assignedToPhoneNumber ?? null,
    assignedTechnicians: ticket.assignedTechnicians ?? [],
    activities: ticket.activities?.map((activity: ApiTicketActivityDto) => ({ ...activity })) ?? [],
    responses,
  }
}
