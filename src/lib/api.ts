export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; code?: string };

/** JSON request helper for client components. Never throws: the caller always gets a result to render. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    // The check-in endpoint returns a business rejection with a 422 and a message field.
    const message = json?.error?.message ?? json?.message ?? `Request failed (${res.status}).`;
    return { ok: false, status: res.status, message, code: json?.error?.code ?? json?.code };
  } catch {
    return { ok: false, status: 0, message: "Network error. Check your connection and try again." };
  }
}
