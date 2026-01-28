/**
 * Ticket Status Definitions and Persian Labels
 * 
 * This file serves as the single source of truth for ticket status types and their Persian labels.
 * Backend stores statuses as English enum keys, but frontend displays Persian labels.
 */

export type TicketStatus =
  | "Submitted"
  | "SeenRead"
  | "Open"
  | "InProgress"
  | "AnsweredSolved"
  | "Redo"

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  Submitted: "ثبت شد",
  SeenRead: "دیده شد",
  Open: "باز",
  InProgress: "در حال انجام",
  AnsweredSolved: "پاسخ داده شد",
  Redo: "نیاز به بازبینی",
}

export const TICKET_STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: "Submitted", label: TICKET_STATUS_LABELS.Submitted },
  { value: "SeenRead", label: TICKET_STATUS_LABELS.SeenRead },
  { value: "Open", label: TICKET_STATUS_LABELS.Open },
  { value: "InProgress", label: TICKET_STATUS_LABELS.InProgress },
  { value: "AnsweredSolved", label: TICKET_STATUS_LABELS.AnsweredSolved },
  { value: "Redo", label: TICKET_STATUS_LABELS.Redo },
]

/**
 * Get Persian label for a ticket status
 */
export function getTicketStatusLabel(status: TicketStatus): string {
  return TICKET_STATUS_LABELS[status] || status
}







