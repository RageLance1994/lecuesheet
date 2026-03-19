import path from "node:path";
import fs from "node:fs";
import XLSX from "xlsx";

function formatExcelTime(value) {
  if (value instanceof Date) {
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    const ss = String(value.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  if (typeof value === "string") {
    const isoDate = new Date(value);
    if (!Number.isNaN(isoDate.valueOf()) && value.includes("T")) {
      const hh = String(isoDate.getUTCHours()).padStart(2, "0");
      const mm = String(isoDate.getUTCMinutes()).padStart(2, "0");
      const ss = String(isoDate.getUTCSeconds()).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    }
  }
  return String(value ?? "").trim();
}

function normalizeHeader(value, index) {
  if (!value) return `column_${index + 1}`;
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "") || `column_${index + 1}`;
}

function pickHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const filled = rows[i].filter((cell) => String(cell ?? "").trim()).length;
    if (filled > bestScore) {
      bestScore = filled;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function pickField(rowObject, keys) {
  for (const key of keys) {
    const found = Object.entries(rowObject).find(([header]) =>
      header.includes(key),
    );
    if (found && String(found[1] ?? "").trim()) {
      return String(found[1]).trim();
    }
  }
  return "";
}

export function parseCueSheetFromWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    raw: false,
  });

  const preferredSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[preferredSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (!rows.length) {
    return { events: [], sourceSheet: preferredSheet };
  }

  const headerRowIndex = pickHeaderRow(rows);
  const rawHeaders = rows[headerRowIndex] ?? [];
  const headers = rawHeaders.map((header, index) => normalizeHeader(header, index));

  const events = rows
    .slice(headerRowIndex + 1)
    .map((row, idx) => {
      const rowObject = headers.reduce((acc, header, colIndex) => {
        acc[header] = row[colIndex] ?? "";
        return acc;
      }, {});

      const hasData = Object.values(rowObject).some((value) =>
        String(value ?? "").trim(),
      );
      if (!hasData) return null;

      return {
        sourceRow: headerRowIndex + idx + 2,
        timecode: formatExcelTime(
          pickField(rowObject, [
            "time_of_day",
            "time",
            "orario",
            "tc",
            "timestamp",
          ]),
        ),
        category: pickField(rowObject, [
          "category",
          "sezione",
          "type",
          "tipo",
          "half",
          "phase",
        ]),
        cue: pickField(rowObject, [
          "activity",
          "cue",
          "evento",
          "event",
          "azione",
          "title",
        ]),
        asset: pickField(rowObject, [
          "video_board",
          "led",
          "audio",
          "asset",
          "template",
          "graf",
          "clip",
          "media",
        ]),
        operator: pickField(rowObject, ["operator", "regia", "owner", "op", "director"]),
        status: pickField(rowObject, ["status", "stato"]) || "pending",
        notes: pickField(rowObject, ["notes", "note", "comment"]),
        raw: rowObject,
      };
    })
    .filter(Boolean);

  return {
    events,
    sourceSheet: preferredSheet,
  };
}

export function findDefaultWorkbook(projectRoot) {
  const files = fs.readdirSync(projectRoot);
  const match = files.find((name) => /\.xlsx$/i.test(name));
  if (!match) return null;
  return path.join(projectRoot, match);
}
