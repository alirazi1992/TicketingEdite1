using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Ticketing.Backend.Application.DTOs;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;
using Ticketing.Backend.Infrastructure.Auth;
using Ticketing.Backend.Infrastructure.Data;

namespace Ticketing.Backend.Application.Services;

public interface IUserService
{
    // Main register method used by AuthController (with creatorRole)
    Task<AuthResponse?> RegisterAsync(RegisterRequest request, UserRole creatorRole);

    // Convenience overload (self-register: treated as Client)
    Task<AuthResponse?> RegisterAsync(RegisterRequest request);

    Task<AuthResponse?> LoginAsync(LoginRequest request);
    Task<UserDto?> GetByIdAsync(Guid id);
    Task<IEnumerable<UserDto>> GetAllAsync();
    Task<IEnumerable<UserDto>> GetTechniciansAsync();
    Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileRequest request);
    Task<(bool Success, string? ErrorMessage)> ChangePasswordAsync(Guid userId, string currentPassword, string newPassword, string confirmNewPassword);
}

public class UserService : IUserService
{
    private readonly AppDbContext _context;
    private readonly IJwtTokenGenerator _jwtTokenGenerator;
    private readonly IPasswordHasher<User> _passwordHasher;

    public UserService(
        AppDbContext context,
        IJwtTokenGenerator jwtTokenGenerator,
        IPasswordHasher<User> passwordHasher)
    {
        _context = context;
        _jwtTokenGenerator = jwtTokenGenerator;
        _passwordHasher = passwordHasher;
    }

    /// <summary>
    /// Convenience overload for self-registration (assumes non-Admin creator)
    /// SECURITY: This method requires explicit role in request - no defaults applied
    /// </summary>
    public Task<AuthResponse?> RegisterAsync(RegisterRequest request)
    {
        // For self-register scenarios, creator is treated as non-Admin
        // Role enforcement happens in the main RegisterAsync method
        return RegisterAsync(request, UserRole.Client);
    }

    /// <summary>
    /// SECURITY-CRITICAL: Main registration method with explicit role enforcement
    /// 
    /// Role Security Rules (ENFORCED STRICTLY - NO EXCEPTIONS):
    /// 1. request.Role is ALWAYS persisted exactly as provided (NO silent overrides, NO defaults)
    /// 2. Database User.Role field MUST match request.Role exactly (no transformations)
    /// 3. Admin role creation authorization:
    ///    a) ALLOWED if: This is the first user (bootstrap scenario), OR
    ///    b) ALLOWED if: creatorRole == UserRole.Admin
    ///    c) FORBIDDEN otherwise (returns null → HTTP 403 in controller)
    /// 4. Invalid role enum values return null (→ HTTP 400 in controller)
    /// 5. Email conflicts return null (→ HTTP 409 in controller)
    /// 
    /// CRITICAL: This method NEVER modifies request.Role - it is persisted exactly as received
    /// </summary>
    public async Task<AuthResponse?> RegisterAsync(RegisterRequest request, UserRole creatorRole)
    {
        var normalizedEmail = request.Email.ToLowerInvariant();

        // SECURITY-CRITICAL: Role MUST be explicitly provided (cannot be null)
        // This is a defense-in-depth check (controller should validate first)
        if (!request.Role.HasValue)
        {
            // Role not provided - return null to trigger HTTP 400 in controller
            return null;
        }

        // SECURITY-CRITICAL: Validate role is a valid enum value
        // This prevents invalid integer values or corrupted data from being persisted
        var role = request.Role.Value;
        if (!Enum.IsDefined(typeof(UserRole), role))
        {
            // Invalid role enum value - return null to trigger HTTP 400 in controller
            return null;
        }

        // 1) SECURITY: Check email uniqueness (required for user identification)
        var exists = await _context.Users.AnyAsync(u => u.Email == normalizedEmail);
        if (exists)
        {
            // Email conflict - return null to trigger HTTP 409 in controller
            return null;
        }

        // 2) SECURITY-CRITICAL: Enforce Admin role creation authorization rules
        var hasAnyUsers = await _context.Users.AnyAsync();
        var isBootstrap = !hasAnyUsers;
        var isAdminRequest = role == UserRole.Admin;
        var isCreatorAdmin = creatorRole == UserRole.Admin;

        // Admin role can ONLY be created if:
        // - Bootstrap scenario (first user in system), OR
        // - Creator is authenticated Admin
        // Any other attempt is a SECURITY VIOLATION
        if (isAdminRequest && !isBootstrap && !isCreatorAdmin)
        {
            // SECURITY VIOLATION: Admin role requested without authorization
            // Return null to trigger HTTP 403 in controller
            return null;
        }

        // 3) SECURITY-CRITICAL: Create user with role EXACTLY as provided in request
        // NO modifications, NO overrides, NO defaults, NO transformations
        // User.Role MUST equal request.Role.Value exactly
        var user = new User
        {
            Id = Guid.NewGuid(),
            FullName = request.FullName,
            Email = normalizedEmail,
            Role = role, // EXACT role from request (validated above) - CRITICAL: no modifications allowed
            PhoneNumber = request.PhoneNumber,
            Department = request.Department,
            CreatedAt = DateTime.UtcNow
        };

        // 4) Hash password securely
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        // 5) Persist user to database (Role will be stored exactly as request.Role)
        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        // 6) SECURITY: Generate JWT token with role claim from persisted user.Role
        // Token generation uses user.Role (which equals request.Role) - no hardcoding
        return new AuthResponse
        {
            Token = _jwtTokenGenerator.GenerateToken(user),
            User = MapToDto(user)
        };
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = request.Email.ToLowerInvariant();

        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Email == normalizedEmail);

        if (user == null)
        {
            return null;
        }

        var verifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verifyResult == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (user.Role == UserRole.Technician)
        {
            var technicianProfile = await _context.Technicians
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.UserId == user.Id);

            if (technicianProfile?.IsDeleted == true)
            {
                return null;
            }
        }

        return new AuthResponse
        {
            Token = _jwtTokenGenerator.GenerateToken(user),
            User = MapToDto(user)
        };
    }

    public async Task<UserDto?> GetByIdAsync(Guid id)
    {
        var user = await _context.Users.FindAsync(id);
        return user == null ? null : MapToDto(user);
    }

    public async Task<IEnumerable<UserDto>> GetAllAsync()
    {
        return await _context.Users
            .OrderBy(u => u.FullName)
            .Select(u => MapToDto(u))
            .ToListAsync();
    }

    public async Task<IEnumerable<UserDto>> GetTechniciansAsync()
    {
        return await _context.Users
            .Where(u => u.Role == UserRole.Technician)
            .GroupJoin(
                _context.Technicians,
                user => user.Id,
                technician => technician.UserId,
                (user, technicians) => new { user, technicians })
            .SelectMany(
                x => x.technicians.DefaultIfEmpty(),
                (x, technician) => new { x.user, technician })
            .Where(result => result.technician == null || !result.technician.IsDeleted)
            .OrderBy(result => result.user.FullName)
            .Select(result => MapToDto(result.user))
            .ToListAsync();
    }

    public async Task<UserDto?> UpdateProfileAsync(Guid userId, UpdateProfileRequest request)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return null;
        }

        if (!string.IsNullOrWhiteSpace(request.Email))
        {
            var normalizedEmail = request.Email.ToLowerInvariant();
            var emailInUse = await _context.Users.AnyAsync(u => u.Email == normalizedEmail && u.Id != userId);
            if (emailInUse)
            {
                return null;
            }

            user.Email = normalizedEmail;
        }

        if (!string.IsNullOrWhiteSpace(request.FullName))
        {
            user.FullName = request.FullName;
        }

        if (request.PhoneNumber != null)
        {
            user.PhoneNumber = request.PhoneNumber;
        }

        if (request.Department != null)
        {
            user.Department = request.Department;
        }

        if (request.AvatarUrl != null)
        {
            user.AvatarUrl = request.AvatarUrl;
        }

        await _context.SaveChangesAsync();
        return MapToDto(user);
    }

    public async Task<(bool Success, string? ErrorMessage)> ChangePasswordAsync(
        Guid userId, 
        string currentPassword, 
        string newPassword, 
        string confirmNewPassword)
    {
        // Validate new password matches confirmation
        if (newPassword != confirmNewPassword)
        {
            return (false, "رمز عبور جدید و تکرار آن مطابقت ندارند");
        }

        // Validate password complexity
        if (newPassword.Length < 8)
        {
            return (false, "رمز عبور جدید باید حداقل ۸ کاراکتر باشد");
        }

        if (!System.Text.RegularExpressions.Regex.IsMatch(newPassword, @"^(?=.*[a-zA-Z])(?=.*\d).+$"))
        {
            return (false, "رمز عبور جدید باید شامل حداقل یک حرف و یک عدد باشد");
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return (false, "کاربر یافت نشد");
        }

        // Verify current password
        var verifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, currentPassword);
        if (verifyResult == PasswordVerificationResult.Failed)
        {
            return (false, "رمز عبور فعلی اشتباه است");
        }

        // Check if new password is different from current by verifying it
        var newPasswordVerifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, newPassword);
        if (newPasswordVerifyResult != PasswordVerificationResult.Failed)
        {
            return (false, "رمز عبور جدید باید با رمز عبور فعلی متفاوت باشد");
        }

        // Update password
        user.PasswordHash = _passwordHasher.HashPassword(user, newPassword);
        await _context.SaveChangesAsync();
        return (true, null);
    }

    private static UserDto MapToDto(User user) => new()
    {
        Id = user.Id,
        FullName = user.FullName,
        Email = user.Email,
        Role = user.Role,
        PhoneNumber = user.PhoneNumber,
        Department = user.Department,
        AvatarUrl = user.AvatarUrl
    };
}
