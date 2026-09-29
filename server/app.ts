import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../shared/types.js";
import type { KnowledgeService } from "./service.js";
import type { Portal } from "./portal.js";
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
export function createApp(portal: Portal, config: AppConfig) {
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
      status: [...portal.services.values()].some((s) => s.repo.syncError)
        ? "degraded"
        : "ok",
      version: "1.1.0",
      workspaces: portal.services.size,
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
      await handleMcp(
        portal,
        req,
        res,
        config.origin || `${req.protocol}://${req.get("host")}`,
      );
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
    if (!id || !portal.users.find((u) => u.id === id))
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
  const origin = (req: Request) =>
    config.origin || `${req.protocol}://${req.get("host")}`;
  app.get("/api/me", (_req, res) =>
    res.json({
      user: portal.users.find((u) => u.id === actor(res).id),
      users: portal.users,
      demo: config.demo,
      defaultWorkspace: portal.config.defaultWorkspace.slug,
    }),
  );
  app.get("/api/workspaces", (_req, res) => res.json(portal.list(actor(res))));
  app.post("/api/workspaces", async (req, res) =>
    res.status(201).json(
      await portal.create(
        actor(res),
        z
          .object({
            slug: z.string().trim().min(2).max(40),
            name: z.string().trim().min(1).max(80),
            description: z.string().max(300).optional(),
            instructions: z.string().max(8000).optional(),
          })
          .parse(req.body),
      ),
    ),
  );
  app.get("/api/settings", (_req, res) =>
    res.json(portal.store.settings(actor(res).id)),
  );
  app.put("/api/settings", (req, res) => {
    portal.store.saveSettings(actor(res).id, settingsSchema.parse(req.body));
    res.json(portal.store.settings(actor(res).id));
  });
  app.get("/api/portal", (_req, res) => res.json(portal.portalInstructions()));
  app.put("/api/portal", (req, res) =>
    res.json(
      portal.setPortalInstructions(
        actor(res),
        z.object({ text: z.string().max(8000).nullable() }).parse(req.body)
          .text,
      ),
    ),
  );
  app.post("/api/prompt", (req, res) =>
    res.json(
      portal.prompt(actor(res), promptSchema.parse(req.body), origin(req)),
    ),
  );
  const ws = express.Router({ mergeParams: true });
  app.use(
    "/api/w/:ws",
    (req, res, next) => {
      res.locals.service = portal.get(String(req.params.ws));
      next();
    },
    ws,
  );
  const svc = (res: Response) => res.locals.service as KnowledgeService;
  ws.get("/catalog", (_req, res) => res.json(svc(res).catalog(actor(res))));
  ws.post("/sync", async (_req, res) => {
    await svc(res).sync();
    res.json(svc(res).catalog(actor(res)));
  });
  ws.get("/search", (req, res) =>
    res.json(svc(res).search(str(req.query.q), str(req.query.folder))),
  );
  ws.get("/document", async (req, res) => {
    const p = str(req.query.path);
    if (req.query.section)
      return res.json(svc(res).readSection(p, str(req.query.section)));
    const revision = req.query.revision ? str(req.query.revision) : undefined;
    const content = revision
      ? await svc(res).repo.historical(p, revision)
      : undefined;
    res.json(
      svc(res).read(
        p,
        Number(req.query.startLine || 1),
        Number(req.query.limit || 100),
        Number(req.query.column || 0),
        content,
        revision,
      ),
    );
  });
  ws.get("/document/outline", (req, res) =>
    res.json(svc(res).outline(str(req.query.path))),
  );
  ws.get("/document/edit", (req, res) => {
    const doc = svc(res).doc(str(req.query.path));
    if (doc.content.length > 2_000_000)
      throw new DomainError(
        413,
        "This document exceeds the web editor limit of 2 MB. Propose focused edits through an agent (MCP edits) instead.",
      );
    res.json({ ...doc.meta, content: doc.content });
  });
  ws.get("/document/history", async (req, res) =>
    res.json(await svc(res).repo.history(str(req.query.path))),
  );
  ws.post("/folders", async (req, res) =>
    res.status(201).json(
      await svc(res).createFolder(
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
  ws.put("/governance", async (req, res) =>
    res.json(
      await svc(res).governance(
        actor(res),
        z
          .object({
            path: z.string().max(400),
            ownerId: z.string().nullable(),
            policy: z.enum(["local", "cascade"]).nullable(),
            instructions: z.string().max(8000),
            description: z.string().max(500),
            watchers: z.array(z.string().max(100)).max(50).optional(),
            revision: z.string(),
          })
          .parse(req.body),
      ),
    ),
  );
  ws.get("/changes/:id", (req, res) => res.json(svc(res).getChange(id(req))));
  ws.post("/changes", async (req, res) =>
    res
      .status(201)
      .json(
        await svc(res).createChange(actor(res), changeSchema.parse(req.body)),
      ),
  );
  ws.put("/changes/:id", async (req, res) =>
    res.json(
      await svc(res).createChange(
        actor(res),
        changeSchema.parse(req.body),
        id(req),
      ),
    ),
  );
  ws.post("/changes/:id/review", async (req, res) => {
    const data = z
      .object({
        decision: z.enum(["approve", "request_changes", "reject"]),
        comment: z.string().max(5000).default(""),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    res.json(
      await svc(res).review(
        actor(res),
        id(req),
        data.decision,
        data.comment,
        data.version,
      ),
    );
  });
  ws.post("/changes/:id/comments", async (req, res) =>
    res.json(
      await svc(res).comment(
        actor(res),
        id(req),
        z.object({ text: z.string().trim().min(1).max(5000) }).parse(req.body)
          .text,
      ),
    ),
  );
  ws.get("/imports", (_req, res) => res.json(svc(res).imports.list()));
  ws.get("/imports/:id", (req, res) =>
    res.json({
      ...svc(res).imports.get(id(req)),
      files: svc(res).store.stagedFiles(id(req)),
    }),
  );
  ws.get("/imports/:id/file", (req, res) =>
    res.json(
      svc(res).imports.read(
        id(req),
        str(req.query.path),
        Number(req.query.startLine || 1),
        Number(req.query.limit || 200),
      ),
    ),
  );
  const decision = (req: Request) =>
    z
      .object({ comment: z.string().max(5000).default("") })
      .parse(req.body ?? {}).comment;
  ws.post("/imports/:id/commit", async (req, res) =>
    res.json(await svc(res).imports.commit(actor(res), id(req), decision(req))),
  );
  ws.post("/imports/:id/discard", (req, res) =>
    res.json(svc(res).imports.discard(actor(res), id(req), decision(req))),
  );
  ws.post("/prompt", (req, res) =>
    res.json(
      svc(res).prompt(actor(res), promptSchema.parse(req.body), origin(req)),
    ),
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
