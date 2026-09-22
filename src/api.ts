const BOOKINGS_URL = process.env.EXPO_PUBLIC_BOOKINGS_API_URL;
let adminToken = "";
export function setAdminToken(value: string) {
  adminToken = value;
}
export function hasAdminToken() {
  return !!adminToken;
}
export async function apiRequest<T>(path: string, body?: unknown): Promise<T> {
  if (!BOOKINGS_URL) throw new Error("Booking service is not configured.");
  const base = BOOKINGS_URL.replace(/\/bookings\/?$/, "");
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
  });
  let result: any;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      "The service response could not be read. Check your bookings before retrying a payment.",
    );
  }
  if (response.status === 401) adminToken = "";
  if (!response.ok || result.ok === false)
    throw new Error(result.error || "Unable to complete request.");
  return result as T;
}
export function callBookingsApi<T>(
  payload: Record<string, unknown>,
): Promise<T> {
  return apiRequest<T>("/bookings", payload);
}
