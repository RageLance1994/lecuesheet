import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { Agent, run } from "@openai/agents";
import { z } from "zod";

const financeEntrySchema = z.object({
  item: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1),
});

const financeExtractionSchema = z.object({
  item: z.string().min(1),
  total: z.number().positive(),
  currency: z.string().min(1),
  notes: z.string().min(1),
  vendor: z.string().optional().nullable(),
  documentDate: z.string().optional().nullable(),
  entries: z.array(financeEntrySchema).default([]),
});

function normalizeCurrency(value) {
  return String(value || "EUR").trim().toUpperCase() || "EUR";
}

function makeExpense(entry, fallbackVendor, fallbackDate) {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    category: "other",
    description: String(entry?.item || "").trim() || "expense",
    amount: Number(entry?.amount || 0),
    currency: normalizeCurrency(entry?.currency),
    date: fallbackDate || null,
    vendor: fallbackVendor || null,
    notes: null,
  };
}

export async function parseFinancePdfWithAgent({
  filePath,
  fileName,
  debug = false,
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey });
  const fallbackName = path.basename(filePath || "document.pdf");
  const rawName = String(fileName || fallbackName || "document.pdf").trim();
  const uploadName = /\.[a-z0-9]+$/i.test(rawName) ? rawName : `${rawName}.pdf`;
  const uploadFile = await toFile(fs.readFileSync(filePath), uploadName, {
    type: "application/pdf",
  });
  const uploaded = await client.files.create({
    file: uploadFile,
    purpose: "user_data",
  });

  const agentInstructions = `You are a finance extraction agent.
You must read the attached PDF document and return structured expense data.

Hard requirements:
- Return one consolidated financial output in the schema.
- "item" must be the main paid item/service.
- "total" must be a positive number.
- "currency" must be the currency for "total".
- "notes" must be a short business summary of what was paid.
- "entries" must contain at least one item if payment exists.
- Ignore non-financial identifiers (PIN, card tail, transaction IDs).
- If the document contains both a local-currency charge and a "credits purchased" line, prefer the "credits purchased" amount as main "total" and keep the other amount as additional entry.
- Do not invent values.`;

  const userPrompt = `Analyze the attached file and extract:
1) item
2) total
3) currency
4) notes
5) optional vendor and documentDate
6) entries[] with item/amount/currency`;

  try {
    const agent = new Agent({
      name: "Personnel Finance Extractor",
      instructions: agentInstructions,
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      outputType: financeExtractionSchema,
      modelSettings: {
        temperature: 0,
      },
    });

    const result = await run(agent, [
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_file", file: { id: uploaded.id } },
        ],
      },
    ]);

    const parsed = financeExtractionSchema.parse(result.finalOutput);
    const vendor = parsed.vendor ? String(parsed.vendor).trim() : null;
    const documentDate = parsed.documentDate ? String(parsed.documentDate).trim() : null;
    const entries =
      parsed.entries.length > 0
        ? parsed.entries.map((entry) => makeExpense(entry, vendor, documentDate))
        : [makeExpense({ item: parsed.item, amount: parsed.total, currency: parsed.currency }, vendor, documentDate)];

    return {
      item: String(parsed.item || "").trim(),
      total: Number(parsed.total),
      amount: Number(parsed.total),
      currency: normalizeCurrency(parsed.currency),
      vendor,
      documentDate,
      summary: `${entries.length} parsed expense items`,
      notes: String(parsed.notes || "").trim(),
      expenses: entries,
      source: "openai_agents",
      ...(debug
        ? {
            debug: {
              prompt: {
                instructions: agentInstructions,
                userPrompt,
              },
              uploadedFileId: uploaded.id,
              finalOutput: parsed,
            },
          }
        : {}),
    };
  } finally {
    await client.files.delete(uploaded.id).catch(() => {});
  }
}
