import { getAccessToken } from "@/lib/authSession";

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

export const API_BASE_URL =
  env?.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000/api";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : {};
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const token = getAccessToken();

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
  const body = await parseResponseBody(response);

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body && typeof body.message === "string"
        ? body.message
        : `API request failed with status ${response.status}`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}
