import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Server as SocketServer } from "socket.io";
import { createServer } from "node:http";
import { z } from "zod";
import pdfParse from "pdf-parse";
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
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  listPersonnel,
  createPersonnel,
  updatePersonnel,
  deletePersonnel,
  parseExpenseText,
} from "./src/store.js";
import { parseCueSheetFromWorkbook, findDefaultWorkbook } from "./src/xlsx.js";
import { extractJsonObject, runOpenAIParse } from "./src/openai.js";

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
    federation: optionalTextSchema,
    logoUrl: optionalTextSchema,
    keyPeople: z.array(z.string()).optional(),
    matchesCount: z.number().int().nonnegative().nullable().optional(),
    format: optionalTextSchema,
    teamsCount: z.number().int().nonnegative().nullable().optional(),
    hostCountries: z.array(z.string()).optional(),
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

function hasPrivilege(user, page, action) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  return Boolean(user.privileges?.[page]?.[action]);
}

async function resolveRequestUser(req) {
  const requestedUserId = req.header("x-user-id")?.trim() || "super-admin";
  const user = await getUserById(requestedUserId);
  if (user) return user;
  return getUserById("super-admin");
}

function withPrivilege(page, action, handler) {
  return async (req, res) => {
    const user = await resolveRequestUser(req);
    if (!hasPrivilege(user, page, action)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    return handler(req, res, user);
  };
}

function withSuperAdmin(handler) {
  return async (req, res) => {
    const user = await resolveRequestUser(req);
    if (!user || user.role !== "super_admin") {
      return res.status(403).json({ error: "Super admin required" });
    }
    return handler(req, res, user);
  };
}

function actorFromRequest(req, user) {
  return user?.email || req.header("x-user")?.trim() || "operator";
}

function normalizeMoney(value) {
  const raw = String(value || "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractHeuristicFinanceFromText(text) {
  const source = String(text || "");
  const amountLine =
    source.match(/(?:Ammontare|Amount)\s*[:\-]?\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*(EUR|USD|GBP|AED|SAR)?/i) ||
    source.match(/([0-9]+(?:[.,][0-9]{1,2})?)\s*(EUR|USD|GBP|AED|SAR)\b/i);
  const vendorLine =
    source.match(/(?:Paid\s*For|Payment\s*For|Descrizione|Merchant)\s*[:\-]?\s*(.+)/i) || null;
  const dateLine =
    source.match(/(\d{1,2}\s+[A-Za-zÀ-ÿ]+\s*,?\s*\d{4})/) ||
    source.match(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/) ||
    null;

  const amount = normalizeMoney(amountLine?.[1]);
  const currency = String(amountLine?.[2] || "EUR").trim().toUpperCase();
  const vendor = vendorLine?.[1]?.trim() || null;
  const documentDate = dateLine?.[1]?.trim() || null;

  const expenses =
    amount && amount > 0
      ? parseExpenseText(`${vendor || "service fee"} ${amount} ${currency}`).map((item) => ({
          ...item,
          category: item.category === "other" ? "fees" : item.category,
          vendor: item.vendor || vendor,
          date: item.date || documentDate,
        }))
      : [];

  return {
    amount: amount ?? 0,
    currency,
    vendor,
    documentDate,
    summary: amount && amount > 0 ? "Heuristic finance extraction" : "",
    expenses,
  };
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
    if (!req.file) {
      return res.status(400).json({ error: "File missing" });
    }
    const fileName = String(req.file.originalname || "").toLowerCase();
    const mimeType = String(req.file.mimetype || "").toLowerCase();
    const header = fs.readFileSync(req.file.path).subarray(0, 4).toString("utf8");
    const isPdf = mimeType.includes("pdf") || fileName.endsWith(".pdf") || header === "%PDF";
    if (!isPdf) {
      safeUnlink(req.file.path);
      return res.status(400).json({ error: "Only PDF files are supported" });
    }

    try {
      const pdfBuffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(pdfBuffer);
      const text = String(parsed?.text || "").trim();
      if (!text) {
        return res.json({
          amount: null,
          currency: "EUR",
          vendor: null,
          documentDate: null,
          summary: "",
          expenses: [],
          source: "empty",
        });
      }

      const fallbackExpenses = parseExpenseText(text);
      const fallbackAmount = fallbackExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const fallbackCurrency = fallbackExpenses[0]?.currency || "EUR";
      const heuristic = extractHeuristicFinanceFromText(text);

      const hasOpenAIKey = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
      if (!hasOpenAIKey) {
        const amount = heuristic.amount > 0 ? heuristic.amount : fallbackAmount;
        const expenses = heuristic.expenses.length ? heuristic.expenses : fallbackExpenses;
        return res.json({
          amount,
          currency: heuristic.currency || fallbackCurrency,
          vendor: heuristic.vendor,
          documentDate: heuristic.documentDate,
          summary:
            heuristic.summary ||
            (expenses.length ? `${expenses.length} parsed expense items` : ""),
          expenses,
          source: "fallback",
        });
      }

      const systemPrompt = `You extract finance data from a PDF text.
Return ONLY valid JSON in this exact format:
{
  "amount": 0,
  "currency": "EUR",
  "vendor": "",
  "documentDate": "YYYY-MM-DD",
  "summary": "",
  "expenses": [
    {"category":"other","description":"","amount":0,"currency":"EUR","date":null,"vendor":null,"notes":null}
  ]
}
Rules:
- "amount" is the grand total of the document (if not explicit, sum line items).
- "currency" should be the dominant currency code (EUR/USD/GBP/AED/SAR), default EUR.
- "documentDate" must be YYYY-MM-DD when inferable, else empty string.
- Keep expenses concise and meaningful.`;

      const aiText = await runOpenAIParse({
        systemPrompt,
        userPrompt: `Extract structured finance data from this PDF text:\n${text}`,
      });
      const aiJson = extractJsonObject(aiText);

      const aiExpensesRaw = Array.isArray(aiJson?.expenses) ? aiJson.expenses : [];
      const aiExpensesText = aiExpensesRaw
        .map((item) => {
          const description = String(item?.description || "").trim();
          const amount = Number(item?.amount || 0);
          const currency = String(item?.currency || aiJson?.currency || "EUR").trim().toUpperCase();
          return `${description} ${amount} ${currency}`.trim();
        })
        .filter(Boolean)
        .join("\n");

      const aiExpenses = aiExpensesText ? parseExpenseText(aiExpensesText) : [];
      const amountCandidate = Number(aiJson?.amount);
      const heuristicAmount = heuristic.amount > 0 ? heuristic.amount : 0;
      const amount = Number.isFinite(amountCandidate)
        ? amountCandidate
        : aiExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0) ||
          heuristicAmount ||
          fallbackAmount;
      const currency = String(aiJson?.currency || aiExpenses[0]?.currency || fallbackCurrency || "EUR")
        .trim()
        .toUpperCase();
      const vendor =
        typeof aiJson?.vendor === "string" && aiJson.vendor.trim()
          ? aiJson.vendor.trim()
          : heuristic.vendor;
      const documentDate =
        typeof aiJson?.documentDate === "string" && aiJson.documentDate.trim()
          ? aiJson.documentDate.trim()
          : heuristic.documentDate;
      const summary =
        typeof aiJson?.summary === "string" && aiJson.summary.trim()
          ? aiJson.summary.trim()
          : aiExpenses.length
            ? `${aiExpenses.length} parsed expense items`
            : heuristic.summary;
      const expenses =
        aiExpenses.length
          ? aiExpenses
          : heuristic.expenses.length
            ? heuristic.expenses
            : fallbackExpenses;

      return res.json({
        amount,
        currency,
        vendor,
        documentDate,
        summary,
        expenses,
        source: "openai",
      });
    } catch (error) {
      const pdfBuffer = fs.readFileSync(req.file.path);
      const parsed = await pdfParse(pdfBuffer);
      const text = String(parsed?.text || "").trim();
      const fallbackExpenses = parseExpenseText(text);
      const fallbackAmount = fallbackExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const heuristic = extractHeuristicFinanceFromText(text);
      const amount = heuristic.amount > 0 ? heuristic.amount : fallbackAmount;
      const expenses = heuristic.expenses.length ? heuristic.expenses : fallbackExpenses;
      return res.json({
        amount,
        currency: heuristic.currency || fallbackExpenses[0]?.currency || "EUR",
        vendor: heuristic.vendor,
        documentDate: heuristic.documentDate,
        summary:
          heuristic.summary ||
          (expenses.length ? `${expenses.length} parsed expense items` : ""),
        expenses,
        source: "fallback_error",
        parserError: error instanceof Error ? error.message : "Failed to parse with OpenAI",
      });
    } finally {
      safeUnlink(req.file.path);
    }
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
