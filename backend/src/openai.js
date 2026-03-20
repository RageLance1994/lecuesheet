import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runOpenAIParse({ systemPrompt, userPrompt }) {
  const apiKey = resolveOpenAIKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions: systemPrompt,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    temperature: 0.1,
    max_output_tokens: 1800,
  };

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error: ${errText}`);
  }

  const data = await response.json();
  return extractOutputText(data);
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === "string") chunks.push(part.text);
    }
  }
  return chunks.join("");
}

export function extractJsonObject(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
}

function resolveOpenAIKey() {
  const envKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (envKey) return envKey;

  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "atscrm", "backend", ".env"),
    path.resolve(__dirname, "..", "..", "..", "piplabs-prod", "dashboard", "app", ".env"),
  ];

  for (const envPath of candidates) {
    const key = readKeyFromEnvFile(envPath);
    if (key) {
      process.env.OPENAI_API_KEY = key;
      return key;
    }
  }
  return "";
}

function readKeyFromEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return "";
    const raw = fs.readFileSync(filePath, "utf8");
    const line = raw
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith("OPENAI_API_KEY="));
    if (!line) return "";
    const value = line.slice(line.indexOf("=") + 1).trim();
    if (!value) return "";
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1).trim();
    }
    return value;
  } catch {
    return "";
  }
}
