import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../shared/types.js";
import type { KnowledgeService } from "./service.js";
import { DomainError } from "./repository.js";
import { changeSchema, promptSchema, settingsSchema } from "./schemas.js";
import { handleMcp } from "./mcp.js";
export interface AppConfig {
  demo: boolean;
  proxySecret?: string;
  mcpToken: string;
  origin?: string;
  staticDir?: string;
}
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function createApp(service: KnowledgeService, config: AppConfig) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({
      status: service.repo.syncError ? "degraded" : "ok",
      version: "1.0.0",
    }),
  );
  app.use(express.json({ limit: "22mb" }));
  app.use(["/api", "/mcp"], (req, res, next) => {
    const origin = req.get("origin");
    const allowed = config.demo
      ? [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
        ]
      : [config.origin];
    if (origin && !allowed.includes(origin))
      return res.status(403).json({ error: "Origin is not allowed." });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.post("/mcp", async (req, res, next) => {
    if (!equal(req.get("authorization") || "", `Bearer ${config.mcpToken}`))
      return res
        .status(401)
        .json({ error: "A valid MCP bearer token is required." });
    try {
      await handleMcp(service, req, res);
    } catch (e) {
      next(e);
    }
  });
  app.all("/mcp", (_req, res) =>
    res.status(405).json({ error: "Use POST for stateless Streamable HTTP." }),
  );
  app.use("/api", (req, res, next) => {
    const id = config.demo
      ? req.get("x-demo-user") || "sunho"
      : req.get("x-auth-user");
    if (
      !config.demo &&
      (!config.proxySecret ||
        !equal(req.get("x-proxy-secret") || "", config.proxySecret))
    )
      return res
        .status(401)
        .json({ error: "Trusted proxy authentication is required." });
    if (!id || !service.users.find((u) => u.id === id))
      return res
        .status(401)
        .json({ error: "Your account is not registered in Knowledge Wiki." });
    res.locals.actor = { id, kind: "human" } satisfies Actor;
    next();
  });
  const actor = (res: Response) => res.locals.actor as Actor;
  const id = (req: Request) =>
    z.coerce.number().int().positive().parse(req.params.id);
  const str = (x: unknown, defaultValue = "") =>
    z.string().parse(x ?? defaultValue);
  app.get("/api/catalog", (_req, res) => res.json(service.catalog(actor(res))));
  app.post("/api/sync", async (_req, res) => {
    await service.sync();
    res.json(service.catalog(actor(res)));
  });
  app.get("/api/search", (req, res) =>
    res.json(service.search(str(req.query.q), str(req.query.folder))),
  );
  app.get("/api/document", async (req, res) => {
    const p = str(req.query.path);
    const revision = req.query.revision ? str(req.query.revision) : undefined;
    const content = revision
      ? await service.repo.historical(p, revision)
      : undefined;
    res.json(
      service.read(
        p,
        Number(req.query.startLine || 1),
        Number(req.query.limit || 100),
        Number(req.query.column || 0),
        content,
        revision,
      ),
    );
  });
  app.get("/api/document/edit", (req, res) => {
    const p = str(req.query.path);
    const doc = service.repo.docs.get(p);
    if (!doc) throw new DomainError(404, "Document not found");
    if (doc.content.length > 2_000_000)
      throw new DomainError(
        413,
        "This document exceeds the web editor limit of 2 MB. Split it into smaller documents through your repository administrator.",
      );
    res.json({ ...doc.meta, content: doc.content });
  });
  app.get("/api/document/history", async (req, res) =>
    res.json(await service.repo.history(str(req.query.path))),
  );
  app.post("/api/folders", async (req, res) =>
    res.status(201).json(
      await service.createFolder(
        actor(res),
        z
          .object({
            parent: z.string().max(400),
            name: z.string().trim().min(1).max(80),
            slug: z.string().trim().min(1).max(100),
            description: z.string().max(500).optional(),
          })
          .parse(req.body),
      ),
    ),
  );
  app.put("/api/governance", async (req, res) =>
    res.json(
      await service.governance(
        actor(res),
        z
          .object({
            path: z.string().max(400),
            ownerId: z.string().nullable(),
            policy: z.enum(["local", "cascade"]).nullable(),
            instructions: z.string().max(8000),
            description: z.string().max(500),
            revision: z.string(),
          })
          .parse(req.body),
      ),
    ),
  );
  app.get("/api/changes/:id", (req, res) =>
    res.json(service.getChange(id(req))),
  );
  app.post("/api/changes", async (req, res) =>
    res
      .status(201)
      .json(
        await service.createChange(actor(res), changeSchema.parse(req.body)),
      ),
  );
  app.put("/api/changes/:id", async (req, res) =>
    res.json(
      await service.createChange(
        actor(res),
        changeSchema.parse(req.body),
        id(req),
      ),
    ),
  );
  app.post("/api/changes/:id/review", async (req, res) => {
    const data = z
      .object({
        decision: z.enum(["approve", "request_changes"]),
        comment: z.string().max(5000).default(""),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    res.json(
      await service.review(
        actor(res),
        id(req),
        data.decision,
        data.comment,
        data.version,
      ),
    );
  });
  app.post("/api/changes/:id/comments", async (req, res) =>
    res.json(
      await service.comment(
        actor(res),
        id(req),
        z.object({ text: z.string().trim().min(1).max(5000) }).parse(req.body)
          .text,
      ),
    ),
  );
  app.get("/api/settings", (_req, res) =>
    res.json(service.settings(actor(res))),
  );
  app.put("/api/settings", (req, res) =>
    res.json(service.saveSettings(actor(res), settingsSchema.parse(req.body))),
  );
  app.post("/api/prompt", (req, res) =>
    res.json(service.prompt(actor(res), promptSchema.parse(req.body))),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API endpoint not found" }),
  );
  if (config.staticDir) {
    app.use(express.static(config.staticDir));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(path.join(config.staticDir!, "index.html")),
    );
  }
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({
        error: err.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (err instanceof DomainError)
      return res.status(err.status).json({ error: err.message });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "Invalid JSON request." });
    console.error(err);
    res.status(500).json({
      error:
        "The operation could not be completed. Please try again or contact your administrator.",
    });
  });
  return app;
}
