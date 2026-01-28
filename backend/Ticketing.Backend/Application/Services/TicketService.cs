using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Ticketing.Backend.Application.DTOs;
using Ticketing.Backend.Api.Hubs;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;
using Ticketing.Backend.Infrastructure.Data;

namespace Ticketing.Backend.Application.Services;

/// <summary>
/// Thrown when a user attempts a status change they don't have permission for
/// </summary>
public class StatusChangeForbiddenException : Exception
{
    public StatusChangeForbiddenException(string message) : base(message) { }
}

public interface ITicketService
{
    Task<IEnumerable<TicketResponse>> GetTicketsAsync(Guid userId, UserRole role, TicketStatus? status, TicketPriority? priority, Guid? assignedTo, Guid? createdBy, string? search);
    Task<TicketResponse?> GetTicketAsync(Guid id, Guid userId, UserRole role);
    Task<TicketResponse?> CreateTicketAsync(Guid userId, TicketCreateRequest request);
    Task<TicketResponse?> UpdateTicketAsync(Guid id, Guid userId, UserRole role, TicketUpdateRequest request);
    Task<TicketResponse?> AssignTicketAsync(Guid id, Guid technicianId, Guid actorId);
    Task<IEnumerable<TicketMessageDto>> GetMessagesAsync(Guid ticketId, Guid userId, UserRole role);
    Task<TicketMessageDto?> AddMessageAsync(Guid ticketId, Guid authorId, string message, TicketStatus? status = null);
    Task<TicketMessageDto?> AddReplyAsync(Guid ticketId, Guid authorId, string message);
    Task<TicketResponse?> ChangeStatusAsync(Guid ticketId, Guid actorId, TicketStatus newStatus);
    Task<IEnumerable<TicketCalendarResponse>> GetCalendarTicketsAsync(DateTime startDate, DateTime endDate);
}

public class TicketService : ITicketService
{
    private readonly AppDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly ITechnicianService _technicianService;
    private readonly ISystemSettingsService _systemSettingsService;
    private readonly IHubContext<TicketHub> _ticketHub;
    private readonly ILogger<TicketService> _logger;

    public TicketService(
        AppDbContext context,
        INotificationService notificationService,
        ITechnicianService technicianService,
        ISystemSettingsService systemSettingsService,
        IHubContext<TicketHub> ticketHub,
        ILogger<TicketService> logger)
    {
        _context = context;
        _notificationService = notificationService;
        _technicianService = technicianService;
        _systemSettingsService = systemSettingsService;
        _ticketHub = ticketHub;
        _logger = logger;
    }

    public async Task<IEnumerable<TicketResponse>> GetTicketsAsync(Guid userId, UserRole role, TicketStatus? status, TicketPriority? priority, Guid? assignedTo, Guid? createdBy, string? search)
    {
        // Start building a query with all the relationships we need for mapping
        var query = _context.Tickets
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .Include(t => t.Technician)
            .AsQueryable();

        // Restrict tickets based on role
        query = role switch
        {
            UserRole.Client => query.Where(t => t.CreatedByUserId == userId),
            UserRole.Technician => query.Where(t => t.TechnicianId == userId || t.AssignedToUserId == userId),
            _ => query
        };

        if (status.HasValue)
        {
            query = query.Where(t => t.Status == status.Value);
        }
        if (priority.HasValue)
        {
            query = query.Where(t => t.Priority == priority.Value);
        }
        if (assignedTo.HasValue)
        {
            query = query.Where(t => t.AssignedToUserId == assignedTo.Value);
        }
        if (createdBy.HasValue)
        {
            query = query.Where(t => t.CreatedByUserId == createdBy.Value);
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(t => t.Title.Contains(search) || t.Description.Contains(search));
        }

        var tickets = await query.OrderByDescending(t => t.CreatedAt).ToListAsync();
        return tickets.Select(ticket => MapToResponse(ticket, role));
    }

    public async Task<TicketResponse?> GetTicketAsync(Guid id, Guid userId, UserRole role)
    {
        var ticket = await _context.Tickets
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .Include(t => t.Technician)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (ticket == null)
        {
            return null;
        }

        if (role == UserRole.Client && ticket.CreatedByUserId != userId)
        {
            return null;
        }

        if (role == UserRole.Technician && ticket.TechnicianId != userId && ticket.AssignedToUserId != userId)
        {
            return null;
        }

        // Auto-set SeenRead when technician/admin opens ticket detail (if status is Submitted and viewer is not the creator)
        if (ticket.Status == TicketStatus.Submitted &&
            ticket.CreatedByUserId != userId &&
            (role == UserRole.Technician || role == UserRole.Admin))
        {
            await ChangeStatusAsync(id, userId, TicketStatus.SeenRead);
            ticket = await _context.Tickets
                .Include(t => t.Category)
                .Include(t => t.Subcategory)
                .Include(t => t.CreatedByUser)
                .Include(t => t.AssignedToUser)
                .Include(t => t.Technician)
                .FirstOrDefaultAsync(t => t.Id == id);
        }

        if (ticket == null)
        {
            return null;
        }

        var replies = await _context.TicketMessages
            .Include(m => m.AuthorUser)
            .Where(m => m.TicketId == id)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new TicketMessageDto
            {
                Id = m.Id,
                AuthorUserId = m.AuthorUserId,
                AuthorName = m.AuthorUser!.FullName,
                AuthorEmail = m.AuthorUser.Email,
                Message = m.Message,
                CreatedAt = m.CreatedAt,
                Status = m.Status
            })
            .ToListAsync();

        var activities = await _context.TicketActivities
            .Include(a => a.ActorUser)
            .Where(a => a.TicketId == id)
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new TicketActivityDto
            {
                Id = a.Id,
                ActorUserId = a.ActorUserId,
                ActorName = a.ActorUser!.FullName,
                ActorRole = a.ActorUser.Role.ToString(),
                Type = a.Type,
                Message = a.Message,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync();

        return MapToResponse(ticket, role, replies, activities);
    }

    public async Task<TicketResponse?> CreateTicketAsync(Guid userId, TicketCreateRequest request)
    {
        // Clients create tickets for themselves; the role check happens in the controller
        var ticket = new Ticket
        {
            Id = Guid.NewGuid(),
            Title = request.Title,
            Description = request.Description,
            CategoryId = request.CategoryId,
            SubcategoryId = request.SubcategoryId,
            Priority = request.Priority,
            Status = TicketStatus.Submitted,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            LastActivityAt = DateTime.UtcNow
        };

        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // NOTE: Auto-assignment on ticket creation is DISABLED by design.
        // Tickets are always created as Submitted + unassigned.
        // Smart Assignment runs manually via POST /api/admin/assignment/smart/run
        // or can be scheduled externally. This ensures predictable ticket state.

        ticket = await _context.Tickets
            .Include(t => t.Category)
            .Include(t => t.Subcategory)
            .Include(t => t.CreatedByUser)
            .Include(t => t.AssignedToUser)
            .Include(t => t.Technician)
            .FirstAsync(t => t.Id == ticket.Id);

        return MapToResponse(ticket, UserRole.Client);
    }

    public async Task<TicketResponse?> UpdateTicketAsync(Guid id, Guid userId, UserRole role, TicketUpdateRequest request)
    {
        var ticket = await _context.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null)
        {
            return null;
        }

        // Validate permission rules
        if (role == UserRole.Client && ticket.CreatedByUserId != userId)
        {
            return null;
        }
        if (role == UserRole.Technician && ticket.TechnicianId != userId && ticket.AssignedToUserId != userId)
        {
            return null;
        }

        var hasChanges = false;

        if (request.Description != null && role != UserRole.Technician)
        {
            ticket.Description = request.Description;
            hasChanges = true;
        }

        if (request.Priority.HasValue && role != UserRole.Technician)
        {
            ticket.Priority = request.Priority.Value;
            hasChanges = true;
        }

        if (request.Status.HasValue)
        {
            try
            {
                var statusResult = await ChangeStatusAsync(id, userId, request.Status.Value);
                if (statusResult == null)
                {
                    return null;
                }
            }
            catch (StatusChangeForbiddenException)
            {
                return null;
            }
        }

        if (role == UserRole.Admin)
        {
            if (request.AssignedToUserId.HasValue)
            {
                await UpdateAssignmentAsync(ticket, request.AssignedToUserId.Value, userId);
                hasChanges = true;
            }

            ticket.DueDate = request.DueDate;
            hasChanges = true;
        }

        if (hasChanges)
        {
            ticket.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }

        return await GetTicketAsync(id, userId, role);
    }

    public async Task<TicketResponse?> AssignTicketAsync(Guid id, Guid technicianId, Guid actorId)
    {
        var ticket = await _context.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null)
        {
            return null;
        }

        // Load technician to get UserId (required for AssignedToUserId foreign key)
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == technicianId);
        
        if (technician == null || technician.IsDeleted || !technician.IsActive || technician.UserId == null)
        {
            return null; // Technician not found or inactive
        }

        await UpdateAssignmentAsync(ticket, technician.UserId.Value, actorId, technicianId);

        // When assigning, set status to Open (not InProgress) - technician will change to InProgress when they start working
        await ChangeStatusAsync(id, actorId, TicketStatus.Open);

        ticket.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return await GetTicketAsync(id, actorId, UserRole.Admin);
    }

    public async Task<IEnumerable<TicketMessageDto>> GetMessagesAsync(Guid ticketId, Guid userId, UserRole role)
    {
        var ticket = await GetTicketAsync(ticketId, userId, role);
        if (ticket == null)
        {
            return Enumerable.Empty<TicketMessageDto>();
        }

        return await _context.TicketMessages
            .Include(m => m.AuthorUser)
            .Where(m => m.TicketId == ticketId)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new TicketMessageDto
            {
                Id = m.Id,
                AuthorUserId = m.AuthorUserId,
                AuthorName = m.AuthorUser!.FullName,
                AuthorEmail = m.AuthorUser.Email,
                Message = m.Message,
                CreatedAt = m.CreatedAt,
                Status = m.Status
            })
            .ToListAsync();
    }

    public async Task<TicketMessageDto?> AddMessageAsync(Guid ticketId, Guid authorId, string message, TicketStatus? status = null)
    {
        if (status.HasValue)
        {
            var statusResult = await ChangeStatusAsync(ticketId, authorId, status.Value);
            if (statusResult == null)
            {
                return null;
            }
        }

        return await AddReplyAsync(ticketId, authorId, message);
    }

    public async Task<TicketMessageDto?> AddReplyAsync(Guid ticketId, Guid authorId, string message)
    {
        var ticket = await _context.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null)
        {
            return null;
        }

        var author = await _context.Users.FirstOrDefaultAsync(u => u.Id == authorId);
        if (author == null)
        {
            return null;
        }

        if (!HasTicketAccess(ticket, author))
        {
            return null;
        }

        ticket.LastActivityAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        var ticketMessage = new TicketMessage
        {
            Id = Guid.NewGuid(),
            TicketId = ticketId,
            AuthorUserId = authorId,
            Message = message,
            CreatedAt = DateTime.UtcNow,
            Status = ticket.Status
        };

        _context.TicketMessages.Add(ticketMessage);
        CreateActivity(ticketId, author, TicketActivityType.ReplyAdded, $"{author.FullName} replied");

        await _context.SaveChangesAsync();

        var notifyUserId = ticket.AssignedToUserId == authorId ? ticket.CreatedByUserId : ticket.AssignedToUserId ?? ticket.CreatedByUserId;
        await _notificationService.CreateNotificationAsync(notifyUserId, $"New message on ticket '{ticket.Title}'");

        await BroadcastTicketUpdatedAsync(ticket, author, "ReplyAdded");

        return await _context.TicketMessages
            .Include(m => m.AuthorUser)
            .Where(m => m.Id == ticketMessage.Id)
            .Select(m => new TicketMessageDto
            {
                Id = m.Id,
                AuthorUserId = m.AuthorUserId,
                AuthorName = m.AuthorUser!.FullName,
                AuthorEmail = m.AuthorUser.Email,
                Message = m.Message,
                CreatedAt = m.CreatedAt,
                Status = m.Status
            })
            .FirstAsync();
    }

    public async Task<TicketResponse?> ChangeStatusAsync(Guid ticketId, Guid actorId, TicketStatus newStatus)
    {
        var ticket = await _context.Tickets.FirstOrDefaultAsync(t => t.Id == ticketId);
        if (ticket == null)
        {
            return null;
        }

        var actor = await _context.Users.FirstOrDefaultAsync(u => u.Id == actorId);
        if (actor == null)
        {
            return null;
        }

        if (!HasTicketAccess(ticket, actor))
        {
            return null;
        }

        ValidateStatusChange(actor, newStatus);

        if (ticket.Status == newStatus)
        {
            return await GetTicketAsync(ticketId, actorId, actor.Role);
        }

        var oldStatus = ticket.Status;
        ticket.Status = newStatus;
        ticket.LastActivityAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        CreateActivity(ticketId, actor, TicketActivityType.StatusChanged, $"Status changed from {oldStatus} to {newStatus}");
        await _context.SaveChangesAsync();

        await BroadcastTicketUpdatedAsync(ticket, actor, "StatusChanged");

        return await GetTicketAsync(ticketId, actorId, actor.Role);
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // MANUAL TEST CHECKLIST (Swagger):
    // 1. POST /api/Tickets → status=Submitted, assignedToUserId=null, assignedToName/email/phone=null
    // 2. POST /api/admin/assignment/smart/run → assignedCount > 0 (if eligible unassigned tickets exist)
    // 3. GET /api/technician/tickets (as assigned tech) → ticket appears in list
    // ═══════════════════════════════════════════════════════════════════════════════
    private static TicketResponse MapToResponse(
        Ticket ticket,
        UserRole role,
        IEnumerable<TicketMessageDto>? replies = null,
        IEnumerable<TicketActivityDto>? activities = null)
    {
        // SECURITY-CRITICAL: Only show assigned technician info when ticket is truly assigned
        // "Truly assigned" = AssignedToUserId is not null (the authoritative field for filtering/queries)
        var isAssigned = ticket.AssignedToUserId != null;
        var displayStatus = MapStatusForRole(ticket.Status, role);
        var assignedTechnicians = BuildAssignedTechnicians(ticket);
        
        return new TicketResponse
        {
            Id = ticket.Id,
            Title = ticket.Title,
            Description = ticket.Description,
            CategoryId = ticket.CategoryId,
            CategoryName = ticket.Category?.Name ?? string.Empty,
            SubcategoryId = ticket.SubcategoryId,
            SubcategoryName = ticket.Subcategory?.Name,
            Priority = ticket.Priority,
            Status = ticket.Status,
            CanonicalStatus = ticket.Status,
            DisplayStatus = displayStatus,
            LastActivityAt = ticket.LastActivityAt ?? ticket.UpdatedAt ?? ticket.CreatedAt,
            CreatedByUserId = ticket.CreatedByUserId,
            CreatedByName = ticket.CreatedByUser?.FullName ?? string.Empty,
            CreatedByEmail = ticket.CreatedByUser?.Email ?? string.Empty,
            CreatedByPhoneNumber = ticket.CreatedByUser?.PhoneNumber,
            CreatedByDepartment = ticket.CreatedByUser?.Department,
            AssignedToUserId = ticket.AssignedToUserId,
            // Only populate assigned fields when truly assigned
            AssignedToName = isAssigned ? (ticket.Technician?.FullName ?? ticket.AssignedToUser?.FullName) : null,
            AssignedToEmail = isAssigned ? (ticket.Technician?.Email ?? ticket.AssignedToUser?.Email) : null,
            AssignedToPhoneNumber = isAssigned ? (ticket.Technician?.Phone ?? ticket.AssignedToUser?.PhoneNumber) : null,
            AssignedTechnicianName = isAssigned ? (ticket.Technician?.FullName ?? ticket.AssignedToUser?.FullName) : null,
            AssignedTechnicians = assignedTechnicians,
            CreatedAt = ticket.CreatedAt,
            UpdatedAt = ticket.UpdatedAt,
            DueDate = ticket.DueDate,
            Replies = replies?.ToList() ?? new List<TicketMessageDto>(),
            Activities = activities?.ToList() ?? new List<TicketActivityDto>()
        };
    }

    private static TicketStatus MapStatusForRole(TicketStatus status, UserRole role)
    {
        return role == UserRole.Client && status == TicketStatus.Redo
            ? TicketStatus.InProgress
            : status;
    }

    private static List<AssignedTechnicianDto> BuildAssignedTechnicians(Ticket ticket)
    {
        if (ticket.AssignedToUserId == null)
        {
            return new List<AssignedTechnicianDto>();
        }

        var name = ticket.Technician?.FullName ?? ticket.AssignedToUser?.FullName ?? string.Empty;
        var email = ticket.Technician?.Email ?? ticket.AssignedToUser?.Email;

        return new List<AssignedTechnicianDto>
        {
            new()
            {
                UserId = ticket.AssignedToUserId.Value,
                Name = name,
                Email = email
            }
        };
    }

    private static bool HasTicketAccess(Ticket ticket, User actor)
    {
        if (actor.Role == UserRole.Client)
        {
            return ticket.CreatedByUserId == actor.Id;
        }

        if (actor.Role == UserRole.Technician)
        {
            return ticket.TechnicianId == actor.Id || ticket.AssignedToUserId == actor.Id;
        }

        return true;
    }

    private static void ValidateStatusChange(User actor, TicketStatus newStatus)
    {
        if (actor.Role == UserRole.Client)
        {
            if (newStatus == TicketStatus.InProgress ||
                newStatus == TicketStatus.AnsweredSolved ||
                newStatus == TicketStatus.Redo)
            {
                throw new StatusChangeForbiddenException("Clients cannot set status to InProgress, AnsweredSolved, or Redo.");
            }
        }
    }

    private void CreateActivity(Guid ticketId, User actor, TicketActivityType type, string message)
    {
        var activity = new TicketActivity
        {
            Id = Guid.NewGuid(),
            TicketId = ticketId,
            ActorUserId = actor.Id,
            Type = type,
            Message = message,
            CreatedAt = DateTime.UtcNow
        };

        _context.TicketActivities.Add(activity);
    }

    private async Task BroadcastTicketUpdatedAsync(Ticket ticket, User actor, string updateType)
    {
        var payload = new TicketUpdatedEvent
        {
            TicketId = ticket.Id,
            CanonicalStatus = ticket.Status,
            DisplayStatusByRole = new Dictionary<string, TicketStatus>
            {
                { nameof(UserRole.Client), MapStatusForRole(ticket.Status, UserRole.Client) },
                { nameof(UserRole.Technician), MapStatusForRole(ticket.Status, UserRole.Technician) },
                { nameof(UserRole.Admin), MapStatusForRole(ticket.Status, UserRole.Admin) }
            },
            LastActivityAt = ticket.LastActivityAt ?? ticket.UpdatedAt ?? ticket.CreatedAt,
            UpdateType = updateType,
            ActorName = actor.FullName,
            ActorRole = actor.Role.ToString()
        };

        var groupName = $"ticket:{ticket.Id}";
        var targetUserIds = new HashSet<Guid> { ticket.CreatedByUserId };
        if (ticket.AssignedToUserId.HasValue)
        {
            targetUserIds.Add(ticket.AssignedToUserId.Value);
        }

        try
        {
            await _ticketHub.Clients.Group(groupName).SendAsync("TicketUpdated", payload);

            foreach (var userId in targetUserIds)
            {
                await _ticketHub.Clients.Group($"user:{userId}").SendAsync("TicketUpdated", payload);
            }

            await _ticketHub.Clients.Group("role:Admin").SendAsync("TicketUpdated", payload);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to broadcast TicketUpdated for TicketId={TicketId}", ticket.Id);
        }
    }

    private async Task UpdateAssignmentAsync(Ticket ticket, Guid assignedUserId, Guid actorId, Guid? technicianIdOverride = null)
    {
        if (ticket.AssignedToUserId == assignedUserId && ticket.TechnicianId == technicianIdOverride)
        {
            return;
        }

        var actor = await _context.Users.FirstOrDefaultAsync(u => u.Id == actorId);
        if (actor == null)
        {
            return;
        }

        ticket.AssignedToUserId = assignedUserId;

        if (technicianIdOverride.HasValue)
        {
            ticket.TechnicianId = technicianIdOverride.Value;
        }
        else
        {
            var technician = await _context.Technicians.FirstOrDefaultAsync(t => t.UserId == assignedUserId && !t.IsDeleted);
            ticket.TechnicianId = technician?.Id;
        }

        ticket.LastActivityAt = DateTime.UtcNow;
        ticket.UpdatedAt = DateTime.UtcNow;

        CreateActivity(ticket.Id, actor, TicketActivityType.AssignmentChanged, $"Assigned to user {assignedUserId}");
        await _context.SaveChangesAsync();

        await BroadcastTicketUpdatedAsync(ticket, actor, "AssignmentChanged");
    }

    public async Task<IEnumerable<TicketCalendarResponse>> GetCalendarTicketsAsync(DateTime startDate, DateTime endDate)
    {
        // Get all tickets within the date range (Admin only - no role filtering)
        var tickets = await _context.Tickets
            .Include(t => t.Category)
            .Include(t => t.AssignedToUser)
            .Include(t => t.Technician)
            .Where(t => t.CreatedAt >= startDate && t.CreatedAt <= endDate)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();

        return tickets.Select(t => new TicketCalendarResponse
        {
            Id = t.Id,
            TicketNumber = $"T-{t.Id.ToString("N").Substring(0, 8).ToUpper()}",
            Title = t.Title,
            Status = MapStatusForRole(t.Status, UserRole.Admin),
            Priority = t.Priority,
            CategoryName = t.Category?.Name ?? string.Empty,
            // Only show technician name when truly assigned (AssignedToUserId != null)
            AssignedTechnicianName = t.AssignedToUserId != null ? (t.Technician?.FullName ?? t.AssignedToUser?.FullName) : null,
            CreatedAt = t.CreatedAt,
            DueDate = t.DueDate
        });
    }
}
