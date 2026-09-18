import type { APIRoute } from "astro";

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const err = (e: unknown, status = 400) => {
  const message = e instanceof Error ? e.message : String(e);
  return json({ error: message }, status);
};

export async function body<T = any>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Wrap a handler so thrown Errors become {error} JSONs with the right status. */
export function h(fn: (ctx: { request: Request; url: URL; params: any }) => Promise<Response>) {
  return (async (ctx: any) => {
    try {
      return await fn({ request: ctx.request, url: new URL(ctx.request.url), params: ctx.params });
    } catch (e) {
      console.error("[social-forge api]", e);
      return err(e, e instanceof HttpError ? (e as HttpError).status : 500);
    }
  }) as any;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
