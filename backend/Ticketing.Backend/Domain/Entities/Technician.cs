namespace Ticketing.Backend.Domain.Entities;

public class Technician
{
    public Guid Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Department { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }
    public Guid? DeletedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid? UserId { get; set; } // Link to User for authentication

    // Navigation properties
    public User? User { get; set; }
    public ICollection<Ticket> AssignedTickets { get; set; } = new List<Ticket>();
}
