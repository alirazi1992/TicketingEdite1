using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Domain.Enums;

namespace Ticketing.Backend.Infrastructure.Data;

public static class SeedData
{
    public static async Task InitializeAsync(AppDbContext context, IPasswordHasher<User> passwordHasher)
    {
        // Ensure baseline users exist (idempotent)
        var userSeeds = new[]
        {
            new { FullName = "Admin User", Email = "admin@test.com", Role = UserRole.Admin, Password = "Admin123!", Phone = "+989000000000", Department = "IT" },
            new { FullName = "Tech One", Email = "tech1@test.com", Role = UserRole.Technician, Password = "Tech123!", Phone = "+989000000001", Department = "Field Support" },
            new { FullName = "Tech Two", Email = "tech2@test.com", Role = UserRole.Technician, Password = "Tech123!", Phone = "+989000000002", Department = "Network" },
            new { FullName = "Client One", Email = "client1@test.com", Role = UserRole.Client, Password = "Client123!", Phone = "+989000000010", Department = "Finance" },
            new { FullName = "Client Two", Email = "client2@test.com", Role = UserRole.Client, Password = "Client123!", Phone = "+989000000011", Department = "Sales" },
        };

        foreach (var seed in userSeeds)
        {
            var existing = await context.Users.FirstOrDefaultAsync(u => u.Email == seed.Email);
            if (existing == null)
            {
                var user = new User
                {
                    Id = Guid.NewGuid(),
                    FullName = seed.FullName,
                    Email = seed.Email,
                    Role = seed.Role,
                    PhoneNumber = seed.Phone,
                    Department = seed.Department,
                    CreatedAt = DateTime.UtcNow
                };
                user.PasswordHash = passwordHasher.HashPassword(user, seed.Password);
                context.Users.Add(user);
            }
        }

        await context.SaveChangesAsync();

        // Ensure technician profiles exist for technician users
        var technicianUsers = await context.Users
            .Where(u => u.Role == UserRole.Technician)
            .ToListAsync();

        foreach (var techUser in technicianUsers)
        {
            var existingTechnician = await context.Technicians
                .FirstOrDefaultAsync(t => t.UserId == techUser.Id || t.Email == techUser.Email);

            if (existingTechnician == null)
            {
                context.Technicians.Add(new Technician
                {
                    Id = Guid.NewGuid(),
                    FullName = techUser.FullName,
                    Email = techUser.Email,
                    Phone = techUser.PhoneNumber,
                    Department = techUser.Department,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UserId = techUser.Id
                });
            }
        }

        await context.SaveChangesAsync();

        // Align backend categories with frontend slugs
        var categorySeeds = new[]
        {
            new { Name = "Hardware", Description = "Laptops and peripherals", Subs = new[] { "Computer Not Working", "Printer Issues", "Monitor Problems" } },
            new { Name = "Software", Description = "OS and application issues", Subs = new[] { "OS Issues", "Application Problems", "Software Installation" } },
            new { Name = "Network", Description = "Connectivity and WiFi", Subs = new[] { "Internet Connection", "WiFi Problems", "Network Drive" } },
            new { Name = "Email", Description = "Mailbox and clients", Subs = new[] { "Email Not Working", "Email Setup", "Email Sync" } },
            new { Name = "Security", Description = "Passwords and threats", Subs = new[] { "Virus / Malware", "Password Reset", "Security Incident" } },
            new { Name = "Access", Description = "System access and permissions", Subs = new[] { "System Access", "Permission Change", "New Account" } },
        };

        foreach (var seed in categorySeeds)
        {
            var category = await context.Categories.Include(c => c.Subcategories)
                .FirstOrDefaultAsync(c => c.Name == seed.Name);

            if (category == null)
            {
                category = new Category
                {
                    Name = seed.Name,
                    Description = seed.Description,
                    Subcategories = seed.Subs.Select(s => new Subcategory { Name = s }).ToList()
                };
                context.Categories.Add(category);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(category.Description))
                {
                    category.Description = seed.Description;
                }

                var existingSubNames = category.Subcategories.Select(sc => sc.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
                foreach (var sub in seed.Subs)
                {
                    if (!existingSubNames.Contains(sub))
                    {
                        category.Subcategories.Add(new Subcategory { Name = sub });
                    }
                }
            }
        }

        await context.SaveChangesAsync();

        // Map category ids
        var hardware = await context.Categories.Include(c => c.Subcategories).FirstAsync(c => c.Name == "Hardware");
        var software = await context.Categories.Include(c => c.Subcategories).FirstAsync(c => c.Name == "Software");
        var network = await context.Categories.Include(c => c.Subcategories).FirstAsync(c => c.Name == "Network");

        // Map users (after ensured creation)
        var tech1 = await context.Users.FirstAsync(u => u.Email == "tech1@test.com");
        var tech2 = await context.Users.FirstAsync(u => u.Email == "tech2@test.com");
        var client1 = await context.Users.FirstAsync(u => u.Email == "client1@test.com");
        var client2 = await context.Users.FirstAsync(u => u.Email == "client2@test.com");

        var technicianProfiles = await context.Technicians.ToListAsync();
        var techProfile1 = technicianProfiles.FirstOrDefault(t => t.Email == tech1.Email);
        var techProfile2 = technicianProfiles.FirstOrDefault(t => t.Email == tech2.Email);

        if (!context.Tickets.Any())
        {
            var tickets = new List<Ticket>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "VPN not connecting",
                    Description = "Cannot connect to VPN on Windows 11",
                    CategoryId = network.Id,
                    SubcategoryId = network.Subcategories.First(sc => sc.Name == "Internet Connection").Id,
                    Priority = TicketPriority.High,
                    Status = TicketStatus.Submitted,
                    CreatedByUserId = client1.Id,
                    AssignedToUserId = tech1.Id,
                    TechnicianId = techProfile1?.Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-2)
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Printer jam on 3rd floor",
                    Description = "Paper jam keeps returning",
                    CategoryId = hardware.Id,
                    SubcategoryId = hardware.Subcategories.First(sc => sc.Name == "Printer Issues").Id,
                    Priority = TicketPriority.Medium,
                    Status = TicketStatus.InProgress,
                    CreatedByUserId = client2.Id,
                    AssignedToUserId = tech2.Id,
                    TechnicianId = techProfile2?.Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-1),
                    DueDate = DateTime.UtcNow.AddDays(2)
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Outlook keeps crashing",
                    Description = "Crashes when opening calendar",
                    CategoryId = software.Id,
                    SubcategoryId = software.Subcategories.First(sc => sc.Name == "Application Problems").Id,
                    Priority = TicketPriority.Critical,
                    Status = TicketStatus.InProgress,
                    CreatedByUserId = client1.Id,
                    AssignedToUserId = tech1.Id,
                    TechnicianId = techProfile1?.Id,
                    CreatedAt = DateTime.UtcNow.AddHours(-8)
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "Request new laptop",
                    Description = "Need new laptop for new hire",
                    CategoryId = hardware.Id,
                    SubcategoryId = hardware.Subcategories.First(sc => sc.Name == "Computer Not Working").Id,
                    Priority = TicketPriority.Low,
                    Status = TicketStatus.Open,
                    CreatedByUserId = client2.Id,
                    AssignedToUserId = tech2.Id,
                    TechnicianId = techProfile2?.Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-5)
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    Title = "WiFi drops in conference room",
                    Description = "Signal weak in conference area",
                    CategoryId = network.Id,
                    SubcategoryId = network.Subcategories.First(sc => sc.Name == "WiFi Problems").Id,
                    Priority = TicketPriority.High,
                    Status = TicketStatus.AnsweredSolved,
                    CreatedByUserId = client2.Id,
                    AssignedToUserId = tech1.Id,
                    TechnicianId = techProfile1?.Id,
                    CreatedAt = DateTime.UtcNow.AddDays(-3),
                    UpdatedAt = DateTime.UtcNow.AddDays(-1)
                }
            };

            context.Tickets.AddRange(tickets);
            await context.SaveChangesAsync();

            var messages = new List<TicketMessage>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    TicketId = tickets[0].Id,
                    AuthorUserId = client1.Id,
                    Message = "Issue started after update",
                    CreatedAt = DateTime.UtcNow.AddDays(-2),
                    Status = TicketStatus.Submitted
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TicketId = tickets[0].Id,
                    AuthorUserId = tech1.Id,
                    Message = "Checking logs and VPN client version",
                    CreatedAt = DateTime.UtcNow.AddDays(-1),
                    Status = TicketStatus.InProgress
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    TicketId = tickets[2].Id,
                    AuthorUserId = tech1.Id,
                    Message = "Reinstalling Office to fix crash",
                    CreatedAt = DateTime.UtcNow.AddHours(-6),
                    Status = TicketStatus.InProgress
                }
            };

            context.TicketMessages.AddRange(messages);

            var notifications = new List<Notification>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    UserId = tech1.Id,
                    Message = "New ticket assigned: VPN not connecting",
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow.AddDays(-2)
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    UserId = client1.Id,
                    Message = "Technician replied to your ticket",
                    IsRead = false,
                    CreatedAt = DateTime.UtcNow.AddDays(-1)
                }
            };

            context.Notifications.AddRange(notifications);
            await context.SaveChangesAsync();
        }

        // Ensure default system settings exist (idempotent)
        var existingSettings = await context.SystemSettings.FirstOrDefaultAsync(s => s.Id == 1);
        if (existingSettings == null)
        {
            var defaultSettings = new SystemSettings
            {
                Id = 1,
                AppName = "سامانه تیکتینگ",
                SupportEmail = "support@example.com",
                SupportPhone = "",
                DefaultLanguage = "fa",
                DefaultTheme = "system",
                Timezone = "Asia/Tehran",
                DefaultPriority = TicketPriority.Medium,
                DefaultStatus = TicketStatus.Submitted,
                ResponseSlaHours = 24,
                AutoAssignEnabled = false,
                AllowClientAttachments = true,
                MaxAttachmentSizeMB = 10,
                EmailNotificationsEnabled = true,
                SmsNotificationsEnabled = false,
                NotifyOnTicketCreated = true,
                NotifyOnTicketAssigned = true,
                NotifyOnTicketReplied = true,
                NotifyOnTicketClosed = true,
                PasswordMinLength = 6,
                Require2FA = false,
                SessionTimeoutMinutes = 60,
                AllowedEmailDomains = "[]",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            context.SystemSettings.Add(defaultSettings);
            await context.SaveChangesAsync();
        }
    }
}
