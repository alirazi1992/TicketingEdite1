using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ticketing.Backend.Domain.Entities;

namespace Ticketing.Backend.Infrastructure.Data.Configurations;

public class TicketActivityConfiguration : IEntityTypeConfiguration<TicketActivity>
{
    public void Configure(EntityTypeBuilder<TicketActivity> builder)
    {
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Message).IsRequired().HasMaxLength(500);
        builder.Property(a => a.Type).IsRequired();

        builder.HasOne(a => a.Ticket)
            .WithMany(t => t.Activities)
            .HasForeignKey(a => a.TicketId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(a => a.ActorUser)
            .WithMany()
            .HasForeignKey(a => a.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
