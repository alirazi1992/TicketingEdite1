using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Ticketing.Backend.Application.Services;
using Ticketing.Backend.Domain.Entities;
using Ticketing.Backend.Infrastructure.Auth;
using Ticketing.Backend.Infrastructure.Data;

var builder = WebApplication.CreateBuilder(args);

// =======================
// JWT configuration
// =======================
var jwtSettings = new JwtSettings();
builder.Configuration.GetSection("Jwt").Bind(jwtSettings);

// Fallback secret for local development
if (string.IsNullOrWhiteSpace(jwtSettings.Secret))
{
    jwtSettings.Secret =
        builder.Configuration["JWT_SECRET"] ?? "SuperSecretDevelopmentKey!ChangeMe";
}

builder.Services.AddSingleton(jwtSettings);

// =======================
// DbContext (SQLite) - DETERMINISTIC PATH
// =======================
// Resolve SQLite DB path to an absolute path based on ContentRoot
// This ensures the same DB file is used regardless of working directory
var sqliteDbPath = ResolveSqliteDbPath(builder.Configuration, builder.Environment.ContentRootPath);
var sqliteConnectionString = $"Data Source={sqliteDbPath}";

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlite(sqliteConnectionString);
    options.EnableDetailedErrors(builder.Environment.IsDevelopment());
    options.EnableSensitiveDataLogging(builder.Environment.IsDevelopment());
    options.LogTo(Console.WriteLine, LogLevel.Error);
});

// Log resolved path at startup (safe: no secrets)
Console.WriteLine($"[STARTUP] Resolved SQLite DB Path: {sqliteDbPath}");
Console.WriteLine($"[STARTUP] Content Root: {builder.Environment.ContentRootPath}");
Console.WriteLine($"[STARTUP] SQLite DB Exists: {File.Exists(sqliteDbPath)}");

// Helper: Resolve SQLite DB path to absolute path under ContentRoot
static string ResolveSqliteDbPath(IConfiguration config, string contentRoot)
{
    var connectionString = config.GetConnectionString("DefaultConnection");
    
    // Default relative path if not configured
    var relativePath = "ticketing.db";
    
    if (!string.IsNullOrWhiteSpace(connectionString))
    {
        // Extract file path from "Data Source=<path>" format
        var dataSourcePrefix = "Data Source=";
        if (connectionString.StartsWith(dataSourcePrefix, StringComparison.OrdinalIgnoreCase))
        {
            var extractedPath = connectionString.Substring(dataSourcePrefix.Length).Trim();
            if (!string.IsNullOrWhiteSpace(extractedPath))
            {
                relativePath = extractedPath;
            }
        }
    }
    
    // If already absolute, use as-is
    if (Path.IsPathRooted(relativePath))
    {
        var directory = Path.GetDirectoryName(relativePath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }
        return relativePath;
    }
    
    // Convert relative path to absolute under ContentRoot
    var absolutePath = Path.Combine(contentRoot, relativePath);
    var absoluteDirectory = Path.GetDirectoryName(absolutePath);
    
    // Ensure directory exists
    if (!string.IsNullOrEmpty(absoluteDirectory) && !Directory.Exists(absoluteDirectory))
    {
        Directory.CreateDirectory(absoluteDirectory);
    }
    
    return absolutePath;
}

// =======================
// Application services
// =======================
builder.Services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<ICategoryService, CategoryService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<ITicketService, TicketService>();
builder.Services.AddScoped<ISystemSettingsService, SystemSettingsService>();
builder.Services.AddScoped<IUserPreferencesService, UserPreferencesService>();
builder.Services.AddScoped<ISmartAssignmentService, SmartAssignmentService>();
builder.Services.AddScoped<ITechnicianService, TechnicianService>();

// =======================
// Authentication / JWT
// =======================
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidAudience = jwtSettings.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(jwtSettings.Secret))
    };

    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;

            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/ticket"))
            {
                context.Token = accessToken;
            }

            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// =======================
// CORS
// =======================
var allowedCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ??
    new[]
    {
        "http://localhost:3000",
        "https://localhost:3000",
        "http://localhost:3001",
        "https://localhost:3001"
    };

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy
            .WithOrigins(allowedCorsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials());
});

// =======================
// MVC / JSON
// =======================
builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
    options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSignalR();

// =======================
// Swagger + JWT Configuration (SECURITY-CRITICAL)
// =======================
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Ticketing.Backend",
        Version = "v1"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Enter ONLY the JWT token. Swagger will add 'Bearer ' automatically."
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// =======================
// Apply migrations & seed
// =======================
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<AppDbContext>();
    var passwordHasher = services.GetRequiredService<IPasswordHasher<User>>();

    try
    {
        await context.Database.MigrateAsync();
        await SeedData.InitializeAsync(context, passwordHasher);
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
        logger.LogError(ex, "Database migration or seeding failed. Check connection string and file path.");
        throw;
    }
}

// =======================
// Middleware pipeline
// =======================
app.UseCors("Frontend");

// Always enable Swagger
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "Ticketing.Backend v1");
    c.RoutePrefix = "swagger";
});

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/ping", () => Results.Ok(new { message = "pong" }));

app.MapControllers();
app.MapHub<Ticketing.Backend.Api.Hubs.TicketHub>("/hubs/ticket");

app.Run();
