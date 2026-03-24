import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
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
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  replaceCuesheet,
  createRow,
  updateRow,
  deleteRow,
  reorderRows,
  restoreRows,
  updateMatchInfo,
  getVersions,
  ensurePlannerEvent,
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listPersonnel,
  getPersonnelById,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  parseExpenseText,
} from "./src/store.js";
import { parseCueSheetFromWorkbook, findDefaultWorkbook } from "./src/xlsx.js";
import { parseFinancePdfWithAgent } from "./src/personnelFinanceAgent.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const uploadsRoot = path.join(__dirname, "uploads");
const personnelDocsRoot = path.join(uploadsRoot, "personnel");

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
fs.mkdirSync(personnelDocsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

const rowSchema = z.object({
  phase: z.string().optional().default("GATES_OPEN"),
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
  groupId: z.string().optional().nullable(),
  groupName: z.string().optional().nullable(),
  groupColor: z.string().optional().nullable(),
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
    timeTo0Seconds: z.number().optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const activationPatchSchema = z
  .object({
    name: z.string().optional(),
    tournamentId: z.string().optional(),
    fileName: z.union([z.string(), z.null()]).optional(),
    mimeType: z.union([z.string(), z.null()]).optional(),
    sizeBytes: z.union([z.number(), z.null()]).optional(),
    durationMs: z.union([z.number(), z.null()]).optional(),
    timeTo0Seconds: z.union([z.number(), z.null()]).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

const teamPlayerSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    number: z.number().int().nonnegative().nullable().optional(),
    position: optionalTextSchema,
  })
  .strict();

const teamSchema = z
  .object({
    name: z.string().min(1),
    tournamentId: z.string().optional(),
    country: optionalTextSchema,
    tricode: optionalTextSchema,
    logoUrl: optionalTextSchema,
    players: z.array(teamPlayerSchema).optional(),
  })
  .strict();

const teamPatchSchema = teamSchema.partial();

const eventPhaseSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    offsetMinutes: z.number().int(),
  })
  .strict();

const tournamentSchema = z
  .object({
    name: z.string().min(1),
    startDate: optionalTextSchema,
    endDate: optionalTextSchema,
    federation: optionalTextSchema,
    logoUrl: optionalTextSchema,
    keyPeople: z.array(z.string()).optional(),
    matchesCount: z.number().int().nonnegative().nullable().optional(),
    format: optionalTextSchema,
    teamsCount: z.number().int().nonnegative().nullable().optional(),
    hostCountries: z.array(z.string()).optional(),
    eventPhases: z.array(eventPhaseSchema).optional(),
  })
  .strict();

const tournamentPatchSchema = tournamentSchema.partial();

const privilegeEntrySchema = z.record(z.string(), z.boolean());
const privilegesSchema = z.record(z.string(), privilegeEntrySchema);

const userSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().optional().default(""),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.string().optional().default("staff"),
    department: optionalTextSchema,
    organization: optionalTextSchema,
    active: z.boolean().optional(),
    privileges: privilegesSchema.optional(),
  })
  .strict();

const userPatchSchema = userSchema.partial();

const expenseItemSchema = z
  .object({
    id: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().optional(),
    date: optionalTextSchema,
    vendor: optionalTextSchema,
    notes: optionalTextSchema,
  })
  .strict();

const personnelDocumentSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    category: z.enum(["compliance", "finance", "misc"]).optional(),
    fileName: optionalTextSchema,
    fileUrl: optionalTextSchema,
    filePath: optionalTextSchema,
    mimeType: optionalTextSchema,
    sizeBytes: z.number().nullable().optional(),
    uploadedAt: z.string().optional(),
    notes: optionalTextSchema,
    compliance: z
      .object({
        documentType: optionalTextSchema,
        referenceCode: optionalTextSchema,
      })
      .optional(),
    finance: z
      .object({
        amount: z.number().nullable().optional(),
        currency: optionalTextSchema,
        vendor: optionalTextSchema,
        documentDate: optionalTextSchema,
        summary: optionalTextSchema,
        parsedExpenses: z.array(expenseItemSchema).optional(),
      })
      .optional(),
    misc: z
      .object({
        tags: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strict();

const personnelSchema = z
  .object({
    tournamentId: z.string().optional(),
    userId: optionalTextSchema,
    firstName: z.string().min(1),
    lastName: z.string().optional().default(""),
    email: optionalTextSchema,
    organization: optionalTextSchema,
    arrivalDate: optionalTextSchema,
    departureDate: optionalTextSchema,
    offer: z
      .object({
        duration: optionalTextSchema,
        compensation: optionalTextSchema,
        benefits: z.array(z.string()).optional(),
      })
      .optional(),
    role: optionalTextSchema,
    department: optionalTextSchema,
    managerUserId: optionalTextSchema,
    placeOfService: optionalTextSchema,
    expenses: z.array(expenseItemSchema).optional(),
    documents: z.array(personnelDocumentSchema).optional(),
  })
  .strict();

const personnelPatchSchema = personnelSchema.partial();
const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

const AUTH_TOKEN_SECRET =
  process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET || "change-this-auth-token-secret";
const AUTH_TOKEN_TTL_SECONDS = Math.max(
  300,
  Number.parseInt(process.env.AUTH_TOKEN_TTL_SECONDS || "43200", 10) || 43200,
);

function hasPrivilege(user, page, action) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.privileges?.[page]?.[action]);
}

async function resolveRequestUser(req) {
  const authHeader = req.header("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const token = match?.[1]?.trim() ?? "";
  if (!token) return null;
  const userId = verifyAuthToken(token);
  if (!userId) return null;
  const user = await getUserById(userId);
  if (!user || !user.active) return null;
  return user;
}

function withPrivilege(page, action, handler) {
  return async (req, res) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!hasPrivilege(user, page, action)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return handler(req, res, user);
  };
}

function withSuperAdmin(handler) {
  return async (req, res) => {
    const user = await resolveRequestUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin required" });
    }
    return handler(req, res, user);
  };
}

function createAuthToken(userId) {
  const payload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + AUTH_TOKEN_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", AUTH_TOKEN_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyAuthToken(token) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, receivedSig] = parts;
  if (!encoded || !receivedSig) return null;
  const expectedSig = createHmac("sha256", AUTH_TOKEN_SECRET).update(encoded).digest("base64url");
  const receivedBuffer = Buffer.from(receivedSig, "utf8");
  const expectedBuffer = Buffer.from(expectedSig, "utf8");
  if (receivedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload?.userId || !payload?.exp) return null;
    if (Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return String(payload.userId);
  } catch {
    return null;
  }
}

function actorFromRequest(req, user) {
  return user?.email || req.header("x-user")?.trim() || "operator";
}

async function broadcastSnapshot(eventId) {
  const snapshot = await getPlannerEventSnapshot(eventId);
  if (!snapshot) return;
  io.emit("cuesheet:updated", { eventId, snapshot });
}

function safeUnlink(filePath) {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function sanitizeFilePart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileExtension(fileName, mimeType) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext) return ext;
  if (String(mimeType || "").toLowerCase().includes("pdf")) return ".pdf";
  return "";
}

function createStoredDocumentPath({ personnelId, documentId, originalName, mimeType }) {
  const safePersonnelId = sanitizeFilePart(personnelId) || "personnel";
  const safeDocumentId = sanitizeFilePart(documentId) || randomUUID();
  const ext = getFileExtension(originalName, mimeType);
  const base = sanitizeFilePart(path.basename(String(originalName || "document"), path.extname(String(originalName || "")))) || "document";
  const fileName = `${safePersonnelId}_${safeDocumentId}_${base}${ext}`;
  return {
    fileName,
    absolutePath: path.join(personnelDocsRoot, fileName),
    publicUrl: `/uploads/personnel/${fileName}`,
  };
}

function removePersonnelDocumentFile(doc) {
  const storedPath = typeof doc?.filePath === "string" ? doc.filePath : "";
  if (storedPath) safeUnlink(storedPath);
}

function removePersonnelDocumentFiles(docs) {
  for (const doc of Array.isArray(docs) ? docs : []) {
    removePersonnelDocumentFile(doc);
  }
}

async function ensureEventOr404(req, res) {
  const eventId = req.params.eventId;
  const snapshot = await getPlannerEventSnapshot(eventId);
  if (!snapshot) {
    res.status(404).json({ error: "Event not found" });
    return null;
  }
  return { eventId, snapshot };
}

async function tryBootstrapFromDefaultWorkbook() {
  const events = await listPlannerEvents();
  if (events.length > 0) return;

  const eventId = await ensurePlannerEvent("bootstrap", { name: "Imported Event" });
  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) return;

  const parsed = parseCueSheetFromWorkbook(workbookPath);
  await replaceCuesheet(eventId, {
    rows: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: "bootstrap",
  });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const { email, password } = parsed.data;
  const users = await listUsers();
  const user =
    users.find(
      (item) => item.email.trim().toLowerCase() === email.trim().toLowerCase() && item.active,
    ) ?? null;
  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = createAuthToken(user.id);
  return res.json({ token, user });
});

app.get("/api/current-user", async (req, res) => {
  const user = await resolveRequestUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  return res.json(user);
});

app.get(
  "/api/users",
  withSuperAdmin(async (_req, res) => {
    res.json(await listUsers());
  }),
);

app.post(
  "/api/users",
  withSuperAdmin(async (req, res) => {
    const parsed = userSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const created = await createUser(parsed.data);
    return res.status(201).json(created);
  }),
);

app.patch(
  "/api/users/:userId",
  withSuperAdmin(async (req, res) => {
    const parsed = userPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const updated = await updateUser(req.params.userId, parsed.data);
    if (!updated) return res.status(404).json({ error: "User not found" });
    return res.json(updated);
  }),
);

app.delete(
  "/api/users/:userId",
  withSuperAdmin(async (req, res) => {
    const removed = await deleteUser(req.params.userId);
    if (!removed) return res.status(404).json({ error: "User not found or protected user" });
    return res.json(removed);
  }),
);

app.get(
  "/api/personnel",
  withSuperAdmin(async (req, res) => {
    const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
    res.json(await listPersonnel(tournamentId));
  }),
);

app.post(
  "/api/personnel",
  withSuperAdmin(async (req, res) => {
    const parsed = personnelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
    const created = await createPersonnel(parsed.data, tournamentId ?? parsed.data.tournamentId ?? null);
    return res.status(201).json(created);
  }),
);

app.patch(
  "/api/personnel/:personnelId",
  withSuperAdmin(async (req, res) => {
    const parsed = personnelPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }
    const updated = await updatePersonnel(req.params.personnelId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Personnel not found" });
    return res.json(updated);
  }),
);

app.delete(
  "/api/personnel/:personnelId",
  withSuperAdmin(async (req, res) => {
    const removed = await deletePersonnel(req.params.personnelId);
    if (!removed) return res.status(404).json({ error: "Personnel not found" });
    removePersonnelDocumentFiles(removed.documents);
    return res.json(removed);
  }),
);

app.post(
  "/api/personnel/expenses/parse",
  withSuperAdmin(async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    return res.json(parseExpenseText(text));
  }),
);

app.post(
  "/api/personnel/expenses/parse-pdf",
  upload.single("file"),
  withSuperAdmin(async (req, res) => {
    const debugRequested =
      String(req.query?.debug ?? "").trim() === "1" || String(process.env.PARSER_DEBUG || "").trim() === "1";
    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }
    const fileName = String(req.file.originalname || "");
    const loweredFileName = fileName.toLowerCase();
    const mimeType = String(req.file.mimetype || "").toLowerCase();
    const header = fs.readFileSync(req.file.path).subarray(0, 4).toString("utf8");
    const isPdf = mimeType.includes("pdf") || loweredFileName.endsWith(".pdf") || header === "%PDF";
    if (!isPdf) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: "Only PDF files are supported" });
    }

    try {
      const parsed = await parseFinancePdfWithAgent({
        filePath: req.file.path,
        fileName,
        debug: debugRequested,
      });
      return res.json(parsed);
    } catch (error) {
      return res.status(422).json({
        amount: null,
        currency: "EUR",
        vendor: null,
        documentDate: null,
        summary: "",
        notes: "",
        expenses: [],
        source: "openai_agents_error",
        parserError: error instanceof Error ? error.message : "Failed to parse PDF with OpenAI Agents",
      });
    } finally {
      safeUnlink(req.file.path);
    }
  }),
);

app.post(
  "/api/personnel/:personnelId/documents",
  upload.single("file"),
  withSuperAdmin(async (req, res) => {
    const personnel = await getPersonnelById(req.params.personnelId);
    if (!personnel) {
      safeUnlink(req.file?.path);
      return res.status(404).json({ error: "Personnel not found" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }

    const documentId = randomUUID();
    const categoryRaw = String(req.body?.category || "misc").trim().toLowerCase();
    const category = ["compliance", "finance", "misc"].includes(categoryRaw) ? categoryRaw : "misc";
    const now = new Date().toISOString();
    const stored = createStoredDocumentPath({
      personnelId: personnel.id,
      documentId,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    try {
      fs.renameSync(req.file.path, stored.absolutePath);

      const parsedExpenses = (() => {
        const raw = req.body?.parsedExpenses;
        if (typeof raw !== "string" || !raw.trim()) return [];
        try {
          const decoded = JSON.parse(raw);
          return Array.isArray(decoded) ? decoded : [];
        } catch {
          return [];
        }
      })();

      const amountRaw = Number(String(req.body?.financeAmount ?? "").replace(",", "."));
      const financeAmount = Number.isFinite(amountRaw) ? amountRaw : null;

      const nextDocument = {
        id: documentId,
        name: String(req.body?.name || req.file.originalname).trim() || req.file.originalname,
        category,
        fileName: req.file.originalname,
        fileUrl: stored.publicUrl,
        filePath: stored.absolutePath,
        mimeType: req.file.mimetype || null,
        sizeBytes: Number.isFinite(req.file.size) ? Number(req.file.size) : null,
        uploadedAt: now,
        notes: String(req.body?.notes || "").trim() || null,
        compliance: {
          documentType: String(req.body?.complianceType || "").trim() || null,
          referenceCode: String(req.body?.complianceReference || "").trim() || null,
        },
        finance: {
          amount: financeAmount,
          currency: String(req.body?.financeCurrency || "").trim() || null,
          vendor: String(req.body?.financeVendor || "").trim() || null,
          documentDate: String(req.body?.financeDate || "").trim() || null,
          summary: String(req.body?.financeSummary || "").trim() || null,
          parsedExpenses,
        },
        misc: {
          tags: String(req.body?.miscTags || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      };

      const currentDocs = Array.isArray(personnel.documents) ? personnel.documents : [];
      const currentExpenses = Array.isArray(personnel.expenses) ? personnel.expenses : [];
      const mergedExpenses =
        category === "finance" && parsedExpenses.length ? [...currentExpenses, ...parsedExpenses] : currentExpenses;

      const updated = await updatePersonnel(personnel.id, {
        documents: [...currentDocs, nextDocument],
        expenses: mergedExpenses,
      });
      if (!updated) {
        removePersonnelDocumentFile(nextDocument);
        return res.status(500).json({ error: "Failed to persist document" });
      }
      return res.status(201).json(nextDocument);
    } catch (error) {
      safeUnlink(req.file.path);
      safeUnlink(stored.absolutePath);
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to upload document",
      });
    }
  }),
);

app.patch(
  "/api/personnel/:personnelId/documents/:documentId",
  upload.single("file"),
  withSuperAdmin(async (req, res) => {
    const personnel = await getPersonnelById(req.params.personnelId);
    if (!personnel) {
      safeUnlink(req.file?.path);
      return res.status(404).json({ error: "Personnel not found" });
    }
    const docs = Array.isArray(personnel.documents) ? personnel.documents : [];
    const index = docs.findIndex((item) => item.id === req.params.documentId);
    if (index === -1) {
      safeUnlink(req.file?.path);
      return res.status(404).json({ error: "Document not found" });
    }

    const current = docs[index];
    let nextFileName = current.fileName;
    let nextMime = current.mimeType;
    let nextSize = current.sizeBytes;
    let nextFileUrl = current.fileUrl;
    let nextFilePath = current.filePath;

    if (req.file) {
      const stored = createStoredDocumentPath({
        personnelId: personnel.id,
        documentId: current.id,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      fs.renameSync(req.file.path, stored.absolutePath);
      removePersonnelDocumentFile(current);
      nextFileName = req.file.originalname;
      nextMime = req.file.mimetype || null;
      nextSize = Number.isFinite(req.file.size) ? Number(req.file.size) : null;
      nextFileUrl = stored.publicUrl;
      nextFilePath = stored.absolutePath;
    }

    const parsedExpenses = (() => {
      const raw = req.body?.parsedExpenses;
      if (typeof raw !== "string") return current.finance?.parsedExpenses || [];
      if (!raw.trim()) return [];
      try {
        const decoded = JSON.parse(raw);
        return Array.isArray(decoded) ? decoded : [];
      } catch {
        return current.finance?.parsedExpenses || [];
      }
    })();

    const amountRaw = Number(String(req.body?.financeAmount ?? current.finance?.amount ?? "").replace(",", "."));
    const financeAmount = Number.isFinite(amountRaw) ? amountRaw : null;

    const categoryRaw = String(req.body?.category || current.category || "misc").trim().toLowerCase();
    const category = ["compliance", "finance", "misc"].includes(categoryRaw) ? categoryRaw : "misc";

    const updatedDoc = {
      ...current,
      name: String(req.body?.name ?? current.name ?? "").trim() || current.name,
      category,
      fileName: nextFileName || null,
      fileUrl: nextFileUrl || null,
      filePath: nextFilePath || null,
      mimeType: nextMime || null,
      sizeBytes: nextSize ?? null,
      notes: String(req.body?.notes ?? current.notes ?? "").trim() || null,
      compliance: {
        documentType: String(req.body?.complianceType ?? current.compliance?.documentType ?? "").trim() || null,
        referenceCode: String(req.body?.complianceReference ?? current.compliance?.referenceCode ?? "").trim() || null,
      },
      finance: {
        amount: financeAmount,
        currency: String(req.body?.financeCurrency ?? current.finance?.currency ?? "").trim() || null,
        vendor: String(req.body?.financeVendor ?? current.finance?.vendor ?? "").trim() || null,
        documentDate: String(req.body?.financeDate ?? current.finance?.documentDate ?? "").trim() || null,
        summary: String(req.body?.financeSummary ?? current.finance?.summary ?? "").trim() || null,
        parsedExpenses,
      },
      misc: {
        tags: String(
          req.body?.miscTags ??
            (Array.isArray(current.misc?.tags) ? current.misc.tags.join(",") : ""),
        )
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
    };

    const nextDocs = [...docs];
    nextDocs[index] = updatedDoc;
    const updated = await updatePersonnel(personnel.id, { documents: nextDocs });
    if (!updated) {
      return res.status(500).json({ error: "Failed to update document" });
    }
    return res.json(updatedDoc);
  }),
);

app.delete(
  "/api/personnel/:personnelId/documents/:documentId",
  withSuperAdmin(async (req, res) => {
    const personnel = await getPersonnelById(req.params.personnelId);
    if (!personnel) return res.status(404).json({ error: "Personnel not found" });
    const docs = Array.isArray(personnel.documents) ? personnel.documents : [];
    const index = docs.findIndex((item) => item.id === req.params.documentId);
    if (index === -1) return res.status(404).json({ error: "Document not found" });
    const [removedDoc] = docs.splice(index, 1);
    removePersonnelDocumentFile(removedDoc);
    const updated = await updatePersonnel(personnel.id, { documents: docs });
    if (!updated) return res.status(500).json({ error: "Failed to delete document" });
    return res.json(removedDoc);
  }),
);

app.get("/api/tournaments", withPrivilege("tournaments", "view", async (_req, res) => {
  res.json(await listTournaments());
}));

app.post("/api/tournaments", withPrivilege("tournaments", "create", async (req, res, user) => {
  const parsed = tournamentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const created = await createTournament(parsed.data, actorFromRequest(req, user));
  return res.status(201).json(created);
}));

app.patch("/api/tournaments/:tournamentId", withPrivilege("tournaments", "edit", async (req, res, user) => {
  const parsed = tournamentPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const updated = await updateTournament(req.params.tournamentId, parsed.data, actorFromRequest(req, user));
  if (!updated) {
    return res.status(404).json({ error: "Tournament not found" });
  }
  return res.json(updated);
}));

app.delete("/api/tournaments/:tournamentId", withPrivilege("tournaments", "delete", async (req, res, user) => {
  const removed = await deleteTournament(req.params.tournamentId, actorFromRequest(req, user));
  if (!removed) {
    return res.status(404).json({ error: "Tournament not found" });
  }
  return res.json(removed);
}));

app.get("/api/events", withPrivilege("events", "view", async (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(await listPlannerEvents(tournamentId));
}));

app.get("/api/venues", withPrivilege("venues", "view", async (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(await listVenues(tournamentId));
}));

app.post("/api/venues", withPrivilege("venues", "create", async (req, res, user) => {
  const parsed = venueSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const venue = await createVenue(parsed.data, actorFromRequest(req, user), tournamentId ?? parsed.data.tournamentId);
  return res.status(201).json(venue);
}));

app.get("/api/teams", withPrivilege("teams", "view", async (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(await listTeams(tournamentId));
}));

app.post("/api/teams", withPrivilege("teams", "create", async (req, res, user) => {
  const parsed = teamSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const team = await createTeam(parsed.data, actorFromRequest(req, user), tournamentId ?? parsed.data.tournamentId);
  return res.status(201).json(team);
}));

app.patch("/api/teams/:teamId", withPrivilege("teams", "edit", async (req, res, user) => {
  const parsed = teamPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const updated = await updateTeam(req.params.teamId, parsed.data, actorFromRequest(req, user));
  if (!updated) {
    return res.status(404).json({ error: "Team not found" });
  }
  return res.json(updated);
}));

app.delete("/api/teams/:teamId", withPrivilege("teams", "delete", async (req, res) => {
  const removed = await deleteTeam(req.params.teamId);
  if (!removed) {
    return res.status(404).json({ error: "Team not found" });
  }
  return res.json(removed);
}));

app.get("/api/activations", withPrivilege("activations", "view", async (req, res) => {
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  res.json(await listActivations(tournamentId));
}));

app.post("/api/activations", withPrivilege("activations", "create", async (req, res, user) => {
  const parsed = activationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const activation = await createActivation(
    parsed.data,
    actorFromRequest(req, user),
    tournamentId ?? parsed.data.tournamentId,
  );
  return res.status(201).json(activation);
}));

app.patch("/api/activations/:activationId", withPrivilege("activations", "edit", async (req, res, user) => {
  const parsed = activationPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const updated = await updateActivation(req.params.activationId, parsed.data, actorFromRequest(req, user));
  if (!updated) {
    return res.status(404).json({ error: "Activation not found" });
  }
  return res.json(updated);
}));

app.delete("/api/activations/:activationId", withPrivilege("activations", "delete", async (req, res) => {
  const removed = await deleteActivation(req.params.activationId);
  if (!removed) {
    return res.status(404).json({ error: "Activation not found" });
  }
  return res.json(removed);
}));

app.post("/api/activations/upload", upload.single("file"), withPrivilege("activations", "upload", async (req, res, user) => {
  if (!req.file) {
    return res.status(400).json({ error: "File missing" });
  }
  const tags = String(req.body?.tags ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const activation = await createActivation(
    {
      name: path.parse(req.file.originalname || "Activation").name,
      fileName: req.file.originalname || null,
      mimeType: req.file.mimetype || null,
      sizeBytes: req.file.size || null,
      durationMs: null,
      tags,
    },
    actorFromRequest(req, user),
    typeof req.query.tournamentId === "string" ? req.query.tournamentId : null,
  );

  safeUnlink(req.file.path);
  return res.status(201).json(activation);
}));

app.post("/api/events", withPrivilege("events", "create", async (req, res, user) => {
  const parsed = plannerEventSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  const created = await createPlannerEvent(
    { ...parsed.data, tournamentId: tournamentId ?? parsed.data.tournamentId },
    actorFromRequest(req, user),
  );
  await broadcastSnapshot(created.event.id);
  return res.status(201).json(created);
}));

app.patch("/api/events/:eventId", withPrivilege("events", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  if (tournamentId && found.snapshot?.event?.tournamentId && found.snapshot.event.tournamentId !== tournamentId) {
    return res.status(404).json({ error: "Event not found" });
  }

  const parsed = plannerEventPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const updated = await updatePlannerEvent(found.eventId, parsed.data, actorFromRequest(req, user));
  if (!updated) {
    return res.status(404).json({ error: "Event not found" });
  }

  await broadcastSnapshot(found.eventId);
  return res.json(updated);
}));

app.delete("/api/events/:eventId", withPrivilege("events", "delete", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;
  const tournamentId = typeof req.query.tournamentId === "string" ? req.query.tournamentId : null;
  if (tournamentId && found.snapshot?.event?.tournamentId && found.snapshot.event.tournamentId !== tournamentId) {
    return res.status(404).json({ error: "Event not found" });
  }
  const removed = await deletePlannerEvent(found.eventId, actorFromRequest(req, user));
  if (!removed) {
    return res.status(404).json({ error: "Event not found" });
  }
  io.emit("planner:event-deleted", { eventId: removed.id });
  return res.json(removed);
}));

app.get("/api/events/:eventId/cuesheet", withPrivilege("cuesheet", "view", async (req, res) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;
  return res.json(found.snapshot);
}));

app.get("/api/events/:eventId/versions", withPrivilege("cuesheet", "view", async (req, res) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;
  const limit = Number(req.query.limit ?? 100);
  const versions = await getVersions(found.eventId, limit);
  return res.json(versions ?? []);
}));

app.patch("/api/events/:eventId/match", withPrivilege("cuesheet", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const parsed = matchInfoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = await updateMatchInfo(found.eventId, parsed.data, actorFromRequest(req, user));
  if (!next) {
    return res.status(404).json({ error: "Event not found" });
  }

  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

app.post("/api/events/:eventId/cuesheet/import-default", withPrivilege("cuesheet", "import", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const workbookPath = findDefaultWorkbook(projectRoot);
  if (!workbookPath) {
    return res.status(404).json({ error: "No default XLSX found in project root" });
  }

  const parsed = parseCueSheetFromWorkbook(workbookPath);
  const next = await replaceCuesheet(found.eventId, {
    rows: parsed.events,
    sourceFile: path.basename(workbookPath),
    actor: actorFromRequest(req, user),
  });

  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

app.post("/api/events/:eventId/cuesheet/import-xlsx", upload.single("file"), withPrivilege("cuesheet", "import", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  if (!req.file?.path) {
    return res.status(400).json({ error: "File missing" });
  }

  try {
    const parsed = parseCueSheetFromWorkbook(req.file.path);
    const next = await replaceCuesheet(found.eventId, {
      rows: parsed.events,
      sourceFile: req.file.originalname ?? "uploaded.xlsx",
      actor: actorFromRequest(req, user),
    });
    await broadcastSnapshot(found.eventId);
    return res.json(next);
  } catch (error) {
    return res.status(400).json({
      error: "Invalid XLSX file",
      details: error instanceof Error ? error.message : String(error),
    });
  } finally {
    safeUnlink(req.file.path);
  }
}));

app.post("/api/events/:eventId/rows", withPrivilege("cuesheet", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const parsed = rowSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = await createRow(found.eventId, parsed.data, actorFromRequest(req, user));
  await broadcastSnapshot(found.eventId);
  return res.status(201).json(next);
}));

app.patch("/api/events/:eventId/rows/:rowId", withPrivilege("cuesheet", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const parsed = rowSchema.partial().safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const next = await updateRow(found.eventId, req.params.rowId, parsed.data, actorFromRequest(req, user));
  if (!next) {
    return res.status(404).json({ error: "Row not found" });
  }

  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

app.delete("/api/events/:eventId/rows/:rowId", withPrivilege("cuesheet", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const next = await deleteRow(found.eventId, req.params.rowId, actorFromRequest(req, user));
  if (!next) {
    return res.status(404).json({ error: "Row not found" });
  }

  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

app.post("/api/events/:eventId/rows/reorder", withPrivilege("cuesheet", "reorder", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : null;
  if (!orderedIds) {
    return res.status(400).json({ error: "orderedIds array required" });
  }

  const next = await reorderRows(found.eventId, orderedIds, actorFromRequest(req, user));
  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

app.post("/api/events/:eventId/rows/restore", withPrivilege("cuesheet", "edit", async (req, res, user) => {
  const found = await ensureEventOr404(req, res);
  if (!found) return;

  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) {
    return res.status(400).json({ error: "rows array required" });
  }

  const next = await restoreRows(found.eventId, rows, actorFromRequest(req, user));
  await broadcastSnapshot(found.eventId);
  return res.json(next);
}));

io.on("connection", () => {
  // Event snapshots are fetched via HTTP on route enter.
});

if (process.env.BOOTSTRAP_DEFAULT_XLSX === "1") {
  void tryBootstrapFromDefaultWorkbook();
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const PORT = Number(process.env.PORT || 8080);
  server.listen(PORT, () => {
    console.log(`[backend] CueSheet API listening on http://localhost:${PORT}`);
  });
}

export { app, server, io };

