using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ticketing.Backend.Application.DTOs;
using Ticketing.Backend.Application.Services;
using Ticketing.Backend.Domain.Enums;

namespace Ticketing.Backend.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TicketsController : ControllerBase
{
    private readonly ITicketService _ticketService;
    private readonly ILogger<TicketsController> _logger;

    public TicketsController(ITicketService ticketService, ILogger<TicketsController> logger)
    {
        _ticketService = ticketService;
        _logger = logger;
    }

    private (Guid userId, UserRole role)? GetUserContext()
    {
        // Read the user id and role that were embedded into the JWT at login time
        var idValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleValue = User.FindFirstValue(ClaimTypes.Role);
        if (Guid.TryParse(idValue, out var userId) && Enum.TryParse<UserRole>(roleValue, out var role))
        {
            return (userId, role);
        }
        return null;
    }

    [HttpGet]
    public async Task<IActionResult> GetTickets([FromQuery] TicketStatus? status, [FromQuery] TicketPriority? priority, [FromQuery] Guid? assignedTo, [FromQuery] Guid? createdBy, [FromQuery] string? search)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        // Service method applies role-based filtering (clients see their own tickets, technicians see assignments)
        var tickets = await _ticketService.GetTicketsAsync(context.Value.userId, context.Value.role, status, priority, assignedTo, createdBy, search);
        return Ok(tickets);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetTicket(Guid id)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        var ticket = await _ticketService.GetTicketAsync(id, context.Value.userId, context.Value.role);
        if (ticket == null)
        {
            return NotFound();
        }
        return Ok(ticket);
    }

    [HttpPost]
    [Authorize(Roles = nameof(UserRole.Client))]
    public async Task<IActionResult> CreateTicket(TicketCreateRequest request)
    {
        if (!ModelState.IsValid)
        {
            _logger.LogWarning("Invalid ticket create request: {@ModelState}", ModelState);
            return BadRequest(ModelState);
        }

        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        try
        {
            // Create a new ticket as the current client user
            var ticket = await _ticketService.CreateTicketAsync(context.Value.userId, request);
            _logger.LogInformation("Ticket created {@TicketId} by user {@UserId}", ticket?.Id, context.Value.userId);
            return CreatedAtAction(nameof(GetTicket), new { id = ticket!.Id }, ticket);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create ticket for user {UserId}", context.Value.userId);
            return StatusCode(500, "Failed to create ticket");
        }
    }

    [HttpPatch("{id}")]
    public async Task<IActionResult> UpdateTicket(Guid id, TicketUpdateRequest request)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        var ticket = await _ticketService.UpdateTicketAsync(id, context.Value.userId, context.Value.role, request);
        if (ticket == null)
        {
            return Forbid();
        }
        return Ok(ticket);
    }

    [HttpPut("{id}/assign-technician")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> AssignTechnician(Guid id, [FromBody] AssignTechnicianRequest request)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        var ticket = await _ticketService.AssignTicketAsync(id, request.TechnicianId, context.Value.userId);
        if (ticket == null)
        {
            return BadRequest("Ticket not found or technician is inactive");
        }
        return Ok(ticket);
    }

    [HttpPost("{id}/assign")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    [Obsolete("Use PUT /api/tickets/{id}/assign-technician instead")]
    public async Task<IActionResult> AssignTicket(Guid id, [FromBody] Guid technicianId)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        var ticket = await _ticketService.AssignTicketAsync(id, technicianId, context.Value.userId);
        if (ticket == null)
        {
            return NotFound();
        }
        return Ok(ticket);
    }

    [HttpGet("{id}/messages")]
    public async Task<IActionResult> GetMessages(Guid id)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        var messages = await _ticketService.GetMessagesAsync(id, context.Value.userId, context.Value.role);
        return Ok(messages);
    }

    [HttpPost("{id}/messages")]
    public async Task<IActionResult> AddMessage(Guid id, [FromBody] TicketMessageRequest request)
    {
        var context = GetUserContext();
        if (context == null)
        {
            return Unauthorized();
        }

        try
        {
            var message = await _ticketService.AddMessageAsync(id, context.Value.userId, request.Message, request.Status);
            if (message == null)
            {
                return NotFound();
            }
            return Ok(message);
        }
        catch (StatusChangeForbiddenException ex)
        {
            return StatusCode(403, new { message = ex.Message, error = "STATUS_CHANGE_FORBIDDEN" });
        }
    }

    /// <summary>
    /// Get tickets for calendar view (Admin only)
    /// </summary>
    [HttpGet("calendar")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public async Task<IActionResult> GetCalendarTickets([FromQuery] string start, [FromQuery] string end)
    {
        if (!DateTime.TryParse(start, out var startDate) || !DateTime.TryParse(end, out var endDate))
        {
            return BadRequest("Invalid date format. Use YYYY-MM-DD");
        }

        // Ensure end date includes the full day
        endDate = endDate.Date.AddDays(1).AddTicks(-1);

        var tickets = await _ticketService.GetCalendarTicketsAsync(startDate, endDate);
        return Ok(tickets);
    }
}
