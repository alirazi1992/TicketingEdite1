// lib/api-client.ts
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:5000";

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.warn(
    `[apiRequest] NEXT_PUBLIC_API_BASE_URL not set; defaulting to ${API_BASE_URL}.`
  );
}
const NOTIFICATION_CACHE_TTL_MS = 60000;
const notificationCache = new Map<
  string,
  { timestamp: number; data?: unknown; promise?: Promise<unknown> }
>();

interface ApiRequestOptions {
  method?: string;
  token?: string | null;
  body?: unknown;
  silent?: boolean; // If true, suppress console.error on non-2xx responses (still throws error)
}

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const { method = "GET", token, body, silent = false } = options;

  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const isNotificationsRequest =
    method === "GET" &&
    (path.startsWith("/api/notifications") || path.startsWith("api/notifications"));

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const executeRequest = async (): Promise<TResponse> => {
    // Log the full resolved URL for debugging (this is critical for finding 404 issues)
    console.log(`[apiRequest] ${method} ${url}`, {
      baseUrl: API_BASE_URL,
      path: path,
      hasToken: !!token,
      body: body ? JSON.stringify(body).substring(0, 100) : undefined,
    });

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === "AbortError") {
        throw new Error("Request timeout: Backend server may not be responding");
      }
      if (!silent) {
        console.error(`[apiRequest] NETWORK ERROR ${method} ${url}:`, {
          message: error?.message,
          baseUrl: API_BASE_URL,
          path: path,
          hasToken: !!token,
        });
      }
      throw error;
    }

    console.log(`[apiRequest] ${method} ${url} → ${res.status} ${res.statusText}`);

    if (!res.ok) {
      let errorBody: unknown = null;
      let errorMessage = `API request failed with status ${res.status}`;
      try {
        errorBody = await res.json();
        // Try to extract error message from response
        if (errorBody && typeof errorBody === "object") {
          const body = errorBody as Record<string, unknown>;
          if (body.errors && typeof body.errors === "object") {
            // ModelState errors
            const errors = body.errors as Record<string, unknown>;
            const firstError = Object.values(errors)[0];
            if (Array.isArray(firstError) && firstError.length > 0) {
              errorMessage = String(firstError[0]);
            }
          } else if (body.message && typeof body.message === "string") {
            errorMessage = body.message;
          } else if (body.title && typeof body.title === "string") {
            errorMessage = body.title;
          }
        }
      } catch {
        // If JSON parsing fails, try to get text
        try {
          const text = await res.text();
          if (text) errorMessage = text;
        } catch {
          // ignore
        }
      }

      // Handle 401 Unauthorized - clear invalid token and redirect to login
      if (res.status === 401 && token && typeof window !== "undefined") {
        console.warn("[apiRequest] 401 Unauthorized - clearing invalid token and redirecting to login");
        // Clear auth data from localStorage
        localStorage.removeItem("ticketing.auth.token");
        localStorage.removeItem("ticketing.auth.user");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        // Redirect to login page
        window.location.href = "/login";
      }

      // Only log error if not silent (silent mode suppresses error spam for expected 404s)
      if (!silent) {
        console.error(`[apiRequest] ERROR ${method} ${url}:`, {
          status: res.status,
          statusText: res.statusText,
          body: errorBody,
          message: errorMessage,
        });
      }
      const error = new Error(errorMessage);
      (error as any).status = res.status;
      (error as any).body = errorBody;
      throw error;
    }

    if (res.status === 204) {
      // No Content
      return undefined as TResponse;
    }

    return (await res.json()) as TResponse;
  };

  if (isNotificationsRequest) {
    const cacheKey = url;
    const now = Date.now();
    const cached = notificationCache.get(cacheKey);
    if (cached?.data && now - cached.timestamp < NOTIFICATION_CACHE_TTL_MS) {
      return cached.data as TResponse;
    }
    if (cached?.promise) {
      return (await cached.promise) as TResponse;
    }

    const requestPromise = executeRequest()
      .then((data) => {
        notificationCache.set(cacheKey, { timestamp: Date.now(), data });
        return data;
      })
      .catch((error) => {
        notificationCache.delete(cacheKey);
        throw error;
      });

    notificationCache.set(cacheKey, { timestamp: now, promise: requestPromise });
    return await requestPromise;
  }

  return executeRequest();
}
