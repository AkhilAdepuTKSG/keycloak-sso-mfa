import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { migrate, pool } from "./db";
import { auth, requireAuth } from "./auth";
import { ah, errorHandler, requestId, accessLog, logger } from "./http";
import { nisRouter } from "./nis";

async function main() {
  await migrate();

  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(accessLog);

  app.get("/health", (_req: Request, res: Response) => res.json({ status: "ok" }));

  // General limit for the API; a stricter limit on the public enrolment endpoint.
  app.use("/api", rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));
  app.use("/api/nis/enrol", rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));
  app.use("/api", requireAuth);

  app.get("/api/me", ah(async (req: Request, res: Response) => {
    const ctx = auth(req);
    const enrolled = (await pool.query(`SELECT 1 FROM nis_members WHERE sub=$1`, [ctx.sub])).rowCount! > 0;
    res.json({ sub: ctx.sub, username: ctx.username, email: ctx.email, name: ctx.name, roles: ctx.roles, nisEnrolled: enrolled });
  }));

  app.use("/api/nis", nisRouter);

  app.use(errorHandler);
  app.listen(config.port, () => logger.info("citizen-api listening", { port: config.port }));
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
