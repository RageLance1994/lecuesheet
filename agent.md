# Modal UX Rule

- Any active modal must close on outside click.
- If there are unsaved changes (non-empty inputs / edited fields), show a short custom confirmation prompt before closing.
- Confirmation copy must stay concise.
- If a component is potentially reusable, standardize it as a shared component instead of creating page-specific standalone duplicates.

# ATSCRM Pattern: Expense PDF Dropzone (Foreign Invoices style)

Use this exact flow when an expense parser is requested:

1. UI (frontend modal/page)
- Use a visible dropzone container with drag/drop handlers:
  - `onDragOver`: `event.preventDefault()`
  - `onDrop`: `event.preventDefault()` + pick files from `event.dataTransfer.files`
- Add hidden file input (`accept=".pdf,application/pdf"`) triggered by a button.
- Keep selected file in local state, show selected filename in dropzone.
- Add a dedicated parse button (`Parse Expenses`) disabled if no file is selected or parsing is in progress.

2. Frontend API call
- Build `FormData`, append file as `"file"`.
- POST to a multipart endpoint dedicated to parser uploads.
- Expect normalized parsed rows array back, then merge into current draft state.

3. Backend endpoint
- Route with `multer.single("file")`.
- Validate MIME/extension and reject non-PDF with `400`.
- Read uploaded PDF and extract text (`pdf-parse`).
- Convert extracted text into normalized expenses via shared parser function.
- Always cleanup temp file in `finally`.

4. Parser behavior
- Reuse one canonical normalization path (`normalizeExpenseItem`).
- Detect amount, currency, and category from text lines.
- Return normalized array only (no UI-specific structure).

5. UX guardrails
- Keep explicit loading state while parsing.
- Keep error feedback inline in current modal/page.
- Do not auto-submit create/edit forms after parse; only enrich draft data.

# Copywriting Rule

- Never add verbose helper subtitles/hints in page content unless explicitly requested.
- Keep support copy minimal and functional (short labels only).
