import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { migrate, pool } from "./db";
import { CallerRequest, identify, linkedRecords, requireService, ResolverUnavailable } from "./auth";
import { ah, accessLog, errorHandler, logger, requestId } from "./http";
import { normaliseNumber } from "./registries";

const reg = config.registry;
const base = `/api/${reg.key}/${reg.resource}`;

type Row = Record<string, unknown> & { id: number };

/**
 * Back-office callers see every row. A citizen sees only the rows Citizen 360 links to
 * their CID. Returns null (after answering 503) when that can't be checked.
 */
async function visibleRows(req: Request, res: Response, rows: Row[]): Promise<Row[] | null> {
  const caller = (req as CallerRequest).caller;
  if (caller.kind === "service") return rows;
  try {
    const linked = await linkedRecords(caller.cid);
    return rows.filter((r) => linked.has(`${reg.table}:${r.id}`));
  } catch (err) {
    if (err instanceof ResolverUnavailable) {
      logger.warn("ownership check unavailable", { err: String(err) });
      res.status(503).json({ error: "Citizen 360 is unavailable; try again", retry: true });
      return null;
    }
    throw err;
  }
}

async function main() {
  await migrate();

  const app = express();
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: "100kb" }));
  app.use(accessLog);

  app.get("/health", (_req, res) => res.json({ status: "ok", registry: reg.key }));
  app.get("/", (_req, res) =>
    res.json({
      registry: reg.key,
      name: reg.name,
      endpoints: [`GET ${base}/:id`, `GET ${base}/${reg.numberRoute}/:number`, `GET ${base} (API key only)`],
    }),
  );

  app.use("/api", rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false }));
  app.use("/api", identify);

  // Extract of the whole table, for the Citizen 360 loader. Back-office key only.
  app.get(base, requireService, ah(async (_req, res) => {
    const r = await pool.query(`SELECT * FROM ${reg.table} ORDER BY id`);
    res.json({ registry: reg.key, count: r.rowCount, records: r.rows });
  }));

  // By the registry's own ID number (NIS number, EID, GRO registration no., passport no.).
  app.get(`${base}/${reg.numberRoute}/:number`, ah(async (req, res) => {
    const number = normaliseNumber(String(req.params.number));
    const r = await pool.query<Row>(`SELECT * FROM ${reg.table} WHERE ${reg.numberColumn} = $1 ORDER BY id`, [number]);
    const rows = await visibleRows(req, res, r.rows);
    if (rows === null) return;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    // Legacy registries can hold more than one row per number, so this returns a list.
    res.json({ registry: reg.key, [reg.numberColumn]: number, records: rows });
  }));

  // By record ID.
  app.get(`${base}/:id`, ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "record id must be a positive integer" });
    const r = await pool.query<Row>(`SELECT * FROM ${reg.table} WHERE id = $1`, [id]);
    const rows = await visibleRows(req, res, r.rows);
    if (rows === null) return;
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json({ registry: reg.key, record: rows[0] });
  }));

  app.use(errorHandler);
  app.listen(config.port, () => logger.info("registry api listening", { registry: reg.key, port: config.port }));
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
