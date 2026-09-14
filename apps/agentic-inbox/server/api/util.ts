export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function ok(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, init);
}

export function notFound(what = "Not found"): never {
  throw new HttpError(404, what);
}

export function badRequest(msg: string): never {
  throw new HttpError(400, msg);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

/** `?space=<id>` scopes a request; `all` (or missing) means every space. */
export function spaceParam(req: Request): string | null {
  const s = query(req).get("space");
  return s && s !== "all" ? s : null;
}

export function num(v: string | null, fallback: number): number {
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

type Handler<R extends Request = Request> = (req: R) => Response | Promise<Response>;

/** Wrap a handler so thrown HttpErrors / errors become JSON responses. */
export function h<R extends Request = Request>(fn: Handler<R>): Handler<R> {
  return async (req) => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
      console.error(`[api] ${req.method} ${new URL(req.url).pathname}:`, err);
      return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  };
}
