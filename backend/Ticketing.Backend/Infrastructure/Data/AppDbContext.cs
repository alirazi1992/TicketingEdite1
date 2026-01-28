using Microsoft.EntityFrameworkCore;
using Ticketing.Backend.Domain.Entities;

namespace Ticketing.Backend.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketMessage> TicketMessages => Set<TicketMessage>();
    public DbSet<TicketActivity> TicketActivities => Set<TicketActivity>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Subcategory> Subcategories => Set<Subcategory>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<SystemSettings> SystemSettings => Set<SystemSettings>();
    public DbSet<UserPreferences> UserPreferences => Set<UserPreferences>();
    public DbSet<Technician> Technicians => Set<Technician>();

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
    }
}
