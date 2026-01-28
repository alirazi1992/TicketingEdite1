"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api-client";
import type { ApiTicketResponse } from "@/lib/api-types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Users,
  Flag,
  Hash,
  type LucideIcon,
} from "lucide-react";

/* ==== Jalali calendar setup ==== */
import dayjs from "dayjs";
import jalaliday from "jalaliday";
dayjs.extend(jalaliday);
dayjs.calendar("jalali");
dayjs.locale("fa");

interface TicketCalendarOverviewProps {
  tickets?: any[]; // Optional - if not provided, will fetch from backend
}

type CalendarDay = {
  date: dayjs.Dayjs; // Jalali-aware
  isCurrentMonth: boolean;
  tickets: any[];
};

type StatusBucket = "answered" | "working" | "notResponded";

const weekDays = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];

// Persian (Jalali) formatters
const monthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  month: "long",
  year: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const statusMeta: Record<
  StatusBucket,
  { label: string; description: string; counterClass: string }
> = {
  answered: {
    label: "تیکت‌های پاسخ‌داده‌شده",
    description: "تیکت‌هایی که با موفقیت پاسخ یا بسته شده‌اند",
    counterClass: "bg-emerald-500/15 text-emerald-600",
  },
  working: {
    label: "تیکت‌های در حال پیگیری",
    description: "تیکت‌هایی که تکنسین در حال کار روی آن‌هاست",
    counterClass: "bg-amber-500/15 text-amber-600",
  },
  notResponded: {
    label: "تیکت‌های بی‌پاسخ",
    description: "تیکت‌هایی که هنوز پاسخی دریافت نکرده‌اند",
    counterClass: "bg-rose-500/15 text-rose-600",
  },
};

import { TICKET_STATUS_LABELS } from "@/lib/ticket-status";

const statusLabels = TICKET_STATUS_LABELS;

const statusColors: Record<string, string> = {
  Submitted: "bg-blue-100 text-blue-700 border border-blue-200",
  SeenRead: "bg-cyan-100 text-cyan-700 border border-cyan-200",
  Open: "bg-rose-100 text-rose-700 border border-rose-200",
  InProgress: "bg-amber-100 text-amber-700 border border-amber-200",
  AnsweredSolved: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Redo: "bg-orange-100 text-orange-700 border border-orange-200",
};

const statusCountText: Record<StatusBucket, string> = {
  answered: "تیکت‌های پاسخ داده شده",
  working: "تیکت‌های در حال پیگیری",
  notResponded: "تیکت‌های بی‌پاسخ",
};

const formatDateValue = (
  value?: string | Date | null,
  formatter = dateTimeFormatter
) => {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return formatter.format(date); // Persian calendar formatting
};

const getComparableTime = (value?: string | Date | null) => {
  if (!value) return 0;
  const d = value instanceof Date ? dayjs(value) : dayjs(value);
  return d.isValid() ? d.valueOf() : 0;
};

// Persian digits (stabilizes RTL wrapping)
const toFaDigits = (n: number | string) =>
  String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

// Build BiDi-safe RTL badge text (adds RLM around the colon)
const buildRtlBadgeText = (label: string, count: number) =>
  `${label} \u200F:\u200F ${toFaDigits(count)}`;

// --- Use Jalali year/month/day to generate keys like 1404-07-23 (ASCII digits) ---
const formatKeyJalali = (d: dayjs.Dayjs) =>
  `${d.calendar("jalali").year()}-${String(
    d.calendar("jalali").month() + 1
  ).padStart(2, "0")}-${String(d.calendar("jalali").date()).padStart(2, "0")}`;

/** Info row: labels on LEFT, values on RIGHT (as per screenshot) */
const InfoRow = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) => (
  <div
    className="grid grid-cols-2 gap-6 items-center w-full"
    dir="rtl"
  >
    {/* Labels block — on LEFT */}
    <div className="flex items-center gap-2 text-right text-sm font-iran text-muted-foreground">
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </div>
    {/* Values block — on RIGHT */}
    <div className="text-left text-sm font-iran text-foreground">
      {value}
    </div>
  </div>
);

const getTicketDate = (ticket: any): dayjs.Dayjs | null => {
  // Use createdAt for calendar display (as per requirements)
  const source = ticket?.createdAt;
  if (!source) return null;
  const d = dayjs(source);
  return d.isValid() ? d : null;
};

const getStatusBucket = (status: string): StatusBucket => {
  if (status === "in-progress") return "working";
  if (status === "open") return "notResponded";
  return "answered";
};

export function TicketCalendarOverview({
  tickets: ticketsProp,
}: TicketCalendarOverviewProps) {
  const { token, user } = useAuth();
  const router = useRouter();
  
  // Current Jalali month, first day
  const [currentMonth, setCurrentMonth] = useState(() =>
    dayjs().calendar("jalali").startOf("month")
  );
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calendarTickets, setCalendarTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch tickets for the visible date range
  useEffect(() => {
    if (!token || !user || user.role !== "Admin") return;
    
    // Calculate date range for current month view
    const startOfMonth = currentMonth.startOf("month");
    const endOfMonth = currentMonth.endOf("month");
    
    // Convert Jalali dates to Gregorian for API
    const startGregorian = startOfMonth.calendar("gregory").startOf("day").toISOString();
    const endGregorian = endOfMonth.calendar("gregory").endOf("day").toISOString();
    
    setLoading(true);
    const startDate = startGregorian.split("T")[0]; // YYYY-MM-DD
    const endDate = endGregorian.split("T")[0];
    
    apiRequest<any[]>(`/api/tickets/calendar?start=${startDate}&end=${endDate}`, {
      method: "GET",
      token,
    })
      .then((data) => {
        // Map API response to calendar format
        const mapped = (data || []).map((ticket: any) => ({
          id: ticket.id,
          ticketNumber: ticket.ticketNumber || `T-${ticket.id.substring(0, 8).toUpperCase()}`,
          title: ticket.title,
          status: ticket.status,
          priority: ticket.priority === "Low" ? "low" :
                    ticket.priority === "Medium" ? "medium" :
                    ticket.priority === "High" ? "high" :
                    ticket.priority === "Critical" ? "urgent" : ticket.priority,
          categoryName: ticket.categoryName || "",
          assignedTechnicianName: ticket.assignedTechnicianName || ticket.assignedToName || null,
          createdAt: ticket.createdAt,
          updatedAt: ticket.createdAt,
          dueDate: ticket.dueDate,
        }));
        setCalendarTickets(mapped);
      })
      .catch((error) => {
        console.error("Failed to load calendar tickets:", error);
        setCalendarTickets([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentMonth, token, user]);

  // Use tickets from props if provided, otherwise use fetched tickets
  const activeTickets = ticketsProp || calendarTickets;

  // Group by Jalali date key
  const groupedTickets = useMemo(() => {
    const map = new Map<string, any[]>();
    activeTickets.forEach((ticket) => {
      const d = getTicketDate(ticket);
      if (!d) return;
      const key = formatKeyJalali(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ticket);
    });
    return map;
  }, [activeTickets]);

  // Build Jalali month grid
  const calendarDays = useMemo<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];
    const start = currentMonth; // first day of current Jalali month
    const startOffset = (start.day() + 1) % 7; // make Saturday index 0
    const daysInMonth = start.daysInMonth();

    // previous month spill
    for (let i = startOffset; i > 0; i--) {
      const date = start.subtract(i, "day");
      days.push({
        date,
        isCurrentMonth: false,
        tickets: groupedTickets.get(formatKeyJalali(date)) ?? [],
      });
    }

    // current month days
    for (let d = 0; d < daysInMonth; d++) {
      const date = start.add(d, "day");
      days.push({
        date,
        isCurrentMonth: true,
        tickets: groupedTickets.get(formatKeyJalali(date)) ?? [],
      });
    }

    // next month spill to fill last week
    const remaining = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
    for (let i = 1; i <= remaining; i++) {
      const date = start.add(daysInMonth - 1 + i, "day");
      days.push({
        date,
        isCurrentMonth: false,
        tickets: groupedTickets.get(formatKeyJalali(date)) ?? [],
      });
    }

    return days;
  }, [currentMonth, groupedTickets]);

  // Monthly summary (within current Jalali month)
  const monthSummary = useMemo(() => {
    const summary: Record<StatusBucket, number> = {
      answered: 0,
      working: 0,
      notResponded: 0,
    };
    activeTickets.forEach((ticket) => {
      const d = getTicketDate(ticket);
      if (!d) return;
      const sameJYear =
        d.calendar("jalali").year() === currentMonth.calendar("jalali").year();
      const sameJMonth =
        d.calendar("jalali").month() ===
        currentMonth.calendar("jalali").month();
      if (!sameJYear || !sameJMonth) return;
      const bucket = getStatusBucket(ticket.status);
      summary[bucket] += 1;
    });
    return summary;
  }, [activeTickets, currentMonth]);

  // Selected day (by Jalali key)
  const selectedDay = useMemo(() => {
    if (!selectedDateKey) return null;
    const [jy, jm, jd] = selectedDateKey.split("-").map((n) => parseInt(n, 10));
    if (!jy || !jm || !jd) return null;
    const date = dayjs()
      .calendar("jalali")
      .year(jy)
      .month(jm - 1)
      .date(jd);
    const ticketsForDay = groupedTickets.get(selectedDateKey) ?? [];
    const sortedTickets = [...ticketsForDay].sort(
      (a, b) =>
        getComparableTime(b.updatedAt || b.createdAt) -
        getComparableTime(a.updatedAt || a.createdAt)
    );
    return { date, tickets: sortedTickets };
  }, [groupedTickets, selectedDateKey]);

  useEffect(() => {
    setSelectedDateKey(null);
    setDialogOpen(false);
  }, [currentMonth]);


  const handleDayClick = (day: CalendarDay) => {
    if (!day.isCurrentMonth || day.tickets.length === 0) return;
    setSelectedDateKey(formatKeyJalali(day.date));
    setDialogOpen(true);
  };

  const goToPreviousMonth = () =>
    setCurrentMonth((prev) => prev.subtract(1, "month").startOf("month"));
  const goToNextMonth = () =>
    setCurrentMonth((prev) => prev.add(1, "month").startOf("month"));

  const todayKey = formatKeyJalali(dayjs());

  return (
    <>
      <Card className="border border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="text-right">
                <CardTitle className="text-lg font-iran">
                  تقویم برنامه‌ریزی تیکت‌ها
                </CardTitle>
                <CardDescription className="font-iran">
                  بررسی توزیع روزانه‌ی تیکت‌ها و وضعیت رسیدگی تکنسین‌ها
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToNextMonth}
                  className="rounded-full"
                  aria-label="ماه بعد"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="rounded-full bg-primary/10 px-4 py-1 text-sm font-iran text-primary">
                  {monthFormatter.format(currentMonth.toDate())}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={goToPreviousMonth}
                  className="rounded-full"
                  aria-label="ماه قبل"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {(Object.keys(statusMeta) as StatusBucket[]).map((key) => (
              <div
                key={key}
                className="flex flex-col items-end gap-2 rounded-xl border bg-background/60 px-4 py-3 text-right"
                dir="rtl"
              >
                {/* Month summary badge: RTL-wrapped to the right */}
                <span
                  dir="rtl"
                  className={cn(
                    "self-end inline-flex justify-end text-right rounded-full px-3 py-1 text-sm font-iran",
                    "max-w-full break-words",
                    statusMeta[key].counterClass
                  )}
                  style={{ unicodeBidi: "plaintext" }}
                >
                  {buildRtlBadgeText(statusCountText[key], monthSummary[key])}
                </span>
                <p className="text-xs font-iran text-muted-foreground">
                  {statusMeta[key].description}
                </p>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
            {weekDays.map((day) => (
              <div
                key={day}
                className="rounded-lg bg-muted/40 py-2 text-center font-iran"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const key = formatKeyJalali(day.date);
              const statusCounts: Record<StatusBucket, number> = {
                answered: 0,
                working: 0,
                notResponded: 0,
              };

              day.tickets.forEach((ticket) => {
                const bucket = getStatusBucket(ticket.status);
                statusCounts[bucket] += 1;
              });

              const isToday = key === todayKey;

              return (
                <button
                  key={`${key}-${day.isCurrentMonth ? "current" : "other"}`}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "relative flex min-h-[120px] flex-col rounded-2xl border p-3 text-right transition-all",
                    "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
                    day.isCurrentMonth
                      ? "bg-background"
                      : "bg-muted/50 text-muted-foreground",
                    day.tickets.length > 0
                      ? "cursor-pointer"
                      : "cursor-default opacity-70",
                    isToday && "border-primary/60 shadow-inner"
                  )}
                  disabled={!day.isCurrentMonth || day.tickets.length === 0}
                >
                  <div className="flex items-center justify-between text-xs font-medium font-iran">
                    <span>{day.date.calendar("jalali").date()}</span>
                    {isToday && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        امروز
                      </span>
                    )}
                  </div>

                  {/* Right-anchored status counters inside each day cell (RTL + BiDi safe) */}
                  <div
                    className="absolute right-3 top-1/2 flex -translate-y-1/2 transform flex-col items-end gap-1 text-right"
                    dir="rtl"
                  >
                    {(Object.keys(statusMeta) as StatusBucket[]).map(
                      (bucket) => {
                        const count = statusCounts[bucket];
                        if (count === 0) return null;

                        const displayText = buildRtlBadgeText(
                          statusCountText[bucket],
                          count
                        );

                        return (
                          <span
                            key={bucket}
                            dir="rtl"
                            className={cn(
                              "self-end inline-flex justify-end text-right rounded-full px-2 py-1 text-[11px] font-iran",
                              "max-w-[92%] break-words", // wrap within the cell, keep right edge
                              statusMeta[bucket].counterClass
                            )}
                            style={{ unicodeBidi: "plaintext" }}
                          >
                            {displayText}
                          </span>
                        );
                      }
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={dialogOpen && Boolean(selectedDay)}
        onOpenChange={setDialogOpen}
      >
        {selectedDay && (
          <DialogContent className="max-w-3xl space-y-4 font-iran" dir="rtl">
            <DialogHeader className="space-y-2 text-right">
              <DialogTitle className="font-iran text-xl">
                تیکت‌های {fullDateFormatter.format(selectedDay.date.toDate())}
              </DialogTitle>
              <DialogDescription className="font-iran text-muted-foreground">
                در این روز {selectedDay.tickets.length} تیکت به‌روزرسانی شده
                است.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(Object.keys(statusMeta) as StatusBucket[]).map((bucket) => {
                const count = selectedDay.tickets.filter(
                  (ticket) => getStatusBucket(ticket.status) === bucket
                ).length;
                if (count === 0) return null;
                return (
                  <div
                    key={bucket}
                    className="flex flex-col items-end gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-right"
                    dir="rtl"
                  >
                    <span
                      dir="rtl"
                      className={cn(
                        "self-end inline-flex justify-end text-right rounded-full px-3 py-1 text-sm font-iran",
                        "max-w-full break-words",
                        statusMeta[bucket].counterClass
                      )}
                      style={{ unicodeBidi: "plaintext" }}
                    >
                      {buildRtlBadgeText(statusCountText[bucket], count)}
                    </span>
                  </div>
                );
              })}
            </div>

            <Separator />

            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4">
                {selectedDay.tickets.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    تیکتی در این روز وجود ندارد
                  </div>
                ) : (
                  selectedDay.tickets.map((ticket: any) => {
                  const createdDisplay = formatDateValue(
                    ticket.createdAt,
                    dateFormatter
                  );
                  const statusLabel =
                    statusLabels[ticket.status] ?? ticket.status;
                  const statusClass =
                    statusColors[ticket.status] ??
                    "bg-slate-100 text-slate-700 border";
                  const technicianName =
                    ticket.assignedTechnicianName || "Unassigned";

                  return (
                    <div
                      key={ticket.id}
                      className="space-y-3 rounded-2xl border bg-muted/40 p-4 shadow-sm cursor-pointer hover:bg-muted/60 transition-colors"
                      onClick={() => {
                        // Navigate directly to ticket detail page
                        router.push(`/tickets/${ticket.id}`);
                        setDialogOpen(false); // Close the day dialog
                      }}
                    >
                      <InfoRow
                        icon={Hash}
                        label="شماره تیکت"
                        value={
                          <span className="text-sm font-iran text-foreground">
                            {ticket.ticketNumber || ticket.id}
                          </span>
                        }
                      />
                      <InfoRow
                        icon={Users}
                        label="تکنسین"
                        value={
                          <span className="text-sm font-iran text-foreground">
                            {technicianName}
                          </span>
                        }
                      />
                      <InfoRow
                        icon={CalendarDays}
                        label="تاریخ ایجاد"
                        value={
                          <span className="text-sm font-iran text-foreground">
                            {createdDisplay}
                          </span>
                        }
                      />
                      <InfoRow
                        icon={Flag}
                        label="وضعیت"
                        value={
                          <Badge className={cn("font-iran", statusClass)}>
                            {statusLabel}
                          </Badge>
                        }
                      />
                    </div>
                  );
                  })
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
