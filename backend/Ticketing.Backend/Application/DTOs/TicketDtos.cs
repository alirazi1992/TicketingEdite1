using Ticketing.Backend.Domain.Enums;

namespace Ticketing.Backend.Application.DTOs;

public class TicketCreateRequest
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public int? SubcategoryId { get; set; }
    public TicketPriority Priority { get; set; }
}

public class TicketUpdateRequest
{
    public TicketStatus? Status { get; set; }
    public TicketPriority? Priority { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public DateTime? DueDate { get; set; }
    public string? Description { get; set; }
}

public class TicketResponse
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int CategoryId { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public int? SubcategoryId { get; set; }
    public string? SubcategoryName { get; set; }
    public TicketPriority Priority { get; set; }
    public TicketStatus Status { get; set; }
    public TicketStatus CanonicalStatus { get; set; }
    public TicketStatus DisplayStatus { get; set; }
    public DateTime? LastActivityAt { get; set; }
    public Guid CreatedByUserId { get; set; }
    public string CreatedByName { get; set; } = string.Empty;
    public string CreatedByEmail { get; set; } = string.Empty;
    public string? CreatedByPhoneNumber { get; set; }
    public string? CreatedByDepartment { get; set; }
    public Guid? AssignedToUserId { get; set; }
    public string? AssignedToName { get; set; }
    public string? AssignedToEmail { get; set; }
    public string? AssignedToPhoneNumber { get; set; }
    public string? AssignedTechnicianName { get; set; }
    public List<AssignedTechnicianDto> AssignedTechnicians { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? DueDate { get; set; }
    public List<TicketMessageDto> Replies { get; set; } = new();
    public List<TicketActivityDto> Activities { get; set; } = new();
}

public class TicketMessageRequest
{
    public string Message { get; set; } = string.Empty;
    public TicketStatus? Status { get; set; }
}

public class TicketMessageDto
{
    public Guid Id { get; set; }
    public Guid AuthorUserId { get; set; }
    public string AuthorName { get; set; } = string.Empty;
    public string AuthorEmail { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public TicketStatus? Status { get; set; }
}

public class TicketActivityDto
{
    public Guid Id { get; set; }
    public Guid ActorUserId { get; set; }
    public string ActorName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
    public TicketActivityType Type { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class AssignedTechnicianDto
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Email { get; set; }
}

public class TicketUpdatedEvent
{
    public Guid TicketId { get; set; }
    public TicketStatus CanonicalStatus { get; set; }
    public Dictionary<string, TicketStatus> DisplayStatusByRole { get; set; } = new();
    public DateTime? LastActivityAt { get; set; }
    public string UpdateType { get; set; } = string.Empty;
    public string ActorName { get; set; } = string.Empty;
    public string ActorRole { get; set; } = string.Empty;
}

public class TicketCalendarResponse
{
    public Guid Id { get; set; }
    public string TicketNumber { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public TicketStatus Status { get; set; }
    public TicketPriority Priority { get; set; }
    public string CategoryName { get; set; } = string.Empty;
    public string? AssignedTechnicianName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? DueDate { get; set; }
}

public class AssignTechnicianRequest
{
    public Guid TechnicianId { get; set; }
}
