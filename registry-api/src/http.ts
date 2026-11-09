import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { ZodSchema } from "zod";

type Level = "info" | "warn" | "error";
function emit(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }) + "\n");
}
export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = (req.headers["x-request-id"] as string) || randomUUID();
  (req as any).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}

export function accessLog(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on("finish", () => {
    logger.info("request", {
      id: (req as any).id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      sub: (req as any).auth?.sub,
    });
  });
  next();
}

export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  logger.error("unhandled", { id: (req as any).id, err: String(err) });
  if (res.headersSent) return next(err as any);
  res.status(500).json({ error: "internal error" });
}

export const validate =
  (schema: ZodSchema) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "invalid input",
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    req.body = result.data;
    next();
  };
