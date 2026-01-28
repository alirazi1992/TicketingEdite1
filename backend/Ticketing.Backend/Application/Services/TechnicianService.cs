using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Ticketing.Backend.Application.DTOs;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;
using Ticketing.Backend.Infrastructure.Data;

namespace Ticketing.Backend.Application.Services;

/// <summary>
/// Result of linking a Technician to a User account
/// </summary>
public enum LinkUserResult
{
    Success,
    TechnicianNotFound,
    UserNotFound,
    UserNotTechnicianRole,
    AlreadyLinked
}

public interface ITechnicianService
{
    Task<IEnumerable<TechnicianResponse>> GetAllTechniciansAsync(bool includeDeleted = false);
    Task<TechnicianResponse?> GetTechnicianByIdAsync(Guid id);
    Task<TechnicianResponse> CreateTechnicianAsync(TechnicianCreateRequest request);
    Task<TechnicianResponse?> UpdateTechnicianAsync(Guid id, TechnicianUpdateRequest request);
    Task<bool> UpdateTechnicianStatusAsync(Guid id, bool isActive);
    Task<bool> IsTechnicianActiveAsync(Guid id);
    Task<(bool found, bool alreadyDeleted)> SoftDeleteTechnicianAsync(Guid id, Guid? deletedByUserId);
    Task<(LinkUserResult result, TechnicianResponse? technician)> LinkUserAsync(Guid technicianId, Guid userId);
}

public class TechnicianService : ITechnicianService
{
    private readonly AppDbContext _context;
    private readonly ILogger<TechnicianService> _logger;

    public TechnicianService(AppDbContext context, ILogger<TechnicianService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<IEnumerable<TechnicianResponse>> GetAllTechniciansAsync(bool includeDeleted = false)
    {
        var techniciansQuery = _context.Technicians.AsQueryable();

        if (!includeDeleted)
        {
            techniciansQuery = techniciansQuery.Where(t => !t.IsDeleted);
        }

        var technicians = await techniciansQuery
            .OrderBy(t => t.FullName)
            .ToListAsync();

        return technicians.Select(MapToResponse);
    }

    public async Task<TechnicianResponse?> GetTechnicianByIdAsync(Guid id)
    {
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);

        return technician == null ? null : MapToResponse(technician);
    }

    public async Task<TechnicianResponse> CreateTechnicianAsync(TechnicianCreateRequest request)
    {
        var technician = new Technician
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName,
            Email = request.Email,
            Phone = request.Phone,
            Department = request.Department,
            IsActive = request.IsActive,
            CreatedAt = DateTime.UtcNow
        };

        _context.Technicians.Add(technician);
        await _context.SaveChangesAsync();

        return MapToResponse(technician);
    }

    public async Task<TechnicianResponse?> UpdateTechnicianAsync(Guid id, TechnicianUpdateRequest request)
    {
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);

        if (technician == null)
        {
            return null;
        }

        technician.FullName = request.FullName;
        technician.Email = request.Email;
        technician.Phone = request.Phone;
        technician.Department = request.Department;
        technician.IsActive = request.IsActive; // Update IsActive status

        await _context.SaveChangesAsync();

        return MapToResponse(technician);
    }

    public async Task<bool> UpdateTechnicianStatusAsync(Guid id, bool isActive)
    {
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);

        if (technician == null)
        {
            return false;
        }

        technician.IsActive = isActive;
        await _context.SaveChangesAsync();

        return true;
    }

    public async Task<bool> IsTechnicianActiveAsync(Guid id)
    {
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);

        return technician != null && technician.IsActive;
    }

    public async Task<(bool found, bool alreadyDeleted)> SoftDeleteTechnicianAsync(Guid id, Guid? deletedByUserId)
    {
        var technician = await _context.Technicians
            .FirstOrDefaultAsync(t => t.Id == id);

        if (technician == null)
        {
            return (false, false);
        }

        if (technician.IsDeleted)
        {
            return (true, true);
        }

        technician.IsDeleted = true;
        technician.DeletedAt = DateTime.UtcNow;
        technician.DeletedByUserId = deletedByUserId;
        technician.IsActive = false;

        await _context.SaveChangesAsync();

        return (true, false);
    }

    /// <summary>
    /// Links a Technician record to a User account (Admin-only operation)
    /// </summary>
    public async Task<(LinkUserResult result, TechnicianResponse? technician)> LinkUserAsync(Guid technicianId, Guid userId)
    {
        _logger.LogInformation("LinkUser: Attempting to link Technician {TechnicianId} to User {UserId}", technicianId, userId);

        var technician = await _context.Technicians.FirstOrDefaultAsync(t => t.Id == technicianId && !t.IsDeleted);
        if (technician == null)
        {
            _logger.LogWarning("LinkUser FAILED: Technician {TechnicianId} not found", technicianId);
            return (LinkUserResult.TechnicianNotFound, null);
        }

        // Check if already linked
        if (technician.UserId != null)
        {
            _logger.LogWarning("LinkUser FAILED: Technician {TechnicianId} is already linked to User {ExistingUserId}", technicianId, technician.UserId);
            return (LinkUserResult.AlreadyLinked, null);
        }

        // Verify user exists and has Technician role
        // Use AsNoTracking for read-only check, then re-query if needed
        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            // Debug: Log all user IDs to help diagnose
            var allUserIds = await _context.Users.AsNoTracking().Select(u => new { u.Id, u.Email, u.Role }).ToListAsync();
            _logger.LogWarning("LinkUser FAILED: User {UserId} not found. Total users in DB: {Count}. Users: {@Users}", 
                userId, allUserIds.Count, allUserIds);
            return (LinkUserResult.UserNotFound, null);
        }

        if (user.Role != UserRole.Technician)
        {
            _logger.LogWarning("LinkUser FAILED: User {UserId} has role {Role}, expected Technician", userId, user.Role);
            return (LinkUserResult.UserNotTechnicianRole, null);
        }

        // Link technician to user
        technician.UserId = userId;
        await _context.SaveChangesAsync();

        _logger.LogInformation("LinkUser SUCCESS: Technician {TechnicianId} linked to User {UserId} ({UserEmail})", 
            technicianId, userId, user.Email);

        return (LinkUserResult.Success, MapToResponse(technician));
    }

    private static TechnicianResponse MapToResponse(Technician technician) => new()
    {
        Id = technician.Id,
        FullName = technician.FullName,
        Email = technician.Email,
        Phone = technician.Phone,
        Department = technician.Department,
        IsActive = technician.IsActive,
        CreatedAt = technician.CreatedAt,
        UserId = technician.UserId // For debugging: null = cannot be assigned
    };
}
