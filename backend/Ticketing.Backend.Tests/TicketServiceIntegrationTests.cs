using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Ticketing.Backend.Api.Hubs;
using Ticketing.Backend.Application.Services;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;
using Ticketing.Backend.Infrastructure.Data;
using Xunit;

namespace Ticketing.Backend.Tests;

public class TicketServiceIntegrationTests
{
    [Fact]
    public async Task TicketUpdatesBroadcastAndMapDisplayStatusPerRole()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        await using var context = new AppDbContext(options);

        var admin = new User { Id = Guid.NewGuid(), FullName = "Admin", Email = "admin@test.local", Role = UserRole.Admin, CreatedAt = DateTime.UtcNow };
        var client = new User { Id = Guid.NewGuid(), FullName = "Client", Email = "client@test.local", Role = UserRole.Client, CreatedAt = DateTime.UtcNow };
        var tech1 = new User { Id = Guid.NewGuid(), FullName = "Tech One", Email = "tech1@test.local", Role = UserRole.Technician, CreatedAt = DateTime.UtcNow };
        var tech2 = new User { Id = Guid.NewGuid(), FullName = "Tech Two", Email = "tech2@test.local", Role = UserRole.Technician, CreatedAt = DateTime.UtcNow };

        var techProfile1 = new Technician { Id = tech1.Id, FullName = tech1.FullName, Email = tech1.Email, UserId = tech1.Id, IsActive = true };
        var techProfile2 = new Technician { Id = tech2.Id, FullName = tech2.FullName, Email = tech2.Email, UserId = tech2.Id, IsActive = true };

        await context.Users.AddRangeAsync(admin, client, tech1, tech2);
        await context.Technicians.AddRangeAsync(techProfile1, techProfile2);

        var ticket = new Ticket
        {
            Id = Guid.NewGuid(),
            Title = "Printer issue",
            Description = "Printer is jammed",
            CategoryId = 1,
            Priority = TicketPriority.Medium,
            Status = TicketStatus.Submitted,
            CreatedByUserId = client.Id,
            CreatedAt = DateTime.UtcNow,
            LastActivityAt = DateTime.UtcNow
        };

        await context.Tickets.AddAsync(ticket);
        await context.SaveChangesAsync();

        var hubContext = new TestHubContext();
        var notificationService = new NotificationService(context);
        var technicianService = new TechnicianService(context, NullLogger<TechnicianService>.Instance);
        var systemSettingsService = new SystemSettingsService(context);
        var ticketService = new TicketService(
            context,
            notificationService,
            technicianService,
            systemSettingsService,
            hubContext,
            NullLogger<TicketService>.Instance);

        var assigned = await ticketService.AssignTicketAsync(ticket.Id, techProfile1.Id, admin.Id);
        Assert.NotNull(assigned);

        // Simulate a second assigned technician for multi-assignee validation in this test setup
        ticket.TechnicianId = techProfile2.Id;
        await context.SaveChangesAsync();

        var reply = await ticketService.AddReplyAsync(ticket.Id, tech2.Id, "Investigating the issue.");
        Assert.NotNull(reply);

        Assert.Contains(hubContext.Clients.GroupProxy.Sent, sent => sent.Method == "TicketUpdated" &&
            sent.Payload is Application.DTOs.TicketUpdatedEvent evt &&
            evt.UpdateType == "ReplyAdded");

        var tech1View = await ticketService.GetTicketAsync(ticket.Id, tech1.Id, UserRole.Technician);
        Assert.NotNull(tech1View);
        Assert.Contains(tech1View!.Replies, r => r.Message == "Investigating the issue.");

        var statusChange = await ticketService.ChangeStatusAsync(ticket.Id, admin.Id, TicketStatus.Redo);
        Assert.NotNull(statusChange);
        Assert.Equal(TicketStatus.Redo, statusChange!.CanonicalStatus);

        Assert.Contains(hubContext.Clients.GroupProxy.Sent, sent => sent.Method == "TicketUpdated" &&
            sent.Payload is Application.DTOs.TicketUpdatedEvent evt &&
            evt.UpdateType == "StatusChanged");

        var clientView = await ticketService.GetTicketAsync(ticket.Id, client.Id, UserRole.Client);
        Assert.NotNull(clientView);
        Assert.Equal(TicketStatus.InProgress, clientView!.DisplayStatus);
    }
}

public sealed class TestHubContext : IHubContext<TicketHub>
{
    public TestHubContext()
    {
        Clients = new TestHubClients();
        Groups = new TestGroupManager();
    }

    public IHubClients Clients { get; }
    public IGroupManager Groups { get; }
}

public sealed class TestHubClients : IHubClients
{
    public TestClientProxy GroupProxy { get; } = new();
    private readonly TestClientProxy _defaultProxy = new();

    public IClientProxy All => _defaultProxy;
    public IClientProxy Caller => _defaultProxy;
    public IClientProxy Others => _defaultProxy;
    public IClientProxy Client(string connectionId) => _defaultProxy;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _defaultProxy;
    public IClientProxy Group(string groupName) => GroupProxy;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => GroupProxy;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => GroupProxy;
    public IClientProxy OthersInGroup(string groupName) => GroupProxy;
    public IClientProxy User(string userId) => GroupProxy;
    public IClientProxy Users(IReadOnlyList<string> userIds) => GroupProxy;
}

public sealed class TestClientProxy : IClientProxy
{
    public List<SentEvent> Sent { get; } = new();

    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
    {
        Sent.Add(new SentEvent(method, args.FirstOrDefault()));
        return Task.CompletedTask;
    }
}

public sealed class TestGroupManager : IGroupManager
{
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        => Task.CompletedTask;

    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}

public record SentEvent(string Method, object? Payload);
