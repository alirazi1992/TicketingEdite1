using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Ticketing.Backend.Api.Hubs;

[Authorize]
public class TicketHub : Hub
{
    public async Task JoinTicketGroup(Guid ticketId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"ticket:{ticketId}");
    }

    public async Task LeaveTicketGroup(Guid ticketId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"ticket:{ticketId}");
    }

    public async Task JoinUserGroup()
    {
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrWhiteSpace(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");
        }
    }

    public async Task JoinRoleGroup(string role)
    {
        if (!string.IsNullOrWhiteSpace(role))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"role:{role}");
        }
    }

    public async Task LeaveRoleGroup(string role)
    {
        if (!string.IsNullOrWhiteSpace(role))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"role:{role}");
        }
    }
}
