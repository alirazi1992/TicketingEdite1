"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FolderTree,
  LayoutDashboard,
  ListChecks,
  Settings2,
  Ticket as TicketIcon,
  UserPlus,
} from "lucide-react";

import { apiRequest } from "@/lib/api-client";
import type {
  ApiCategoryResponse,
  ApiTicketMessageDto,
  ApiTicketResponse,
  ApiUserDto,
} from "@/lib/api-types";
import {
  mapApiMessageToResponse,
  mapApiTicketToUi,
  mapUiPriorityToApi,
  mapUiStatusToApi,
} from "@/lib/ticket-mappers";
import {
  ensureTicketHubConnection,
  joinRoleGroup,
  joinUserGroup,
  subscribeToTicketUpdates,
} from "@/lib/ticket-realtime";
import {
  buildTechnicianProfile,
  type TechnicianProfile,
} from "@/data/technician-profiles";
import { ClientDashboard } from "@/components/client-dashboard";
import { TechnicianDashboard } from "@/components/technician-dashboard";
import { AdminDashboard } from "@/components/admin-dashboard";
import {
  DashboardShell,
  type DashboardNavItem,
} from "@/components/dashboard-shell";
import { useAuth } from "@/lib/auth-context";
import { useCategories } from "@/services/useCategories";
import { categoryService } from "@/services/CategoryService";
import type { CategoriesData } from "@/services/categories-types";
import type { Ticket, TicketStatus } from "@/types";
import { toast } from "@/hooks/use-toast";

export default function Home() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([]);
  const { categories: categoriesData, save: saveCategories } = useCategories();
  const categoriesRef = useRef<CategoriesData>(categoriesData);
  const [activeView, setActiveView] = useState<string>("");

  const getDefaultViewForRole = (role: "client" | "engineer" | "admin") => {
    switch (role) {
      case "admin":
        return "admin.tickets";
      case "engineer":
        return "engineer.assigned";
      default:
        return "client.tickets";
    }
  };

  const categoriesReady = useMemo(
    () =>
      Object.values(categoriesData).some(
        (cat) => typeof cat.backendId !== "undefined"
      ),
    [categoriesData]
  );

  useEffect(() => {
    categoriesRef.current = categoriesData;
  }, [categoriesData]);

  const loadTickets = async (
    authToken: string,
    categorySnapshot: CategoriesData,
    userRole?: string
  ): Promise<Ticket[]> => {
    try {
      // Use technician-specific endpoint for engineers
      const endpoint = userRole === "engineer" ? "/api/technician/tickets" : "/api/tickets";
      const apiTickets = await apiRequest<ApiTicketResponse[]>(endpoint, {
        token: authToken,
      });

      const mapped = await Promise.all(
        apiTickets.map(async (apiTicket) => {
          const messages = await apiRequest<ApiTicketMessageDto[]>(
            `/api/tickets/${apiTicket.id}/messages`,
            {
              token: authToken,
            }
          );

          return mapApiTicketToUi(
            apiTicket,
            categorySnapshot,
            messages.map(mapApiMessageToResponse)
          );
        })
      );

      setTickets(mapped);
      return mapped;
    } catch (error) {
      console.error("Failed to load tickets", error);
      toast({
        title: "بارگذاری تیکت‌ها ناموفق بود",
        description: "اتصال یا سرور بررسی شود.",
        variant: "destructive",
      });
      setTickets([]);
      return [];
    }
  };

  const loadTechnicians = async (authToken: string, currentTickets: Ticket[] = tickets) => {
    try {
      const { getAllTechnicians } = await import("@/lib/technicians-api");
      const apiTechnicians = await getAllTechnicians(authToken);
      
      // Calculate active tickets for each technician
      const techniciansWithLoad = apiTechnicians
        .filter((tech) => tech.isActive) // Only show active technicians
        .map((tech) => {
          // Count active tickets assigned to this technician
          const activeTicketsCount = currentTickets.filter(
            (ticket) => ticket.assignedTo === tech.id && 
                       (ticket.status === "Open" || ticket.status === "InProgress")
          ).length;
          
          return {
            id: tech.id,
            name: tech.fullName,
            email: tech.email,
            phone: tech.phone || "",
            department: tech.department || "",
            status: activeTicketsCount >= 5 ? ("busy" as const) : ("available" as const),
            specialties: [],
            rating: 5,
            activeTickets: activeTicketsCount,
          };
        });
      
      setTechnicians(techniciansWithLoad);
    } catch (error) {
      console.error("Failed to load technicians", error);
      toast({
        title: "خطا در بارگذاری تکنسین‌ها",
        description: "لطفاً صفحه را رفرش کنید",
        variant: "destructive",
      });
      setTechnicians([]);
    }
  };

  // Redirect unauthenticated users to the login page
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token || !user) {
      setTickets([]);
      setTechnicians([]);
      return;
    }

    // Load tickets first, then technicians (technicians need tickets to calculate load)
    const loadData = async () => {
      const loadedTickets = await loadTickets(token, categoriesReady ? categoriesRef.current : {}, user?.role);
      
      if (user.role === "admin") {
        await loadTechnicians(token, loadedTickets);
      } else {
        setTechnicians([]);
      }
    };
    
    void loadData();
  }, [token, user, categoriesReady]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        const loadedTickets = await loadTickets(
          token,
          categoriesReady ? categoriesRef.current : {},
          user.role,
        );

        if (user.role === "admin") {
          await loadTechnicians(token, loadedTickets);
        }
      })();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, user, categoriesReady]);

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let isActive = true;
    const roleGroup = user.role === "admin" ? "Admin" : user.role === "engineer" ? "Technician" : "Client";

    const refreshFromRealtime = async () => {
      if (!isActive) return;
      const loadedTickets = await loadTickets(
        token,
        categoriesReady ? categoriesRef.current : {},
        user.role,
      );

      if (user.role === "admin") {
        await loadTechnicians(token, loadedTickets);
      }
    };

    const setupRealtime = async () => {
      try {
        await ensureTicketHubConnection(token);
        await joinUserGroup();
        await joinRoleGroup(roleGroup);
      } catch (error) {
        console.error("Failed to connect to ticket realtime hub", error);
      }
    };

    const unsubscribe = subscribeToTicketUpdates(() => {
      void refreshFromRealtime();
    });

    void setupRealtime();

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [token, user, categoriesReady]);

  // -------- Ticket handlers (single definitions) --------

  const ensureBackendCategories = async () => {
    // If we already have backend ids, skip.
    if (
      Object.values(categoriesRef.current).some(
        (cat) => typeof cat.backendId !== "undefined"
      )
    ) {
      return categoriesRef.current;
    }

    try {
      const fresh = await categoryService.list();
      categoriesRef.current = fresh;
      await saveCategories(fresh);
      return fresh;
    } catch (error) {
      console.error("Failed to hydrate categories from backend", error);
      return categoriesRef.current;
    }
  };

  const handleTicketCreate = async (draft: Ticket) => {
    if (!token) return;

    const catMap =
      Object.values(categoriesRef.current).some(
        (cat) => typeof cat.backendId !== "undefined"
      )
        ? categoriesRef.current
        : await ensureBackendCategories();

    const category = catMap[draft.category];
    if (!category || typeof category.backendId === "undefined") {
      console.warn("Missing category mapping for", draft.category, category);
      toast({
        title: "دسته‌بندی نامعتبر است",
        description:
          "دسته‌بندی‌ها هنوز از سرور بارگذاری نشده‌اند. چند لحظه بعد دوباره تلاش کنید.",
        variant: "destructive",
      });
      return;
    }

    try {
      const created = await apiRequest<ApiTicketResponse>("/api/tickets", {
        method: "POST",
        token,
        body: {
          title: draft.title,
          description: draft.description,
          categoryId: category.backendId,
          subcategoryId: draft.subcategory
            ? category.subIssues[draft.subcategory]?.backendId
            : undefined,
          priority: mapUiPriorityToApi(draft.priority),
        },
      });

      const ticket = mapApiTicketToUi(created, categoriesRef.current, []);
      setTickets((prev) => [ticket, ...prev]);
      await refreshTickets();
    } catch (error) {
      console.error("Failed to create ticket", error);
      toast({
        title: "ثبت تیکت ناموفق بود",
          description: "لطفا اتصال و داده‌ها را بررسی کنید.",
          variant: "destructive",
        });
    }
  };

  const refreshTickets = async () => {
    if (!token || !user) return;
    await loadTickets(token, categoriesRef.current, user?.role);
  };

  const handleTicketUpdate = async (
    ticketId: string,
    updates: Partial<Ticket>
  ) => {
    if (!token) {
      toast({
        title: "خطا",
        description: "لطفاً ابتدا وارد سیستم شوید",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {};

    if (updates.status) {
      payload.status = mapUiStatusToApi(updates.status);
    }
    if (updates.priority) {
      payload.priority = mapUiPriorityToApi(updates.priority);
    }
    
    // Handle technician assignment separately
    if (typeof updates.assignedTo !== "undefined" && updates.assignedTo) {
      // Use the new assign-technician endpoint
      try {
        const { assignTechnicianToTicket } = await import("@/lib/technicians-api");
        const updatedTicket = await assignTechnicianToTicket(token, ticketId, updates.assignedTo);
        
        // Refresh tickets list to get latest data
        const refreshedTickets = await loadTickets(token, categoriesRef.current, user?.role);
        
        // Also refresh technicians to update their active ticket counts
        if (user?.role === "admin") {
          await loadTechnicians(token, refreshedTickets);
        }

        toast({
          title: "تکنسین تعیین شد",
          description: `تیکت ${ticketId} با موفقیت به تکنسین واگذار شد`,
        });
        return;
      } catch (error: any) {
        console.error("Failed to assign technician", error);
        const errorMessage = error?.body?.message || error?.message || "لطفا مجددا تلاش کنید.";
        toast({
          title: "تعیین تکنسین ناموفق بود",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
    }

    if (typeof updates.assignedTo !== "undefined" && !updates.assignedTo) {
      // Unassign technician
      payload.assignedToUserId = null;
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      const updatedTicket = await apiRequest<ApiTicketResponse>(
        `/api/tickets/${ticketId}`,
        {
          method: "PATCH",
          token,
          body: payload,
        }
      );

      // Refresh tickets list to get latest data
      await refreshTickets();
      
      toast({
        title: "تیکت به‌روزرسانی شد",
        description: "تغییرات با موفقیت اعمال شد",
      });
    } catch (error: any) {
      console.error("Failed to update ticket", error);
      const errorMessage = error?.body?.message || error?.message || "لطفا مجددا تلاش کنید.";
      toast({
        title: "به‌روزرسانی تیکت ناموفق بود",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleTicketResponse = async (
    ticketId: string,
    message: string,
    status: TicketStatus
  ) => {
    if (!token) return;

    try {
      await apiRequest<ApiTicketMessageDto>(
        `/api/tickets/${ticketId}/messages`,
        {
          method: "POST",
          token,
          body: {
            message,
            status: mapUiStatusToApi(status),
          },
        }
      );

      const [ticketDetails, messages] = await Promise.all([
        apiRequest<ApiTicketResponse>(`/api/tickets/${ticketId}`, { token }),
        apiRequest<ApiTicketMessageDto[]>(`/api/tickets/${ticketId}/messages`, {
          token,
        }),
      ]);

      const mapped = mapApiTicketToUi(
        ticketDetails,
        categoriesRef.current,
        messages.map(mapApiMessageToResponse)
      );
      setTickets((prev) =>
        prev.map((ticket) => (ticket.id === ticketId ? mapped : ticket))
      );
      await refreshTickets();
    } catch (error) {
      console.error("Failed to add response", error);
      toast({
        title: "ثبت پاسخ ناموفق بود",
        description: "لطفا مجددا تلاش کنید.",
        variant: "destructive",
      });
    }
  };

  // -------- Active view handling --------

  useEffect(() => {
    if (!user) {
      setActiveView("");
      return;
    }

    setActiveView((current) => {
      if (current && current.startsWith(user.role)) {
        return current;
      }
      return getDefaultViewForRole(user.role);
    });
  }, [user]);

  const handleCategoryUpdate = async (updatedCategories: CategoriesData) => {
    let nextCategories: CategoriesData = { ...updatedCategories };

    // If admin creates a new category (no backendId), sync it to the backend so tickets can use it
    if (token && user?.role === "admin") {
      for (const [key, category] of Object.entries(updatedCategories)) {
        if (typeof category.backendId === "undefined") {
          try {
            const created = await apiRequest<ApiCategoryResponse>("/api/categories", {
              method: "POST",
              token,
              body: {
                name: category.label ?? category.id ?? key,
                description: category.description ?? category.label ?? "",
              },
            });

            nextCategories = {
              ...nextCategories,
              [key]: { ...category, backendId: created.id },
            };
          } catch (error) {
            console.error("Failed to sync category to backend", key, error);
          }
        }
      }
    }

    await saveCategories(nextCategories);
  };

  const navItems = useMemo<DashboardNavItem[]>(() => {
    if (!user) {
      return [];
    }

    if (user.role === "client") {
      const userTickets = tickets.filter(
        (ticket) => ticket.clientEmail === user.email
      );
      const newTicketCount = userTickets.filter(
        (ticket) => ticket.status === "Open"
      ).length;

      return [
        {
          id: "client-overview",
          title: "داشبورد",
          icon: LayoutDashboard,
          target: "client.tickets",
        },
        {
          id: "client-tickets",
          title: "درخواست‌های من",
          icon: TicketIcon,
          children: [
            {
              id: "client-tickets-list",
              title: "همه درخواست‌ها",
              target: "client.tickets",
              badge: userTickets.length,
            },
            {
              id: "client-tickets-create",
              title: "ثبت درخواست جدید",
              target: "client.create",
              badge: newTicketCount > 0 ? "+" : undefined,
            },
          ],
        },
      ];
    }

    if (user.role === "engineer") {
      const technicianTickets = tickets.filter(
        (ticket) => ticket.assignedTechnicianEmail === user.email
      );
      const inProgressCount = technicianTickets.filter(
        (ticket) => ticket.status === "InProgress" || ticket.status === "Redo"
      ).length;
      const closedCount = technicianTickets.filter(
        (ticket) => ticket.status === "AnsweredSolved"
      ).length;

      return [
        {
          id: "engineer-overview",
          title: "داشبورد پشتیبان",
          icon: LayoutDashboard,
          target: "engineer.assigned",
        },
        {
          id: "engineer-tickets",
          title: "تیکت‌های محول شده",
          icon: ListChecks,
          children: [
            {
              id: "engineer-assigned",
              title: "تیکت‌های من",
              target: "engineer.assigned",
              badge: technicianTickets.length,
            },
            {
              id: "engineer-progress",
              title: "در حال رسیدگی",
              target: "engineer.in-progress",
              badge: inProgressCount,
            },
            {
              id: "engineer-history",
              title: "آرشیو / پایان یافته",
              target: "engineer.history",
              badge: closedCount,
            },
          ],
        },
      ];
    }

    const openTicketsCount = tickets.filter(
      (ticket) => ticket.status === "Open"
    ).length;

    return [
      {
        id: "admin-overview",
        title: "داشبورد مدیر",
        icon: LayoutDashboard,
        target: "admin.tickets",
      },
      {
        id: "admin-tickets",
        title: "مدیریت تیکت‌ها",
        icon: TicketIcon,
        children: [
          {
            id: "admin-tickets-all",
            title: "همه تیکت‌ها",
            target: "admin.tickets",
            badge: tickets.length,
          },
          {
            id: "admin-assignment",
            title: "تخصیص تیکت‌ها",
            target: "admin.assignment",
            badge: openTicketsCount,
          },
        ],
      },
      {
        id: "admin-categories",
        title: "مدیریت دسته‌بندی‌ها",
        icon: FolderTree,
        children: [
          {
            id: "admin-categories-manage",
            title: "مدیریت دسته‌بندی‌ها",
            target: "admin.categories",
            badge: Object.keys(categoriesData).length,
          },
        ],
      },
      {
        id: "admin-automation",
        title: "تنظیمات خودکار",
        icon: Settings2,
        target: "admin.auto-settings",
      },
    ];
  }, [user, tickets, categoriesData]);

  // -------- Loading & unauthenticated states --------

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 mx-auto" />
          <p className="text-sm text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-300 mx-auto" />
          <p className="text-sm text-slate-300">Redirecting to login...</p>
        </div>
      </div>
    );
  }
// -------- Main dashboard content --------

  const resolvedActiveView = activeView || getDefaultViewForRole(user.role);

  const dashboardContent = (() => {
    if (user.role === "client") {
      const clientSection: "tickets" | "create" =
        resolvedActiveView === "client.create" ? "create" : "tickets";

      return (
        <ClientDashboard
          tickets={tickets}
          onTicketCreate={handleTicketCreate}
          currentUser={user}
          categoriesData={categoriesData}
          activeSection={clientSection}
        />
      );
    }

    if (user.role === "engineer") {
      const engineerSection: "assigned" | "in-progress" | "history" =
        resolvedActiveView === "engineer.in-progress"
          ? "in-progress"
          : resolvedActiveView === "engineer.history"
          ? "history"
          : "assigned";

      const handleTechnicianSectionChange = (
        section: "assigned" | "in-progress" | "history"
      ) => {
        const next = `engineer.${section}`;
        setActiveView((prev) => (prev === next ? prev : next));
      };

      return (
        <TechnicianDashboard
          tickets={tickets}
          onTicketUpdate={handleTicketUpdate}
          onTicketRespond={handleTicketResponse}
          currentUser={user}
          activeSection={engineerSection}
          onSectionChange={handleTechnicianSectionChange}
        />
      );
    }

    const adminSection:
      | "tickets"
      | "assignment"
      | "categories"
      | "auto-settings" =
      resolvedActiveView === "admin.assignment"
        ? "assignment"
        : resolvedActiveView === "admin.categories"
        ? "categories"
        : resolvedActiveView === "admin.auto-settings"
        ? "auto-settings"
        : "tickets";

    return (
      <AdminDashboard
        tickets={tickets}
        onTicketUpdate={handleTicketUpdate}
        technicians={technicians}
        categoriesData={categoriesData}
        onCategoryUpdate={handleCategoryUpdate}
        activeSection={adminSection}
      />
    );
  })();

  return (
    <DashboardShell
      user={{
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department ?? undefined,
        title: user.phone ?? undefined,
        avatar: user.avatar ?? undefined,
      }}
      navItems={navItems}
      activeItem={resolvedActiveView}
      onSelect={setActiveView}
    >
      {dashboardContent}
    </DashboardShell>
  );
}
