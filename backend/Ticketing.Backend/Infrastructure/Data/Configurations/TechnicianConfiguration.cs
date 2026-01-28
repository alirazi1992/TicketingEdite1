using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ticketing.Backend.Domain.Entities;

namespace Ticketing.Backend.Infrastructure.Data.Configurations;

public class TechnicianConfiguration : IEntityTypeConfiguration<Technician>
{
    public void Configure(EntityTypeBuilder<Technician> builder)
    {
        builder.HasKey(t => t.Id);

        builder.Property(t => t.FullName)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(t => t.Email)
            .IsRequired()
            .HasMaxLength(200);

        builder.HasIndex(t => t.Email)
            .IsUnique();

        builder.Property(t => t.Phone)
            .HasMaxLength(20);

        builder.Property(t => t.Department)
            .HasMaxLength(100);

        builder.Property(t => t.IsActive)
            .IsRequired()
            .HasDefaultValue(true);

        builder.Property(t => t.IsDeleted)
            .IsRequired()
            .HasDefaultValue(false);

        builder.Property(t => t.DeletedAt);

        builder.Property(t => t.DeletedByUserId);

        builder.Property(t => t.CreatedAt)
            .IsRequired();

        // Relationship with User (optional)
        builder.HasOne(t => t.User)
            .WithMany()
            .HasForeignKey(t => t.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        // Relationship with Tickets
        builder.HasMany(t => t.AssignedTickets)
            .WithOne(t => t.Technician)
            .HasForeignKey(t => t.TechnicianId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
