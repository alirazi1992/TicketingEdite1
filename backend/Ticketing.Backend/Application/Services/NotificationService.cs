using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ticketing.Backend.Application.DTOs;
using Ticketing.Backend.Infrastructure.Data;

namespace Ticketing.Backend.Application.Services;

public interface INotificationService
{
    Task<IEnumerable<NotificationDto>> GetNotificationsAsync(Guid userId);
    Task<bool> MarkAsReadAsync(Guid notificationId, Guid userId);
    Task CreateNotificationAsync(Guid userId, string message);
}

public class NotificationService : INotificationService
{
    private readonly AppDbContext _context;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(AppDbContext context, ILogger<NotificationService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IEnumerable<NotificationDto>> GetNotificationsAsync(Guid userId)
    {
        _logger.LogDebug("GetNotificationsAsync: Fetching notifications for UserId={UserId}", userId);
        return await _context.Notifications
            .Where(n => n.UserId == userId)
            .OrderByDescending(n => n.CreatedAt)
            .Select(n => new NotificationDto
            {
                Id = n.Id,
                Message = n.Message,
                IsRead = n.IsRead,
                CreatedAt = n.CreatedAt
            })
            .ToListAsync();
    }

    public async Task<bool> MarkAsReadAsync(Guid notificationId, Guid userId)
    {
        var notification = await _context.Notifications.FirstOrDefaultAsync(n => n.Id == notificationId && n.UserId == userId);
        if (notification == null)
        {
            return false;
        }

        notification.IsRead = true;
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task CreateNotificationAsync(Guid userId, string message)
    {
        var notification = new Domain.Entities.Notification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Message = message,
            IsRead = false,
            CreatedAt = DateTime.UtcNow
        };

        _context.Notifications.Add(notification);
        await _context.SaveChangesAsync();
    }
}
