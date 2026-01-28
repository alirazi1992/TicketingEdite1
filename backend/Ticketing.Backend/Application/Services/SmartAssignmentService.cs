using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;
using Ticketing.Backend.Infrastructure.Data;

namespace Ticketing.Backend.Application.Services;

public interface ISmartAssignmentService
{
    Task<Guid?> AssignTechnicianToTicketAsync(Guid ticketId, Guid actorId);
    Task<int> AssignUnassignedTicketsAsync(Guid actorId, DateTime? startDate = null, DateTime? endDate = null);
}

public class SmartAssignmentService : ISmartAssignmentService
{
    private readonly AppDbContext _context;
    private readonly ITicketService _ticketService;
    private readonly ILogger<SmartAssignmentService> _logger;

    public SmartAssignmentService(
        AppDbContext context,
        ITicketService ticketService,
        ILogger<SmartAssignmentService> logger)
    {
        _context = context;
        _ticketService = ticketService;
        _logger = logger;
    }

    /// <summary>
    /// Assigns a technician to a ticket using least-loaded active technician rule
    /// </summary>
    public async Task<Guid?> AssignTechnicianToTicketAsync(Guid ticketId, Guid actorId)
    {
        var ticket = await _context.Tickets
            .FirstOrDefaultAsync(t => t.Id == ticketId);

        if (ticket == null || ticket.TechnicianId != null)
        {
            return null; // Ticket not found or already assigned
        }

        // Get all active technicians that have a linked User account (UserId != null)
        // Technicians without UserId cannot be assigned - it would leave AssignedToUserId null
        var eligibleTechnicians = await _context.Technicians
            .Where(t => t.IsActive && !t.IsDeleted && t.UserId != null)
            .ToListAsync();

        if (eligibleTechnicians.Count == 0)
        {
            return null; // No eligible technicians available (active + linked to User)
        }

        // Calculate load for each technician (count of open/in-progress tickets)
        var technicianLoads = new List<(Guid TechnicianId, int LoadCount)>();

        foreach (var tech in eligibleTechnicians)
        {
            var loadCount = await _context.Tickets
                .CountAsync(t => 
                    t.TechnicianId == tech.Id && 
                    (t.Status == TicketStatus.Submitted ||
                     t.Status == TicketStatus.SeenRead ||
                     t.Status == TicketStatus.Open ||
                     t.Status == TicketStatus.InProgress ||
                     t.Status == TicketStatus.Redo));

            technicianLoads.Add((tech.Id, loadCount));
        }

        // Select least loaded technician (tie-break by earliest created technician)
        var selectedTechnician = technicianLoads
            .OrderBy(t => t.LoadCount)
            .ThenBy(t => t.TechnicianId) // Tie-break by ID (earliest)
            .First();

        // Load technician to get UserId for AssignedToUserId
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == selectedTechnician.TechnicianId);
        
        if (technician == null)
        {
            return null;
        }

        // CRITICAL: Technician MUST be linked to a User account for assignment to work
        // If UserId is null, skip this technician - assignment would leave ticket in broken state
        if (technician.UserId == null)
        {
            _logger.LogWarning(
                "SmartAssignment SKIPPED: Technician {TechnicianId} ({TechnicianName}) has no linked User account (UserId is null). Ticket {TicketId} remains unassigned.",
                technician.Id, technician.FullName, ticketId);
            return null; // Do NOT assign - ticket would remain unassigned in queries
        }

        var assignmentResult = await _ticketService.AssignTicketAsync(ticketId, selectedTechnician.TechnicianId, actorId);
        if (assignmentResult == null)
        {
            return null;
        }

        _logger.LogInformation(
            "SmartAssignment SUCCESS: Ticket {TicketId} assigned to Technician {TechnicianId} (UserId={UserId})",
            ticketId, technician.Id, technician.UserId);

        return selectedTechnician.TechnicianId;
    }

    /// <summary>
    /// Assigns all unassigned tickets within a date range (or all if no range specified)
    /// </summary>
    public async Task<int> AssignUnassignedTicketsAsync(Guid actorId, DateTime? startDate = null, DateTime? endDate = null)
    {
        var query = _context.Tickets
            .Where(t => t.TechnicianId == null)
            .AsQueryable();

        if (startDate.HasValue)
        {
            query = query.Where(t => t.CreatedAt >= startDate.Value);
        }

        if (endDate.HasValue)
        {
            query = query.Where(t => t.CreatedAt <= endDate.Value);
        }

        var unassignedTickets = await query.ToListAsync();
        int assignedCount = 0;

        foreach (var ticket in unassignedTickets)
        {
            var assignedTechnicianId = await AssignTechnicianToTicketAsync(ticket.Id, actorId);
            if (assignedTechnicianId != null)
            {
                assignedCount++;
            }
        }

        return assignedCount;
    }
}
