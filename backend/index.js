import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server as SocketServer } from "socket.io";
import { createServer } from "node:http";
import { z } from "zod";
import {
  getCuesheet,
  replaceCuesheet,
  createEvent,
  updateEvent,
  deleteEvent,
  reorderEvents,
  updateMatchInfo,
} from "./src/store.js";
import { parseCueSheetFromWorkbook, findDefaultWorkbook } from "./src/xlsx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: { origin: "*" },
});

const upload = multer({
  dest: path.join(__dirname, "tmp"),
  limits: { fileSize: 20 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const eventSchema = z.object({
  phase: z
    .enum([
      "GATES_OPEN",
      "KICK_OFF",
      "HT_HALF_TIME",
      "SECOND_HALF_KICK_OFF",
      "FULL_TIME",
    ])
    .optional()
    .default("GATES_OPEN"),
  category: z.string().optional().default(""),
  cue: z.string().optional().default(""),
  asset: z.string().optional().default(""),
  operator: z.string().optional().default(""),
  status: z.string().optional().default("pending"),
  notes: z.string().optional().default(""),
});

const optionalTextSchema = z.union([z.string(), z.null()]).optional();

const matchTeamSchema = z
  .object({
    name: optionalTextSchema,
    code: optionalTextSchema,
    logoUrl: optionalTextSchema,
  })
  .strict();

const matchInfoSchema = z
  .object({
    matchId: optionalTextSchema,
    teamA: matchTeamSchema.optional(),
    teamB: matchTeamSchema.optional(),
    city: optionalTextSchema,
    date: optionalTextSchema,
    gatesOpen: optionalTextSchema,
    kickoffTime: optionalTextSchema,
    venue: optionalTextSchema,
  })
  .strict();

function actorFromRequest(req) {
  return req.header("x-user")?.trim() || "operator";
}

function broadcastSnapshot() {
  io.emit("cuesheet:updated", getCuesheet());
}

function safeUnlink(filePath) {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function tryBootstrapFromDefaultWorkbook() {
  const state = getCuesheet();
  if (state.events.length > 0) return;
  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) return;
  const parsed = parseCueSheetFromWorkbook(workbookPath);
  replaceCuesheet({
    events: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: "bootstrap",
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/cuesheet", (_req, res) => {
  res.json(getCuesheet());
});

app.get("/api/versions", (req, res) => {
  const limit = Number(req.query.limit ?? 100);
  const cuesheet = getCuesheet();
  res.json(cuesheet.versions.slice(0, Math.max(1, Math.min(limit, 500))));
});

app.post("/api/cuesheet/import-default", (req, res) => {
  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) {
    return res.status(404).json({ error: "No default XLSX found in project root" });
  }
  const parsed = parseCueSheetFromWorkbook(workbookPath);
  const next = replaceCuesheet({
    events: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: actorFromRequest(req),
  });
  broadcastSnapshot();
  return res.json(next);
});

app.post("/api/cuesheet/import-xlsx", upload.single("file"), (req, res) => {
  if (!req.file?.path) {
    return res.status(400).json({ error: "File missing" });
  }

  try {
    const parsed = parseCueSheetFromWorkbook(req.file.path);
    const next = replaceCuesheet({
      events: parsed.events,
      sourceFile: req.file.originalname ?? "uploaded.xlsx",
      actor: actorFromRequest(req),
    });
    broadcastSnapshot();
    return res.json(next);
  } catch (error) {
    return res.status(400).json({
      error: "Invalid XLSX file",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    safeUnlink(req.file.path);
  }
});

app.patch("/api/cuesheet/match", (req, res) => {
  const parsed = matchInfoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = updateMatchInfo(parsed.data, actorFromRequest(req));
  broadcastSnapshot();
  return res.json(next);
});

app.post("/api/events", (req, res) => {
  const parsed = eventSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const next = createEvent(parsed.data, actorFromRequest(req));
  broadcastSnapshot();
  return res.status(201).json(next);
});

app.patch("/api/events/:id", (req, res) => {
  const parsed = eventSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const next = updateEvent(req.params.id, parsed.data, actorFromRequest(req));
  if (!next) {
    return res.status(404).json({ error: "Event not found" });
  }
  broadcastSnapshot();
  return res.json(next);
});

app.delete("/api/events/:id", (req, res) => {
  const next = deleteEvent(req.params.id, actorFromRequest(req));
  if (!next) {
    return res.status(404).json({ error: "Event not found" });
  }
  broadcastSnapshot();
  return res.json(next);
});

app.post("/api/events/reorder", (req, res) => {
  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
  if (!orderedIds) {
    return res.status(400).json({ error: "orderedIds array required" });
  }
  const next = reorderEvents(orderedIds, actorFromRequest(req));
  broadcastSnapshot();
  return res.json(next);
});

io.on("connection", (socket) => {
  socket.emit("cuesheet:updated", getCuesheet());
});

tryBootstrapFromDefaultWorkbook();

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const PORT = Number(process.env.PORT || 8080);
  server.listen(PORT, () => {
    console.log(`[backend] CueSheet API listening on http://localhost:${PORT}`);
  });
}

export { app, server, io };
