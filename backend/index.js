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
  listPlannerEvents,
  listTournaments,
  createTournament,
  updateTournament,
  deleteTournament,
  getPlannerEventSnapshot,
  createPlannerEvent,
  updatePlannerEvent,
  deletePlannerEvent,
  listVenues,
  createVenue,
  listActivations,
  createActivation,
  updateActivation,
  deleteActivation,
  replaceCuesheet,
  createRow,
  updateRow,
  deleteRow,
  reorderRows,
  updateMatchInfo,
  getVersions,
  ensurePlannerEvent,
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

const rowSchema = z.object({
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
  audio: z.string().optional().default(""),
  script: z.string().optional().default(""),
  activationId: z.string().optional().nullable(),
  screenTargets: z
    .array(
      z.object({
        screenId: z.string().optional(),
        screenLabel: z.string().optional(),
        value: z.string().optional(),
      }),
    )
    .optional(),
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
    venueId: optionalTextSchema,
    city: optionalTextSchema,
    date: optionalTextSchema,
    gatesOpen: optionalTextSchema,
    kickoffTime: optionalTextSchema,
    venue: optionalTextSchema,
  })
  .strict();

const plannerEventSchema = z
  .object({
    name: z.string().optional(),
    match: matchInfoSchema.optional(),
    tournamentId: z.string().optional(),
  })
  .strict();
const plannerEventPatchSchema = plannerEventSchema.partial();

const venueSchema = z
  .object({
    name: z.string().min(1),
    tournamentId: z.string().optional(),
    city: z.string().optional(),
    address: z.string().optional(),
    tech: z
      .object({
        screens: z
          .array(
            z.object({
              id: z.string().optional(),
              type: z.enum(["ribbon", "giant_screen", "fascia"]),
              res: z.object({
                x: z.number().int().positive().optional(),
                y: z.number().int().positive().optional(),
              }),
              framerate: z.number().positive().optional(),
              codec: z.string().optional(),
              referencePic: z
                .object({
                  name: z.string().optional(),
                  mime: z.string().optional(),
                  data: z.string().optional(),
                })
                .optional()
                .nullable(),
            }),
          )
          .optional(),
        speakers: z
          .array(
            z.object({
              id: z.string().optional(),
              name: z.string().min(1),
              zone: z.string().optional(),
              notes: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  })
  .strict();

const activationSchema = z
  .object({
    name: z.string().min(1),
    tournamentId: z.string().optional(),
    fileName: z.string().optional(),
    mimeType: z.string().optional(),
    sizeBytes: z.number().optional(),
    durationMs: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const activationPatchSchema = activationSchema.partial();

const tournamentSchema = z
  .object({
    name: z.string().min(1),
    startDate: optionalTextSchema,
    endDate: optionalTextSchema,
    logoUrl: optionalTextSchema,
    keyPeople: z.array(z.string()).optional(),
    matchesCount: z.number().int().nonnegative().nullable().optional(),
    format: optionalTextSchema,
    teamsCount: z.number().int().nonnegative().nullable().optional(),
    hostCountries: z.array(z.string()).optional(),
  })
  .strict();

const tournamentPatchSchema = tournamentSchema.partial();

function actorFromRequest(req) {
  return req.header("x-user")?.trim() || "operator";
}

function broadcastSnapshot(eventId) {
  const snapshot = getPlannerEventSnapshot(eventId);
  if (!snapshot) return;
  io.emit("cuesheet:updated", { eventId, snapshot });
}

function safeUnlink(filePath) {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function ensureEventOr404(req, res) {
  const eventId = req.params.eventId;
  const snapshot = getPlannerEventSnapshot(eventId);
  if (!snapshot) {
    res.status(404).json({ error: "Event not found" });
    return null;
  }
  return { eventId, snapshot };
}

function tryBootstrapFromDefaultWorkbook() {
  const events = listPlannerEvents();
  if (events.length > 0) return;

  const eventId = ensurePlannerEvent("bootstrap", { name: "Imported Event" });
  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) return;

  const parsed = parseCueSheetFromWorkbook(workbookPath);
  replaceCuesheet(eventId, {
    rows: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: "bootstrap",
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/tournaments", (_req, res) => {
  res.json(listTournaments());
});

app.post("/api/tournaments", (req, res) => {
  const parsed = tournamentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const created = createTournament(parsed.data, actorFromRequest(req));
  return res.status(201).json(created);
});

app.patch("/api/tournaments/:tournamentId", (req, res) => {
  const parsed = tournamentPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const updated = updateTournament(req.params.tournamentId, parsed.data, actorFromRequest(req));
  if (!updated) {
    return res.status(404).json({ error: "Tournament not found" });
  }
  return res.json(updated);
});

app.delete("/api/tournaments/:tournamentId", (req, res) => {
  const removed = deleteTournament(req.params.tournamentId, actorFromRequest(req));
  if (!removed) {
    return res.status(404).json({ error: "Tournament not found" });
  }
  return res.json(removed);
});

app.get("/api/events", (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(listPlannerEvents(tournamentId));
});

app.get("/api/venues", (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(listVenues(tournamentId));
});

app.post("/api/venues", (req, res) => {
  const parsed = venueSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const venue = createVenue(parsed.data, actorFromRequest(req), tournamentId ?? parsed.data.tournamentId);
  return res.status(201).json(venue);
});

app.get("/api/activations", (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(listActivations(tournamentId));
});

app.post("/api/activations", (req, res) => {
  const parsed = activationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const activation = createActivation(
    parsed.data,
    actorFromRequest(req),
    tournamentId ?? parsed.data.tournamentId,
  );
  return res.status(201).json(activation);
});

app.patch("/api/activations/:activationId", (req, res) => {
  const parsed = activationPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const updated = updateActivation(req.params.activationId, parsed.data, actorFromRequest(req));
  if (!updated) {
    return res.status(404).json({ error: "Activation not found" });
  }
  return res.json(updated);
});

app.delete("/api/activations/:activationId", (req, res) => {
  const removed = deleteActivation(req.params.activationId);
  if (!removed) {
    return res.status(404).json({ error: "Activation not found" });
  }
  return res.json(removed);
});

app.post("/api/activations/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File missing" });
  }
  const tags = String(req.body?.tags ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const activation = createActivation(
    {
      name: path.parse(req.file.originalname || "Activation").name,
      fileName: req.file.originalname || null,
      mimeType: req.file.mimetype || null,
      sizeBytes: req.file.size || null,
      durationMs: null,
      tags,
    },
    actorFromRequest(req),
    typeof req.query.tournamentId === "string" ? req.query.tournamentId : null,
  );

  safeUnlink(req.file.path);
  return res.status(201).json(activation);
});

app.post("/api/events", (req, res) => {
  const parsed = plannerEventSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const created = createPlannerEvent(
    { ...parsed.data, tournamentId: tournamentId ?? parsed.data.tournamentId },
    actorFromRequest(req),
  );
  broadcastSnapshot(created.event.id);
  return res.status(201).json(created);
});

app.patch("/api/events/:eventId", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const parsed = plannerEventPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const updated = updatePlannerEvent(found.eventId, parsed.data, actorFromRequest(req));
  if (!updated) {
    return res.status(404).json({ error: "Event not found" });
  }

  broadcastSnapshot(found.eventId);
  return res.json(updated);
});

app.delete("/api/events/:eventId", (req, res) => {
  const removed = deletePlannerEvent(req.params.eventId, actorFromRequest(req));
  if (!removed) {
    return res.status(404).json({ error: "Event not found" });
  }
  io.emit("planner:event-deleted", { eventId: removed.id });
  return res.json(removed);
});

app.get("/api/events/:eventId/cuesheet", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;
  return res.json(found.snapshot);
});

app.get("/api/events/:eventId/versions", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;
  const limit = Number(req.query.limit ?? 100);
  const versions = getVersions(found.eventId, limit);
  return res.json(versions ?? []);
});

app.patch("/api/events/:eventId/match", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const parsed = matchInfoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = updateMatchInfo(found.eventId, parsed.data, actorFromRequest(req));
  if (!next) {
    return res.status(404).json({ error: "Event not found" });
  }

  broadcastSnapshot(found.eventId);
  return res.json(next);
});

app.post("/api/events/:eventId/cuesheet/import-default", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) {
    return res.status(404).json({ error: "No default XLSX found in project root" });
  }

  const parsed = parseCueSheetFromWorkbook(workbookPath);
  const next = replaceCuesheet(found.eventId, {
    rows: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: actorFromRequest(req),
  });

  broadcastSnapshot(found.eventId);
  return res.json(next);
});

app.post("/api/events/:eventId/cuesheet/import-xlsx", upload.single("file"), (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  if (!req.file?.path) {
    return res.status(400).json({ error: "File missing" });
  }

  try {
    const parsed = parseCueSheetFromWorkbook(req.file.path);
    const next = replaceCuesheet(found.eventId, {
      rows: parsed.events,
      sourceFile: req.file.originalname ?? "uploaded.xlsx",
      actor: actorFromRequest(req),
    });
    broadcastSnapshot(found.eventId);
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

app.post("/api/events/:eventId/rows", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const parsed = rowSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = createRow(found.eventId, parsed.data, actorFromRequest(req));
  broadcastSnapshot(found.eventId);
  return res.status(201).json(next);
});

app.patch("/api/events/:eventId/rows/:rowId", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const parsed = rowSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = updateRow(found.eventId, req.params.rowId, parsed.data, actorFromRequest(req));
  if (!next) {
    return res.status(404).json({ error: "Row not found" });
  }

  broadcastSnapshot(found.eventId);
  return res.json(next);
});

app.delete("/api/events/:eventId/rows/:rowId", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const next = deleteRow(found.eventId, req.params.rowId, actorFromRequest(req));
  if (!next) {
    return res.status(404).json({ error: "Row not found" });
  }

  broadcastSnapshot(found.eventId);
  return res.json(next);
});

app.post("/api/events/:eventId/rows/reorder", (req, res) => {
  const found = ensureEventOr404(req, res);
  if (!found) return;

  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
  if (!orderedIds) {
    return res.status(400).json({ error: "orderedIds array required" });
  }

  const next = reorderRows(found.eventId, orderedIds, actorFromRequest(req));
  broadcastSnapshot(found.eventId);
  return res.json(next);
});

io.on("connection", () => {
  // Event snapshots are fetched via HTTP on route enter.
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
