<<<<<<< HEAD
# TIQ - Ticketing System

A full-stack ticketing system with Next.js frontend and .NET backend.

## Project Structure

```
TIQ/
├── frontend/          # Next.js frontend application
├── backend/           # .NET backend API
│   └── Ticketing.Backend/
└── Ticketing_FinalVersion-.sln  # .NET solution file
```

## Prerequisites

### Frontend
- Node.js 18+ and npm (or pnpm/yarn)
- Next.js 14+

### Backend
- .NET 8 SDK
- SQLite (bundled with .NET provider)

## Getting Started

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. Create environment file (optional, defaults to `http://localhost:5000`):
   ```bash
   # Create frontend/.env.local
   NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:3000`.

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend/Ticketing.Backend
   ```

2. Restore dependencies:
   ```bash
   dotnet restore
   ```

3. Run the API:
   ```bash
   dotnet run
   ```

The backend API will be available at:
- HTTP: `http://localhost:5000`
- HTTPS: `https://localhost:7000`

## Default Test Users

- **Admin**: `admin@test.com` / `Admin123!`
- **Technician**: `tech1@test.com` / `Tech123!`
- **Client**: `client1@test.com` / `Client123!`

## Environment Variables

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

### Backend (`backend/Ticketing.Backend/appsettings.json`)

The backend configuration is stored in `appsettings.json`. For production, set the `JWT_SECRET` environment variable.

## Development

### Running Both Services

1. **Terminal 1** - Backend:
   ```bash
   cd backend/Ticketing.Backend
   dotnet run
   ```

2. **Terminal 2** - Frontend:
   ```bash
   cd frontend
   npm run dev
   ```

### Building

**Frontend:**
```bash
cd frontend
npm run build
```

**Backend:**
```bash
cd backend/Ticketing.Backend
dotnet build
```

## Ports

- Frontend: `3000` (default)
- Backend HTTP: `5000`
- Backend HTTPS: `7000`

## Technology Stack

### Frontend
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Shadcn/ui components
- React Hook Form
- Yup validation

### Backend
- ASP.NET Core 8
- Entity Framework Core
- SQLite
- JWT Authentication
- Swagger/OpenAPI

## Notes

- The backend database is automatically migrated and seeded on startup
- CORS is configured to allow requests from `http://localhost:3000`
- Build artifacts (`.next/`, `node_modules/`, `bin/`, `obj/`) are gitignored
=======
# TicketingEdite1
>>>>>>> c8ad6a162c19793f77146914a01f1312f4fdbb32
