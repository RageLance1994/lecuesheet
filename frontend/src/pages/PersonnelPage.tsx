import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import {
  api,
  type ParsedPersonnelFinance,
  type PersonnelDocument,
  type PersonnelExpense,
  type PersonnelRecord,
  type Tournament,
  type UserAccount,
} from "../lib/api";

type Props = {
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
  pageAccess: {
    events: boolean;
    activations: boolean;
    venues: boolean;
    personnel: boolean;
    users: boolean;
  };
};

type DocumentTab = "compliance" | "finance" | "misc";

type DocumentDraft = {
  name: string;
  notes: string;
  complianceType: string;
  complianceReference: string;
  financeAmount: string;
  financeCurrency: string;
  financeVendor: string;
  financeDate: string;
  financeSummary: string;
  miscTags: string;
  parsedExpenses: PersonnelExpense[];
};

function isPersonnelExpenseArray(value: unknown): value is PersonnelExpense[] {
  return Array.isArray(value);
}

function isParsedPersonnelFinance(value: unknown): value is ParsedPersonnelFinance {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    "amount" in candidate &&
    "currency" in candidate &&
    "summary" in candidate &&
    "expenses" in candidate
  );
}

function createDocumentDraft(file?: File | null): DocumentDraft {
  const fileBase = String(file?.name || "")
    .replace(/\.[^/.]+$/, "")
    .trim();
  return {
    name: fileBase || "Document",
    notes: "",
    complianceType: "",
    complianceReference: "",
    financeAmount: "",
    financeCurrency: "EUR",
    financeVendor: "",
    financeDate: "",
    financeSummary: "",
    miscTags: "",
    parsedExpenses: [],
  };
}

export function PersonnelPage({
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
  pageAccess,
}: Props) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [rows, setRows] = useState<PersonnelRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [personnelModalOpen, setPersonnelModalOpen] = useState(false);
  const [editingPersonnelId, setEditingPersonnelId] = useState<string | null>(null);
  const [rowDropHoverId, setRowDropHoverId] = useState<string | null>(null);

  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentTab, setDocumentTab] = useState<DocumentTab>("compliance");
  const [documentTargetPersonnelId, setDocumentTargetPersonnelId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(createDocumentDraft(null));

  const [personnelDraft, setPersonnelDraft] = useState<Partial<PersonnelRecord>>({
    firstName: "",
    lastName: "",
    email: "",
    organization: "",
    role: "",
    department: "",
    managerUserId: null,
    placeOfService: "",
    arrivalDate: "",
    departureDate: "",
    offer: { duration: "", compensation: "", benefits: [] },
    expenses: [],
    documents: [],
  });

  async function loadAll() {
    setBusy(true);
    setError("");
    try {
      const [usersRows, personnelRows] = await Promise.all([
        api.getUsers(),
        api.getPersonnel(selectedTournamentId),
      ]);
      setUsers(usersRows);
      setRows(personnelRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [selectedTournamentId]);

  const managerOptions = useMemo(() => users.filter((user) => user.active), [users]);

  function openCreatePersonnel() {
    setEditingPersonnelId(null);
    setPersonnelDraft({
      firstName: "",
      lastName: "",
      email: "",
      organization: "",
      role: "",
      department: "",
      managerUserId: null,
      placeOfService: "",
      arrivalDate: "",
      departureDate: "",
      offer: { duration: "", compensation: "", benefits: [] },
      expenses: [],
      documents: [],
    });
    setPersonnelModalOpen(true);
  }

  function openEditPersonnel(entry: PersonnelRecord) {
    setEditingPersonnelId(entry.id);
    setPersonnelDraft(entry);
    setPersonnelModalOpen(true);
  }

  async function removePersonnel(entry: PersonnelRecord) {
    if (!window.confirm(`Delete personnel record for ${entry.firstName} ${entry.lastName}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deletePersonnel(entry.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function parseFinanceFromPdf(file: File) {
    setDocumentBusy(true);
    setError("");
    try {
      const parsedRaw = (await api.parsePersonnelFinanceFromPdf(file)) as unknown;
      const parsed: ParsedPersonnelFinance = isPersonnelExpenseArray(parsedRaw)
        ? {
            amount: parsedRaw.reduce((sum, item) => sum + Number(item.amount || 0), 0),
            currency: parsedRaw[0]?.currency || "EUR",
            vendor: parsedRaw.find((item) => item.vendor)?.vendor || null,
            documentDate: null,
            summary: parsedRaw.length ? `${parsedRaw.length} parsed expense items` : "",
            expenses: parsedRaw,
            source: "legacy_array",
          }
        : isParsedPersonnelFinance(parsedRaw)
          ? parsedRaw
          : {
              amount: null,
              currency: "EUR",
              vendor: null,
              documentDate: null,
              summary: "",
              expenses: [],
              source: "invalid_payload",
            };

      const total = Number(parsed.amount ?? 0);
      const currency = parsed.currency || "EUR";
      const vendor = parsed.vendor || "";
      const expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
      setDocumentDraft((prev) => ({
        ...prev,
        financeAmount: total > 0 ? total.toFixed(2) : prev.financeAmount,
        financeCurrency: currency || prev.financeCurrency || "EUR",
        financeVendor: vendor || prev.financeVendor,
        financeDate: parsed.documentDate || prev.financeDate,
        financeSummary: parsed.summary || (expenses.length ? `${expenses.length} parsed expense items` : prev.financeSummary),
        parsedExpenses: expenses,
      }));
      if (parsed.parserError) {
        setError(parsed.parserError);
      } else if (!expenses.length && total <= 0) {
        setError("No finance data extracted from this file.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDocumentBusy(false);
    }
  }

  async function openDocumentWizardFromDrop(personnel: PersonnelRecord, files: FileList | null) {
    const firstFile = Array.from(files ?? [])[0];
    if (!firstFile) return;
    setError("");
    setRowDropHoverId(null);
    setDocumentTargetPersonnelId(personnel.id);
    setDocumentFile(firstFile);
    setDocumentTab("compliance");
    setDocumentDraft(createDocumentDraft(firstFile));
    setDocumentModalOpen(true);
    setDocumentTab("finance");
    await parseFinanceFromPdf(firstFile);
  }

  async function saveDocumentRegistration() {
    if (!documentTargetPersonnelId || !documentFile) return;
    const target = rows.find((item) => item.id === documentTargetPersonnelId);
    if (!target) return;

    setDocumentBusy(true);
    setError("");
    try {
      const category = documentTab;
      const sizeBytes = Number.isFinite(documentFile.size) ? Number(documentFile.size) : null;
      const now = new Date().toISOString();
      const parsedAmount = Number(documentDraft.financeAmount.replace(",", "."));
      const financeAmount = Number.isFinite(parsedAmount) ? parsedAmount : null;

      const nextDocument: PersonnelDocument = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        name: documentDraft.name.trim() || documentFile.name,
        category,
        fileName: documentFile.name,
        mimeType: documentFile.type || null,
        sizeBytes,
        uploadedAt: now,
        notes: documentDraft.notes.trim() || null,
        compliance: {
          documentType: documentDraft.complianceType.trim() || null,
          referenceCode: documentDraft.complianceReference.trim() || null,
        },
        finance: {
          amount: financeAmount,
          currency: documentDraft.financeCurrency.trim() || null,
          vendor: documentDraft.financeVendor.trim() || null,
          documentDate: documentDraft.financeDate.trim() || null,
          summary: documentDraft.financeSummary.trim() || null,
          parsedExpenses: documentDraft.parsedExpenses,
        },
        misc: {
          tags: documentDraft.miscTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        },
      };

      const currentDocuments = Array.isArray(target.documents) ? target.documents : [];
      const currentExpenses = Array.isArray(target.expenses) ? target.expenses : [];
      const nextExpenses =
        category === "finance" && documentDraft.parsedExpenses.length
          ? [...currentExpenses, ...documentDraft.parsedExpenses]
          : currentExpenses;

      await api.updatePersonnel(target.id, {
        documents: [...currentDocuments, nextDocument],
        expenses: nextExpenses,
      });
      setDocumentModalOpen(false);
      setDocumentFile(null);
      setDocumentTargetPersonnelId(null);
      setDocumentDraft(createDocumentDraft(null));
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDocumentBusy(false);
    }
  }

  async function savePersonnel() {
    setBusy(true);
    setError("");
    try {
      if (!personnelDraft.firstName?.trim()) return;
      const payload = {
        tournamentId: selectedTournamentId,
        userId: personnelDraft.userId ?? null,
        firstName: personnelDraft.firstName ?? "",
        lastName: personnelDraft.lastName ?? "",
        email: personnelDraft.email ?? null,
        organization: personnelDraft.organization ?? null,
        arrivalDate: personnelDraft.arrivalDate ?? null,
        departureDate: personnelDraft.departureDate ?? null,
        offer: {
          duration: personnelDraft.offer?.duration ?? null,
          compensation: personnelDraft.offer?.compensation ?? null,
          benefits: Array.isArray(personnelDraft.offer?.benefits) ? personnelDraft.offer.benefits : [],
        },
        role: personnelDraft.role ?? null,
        department: personnelDraft.department ?? null,
        managerUserId: personnelDraft.managerUserId ?? null,
        placeOfService: personnelDraft.placeOfService ?? null,
        expenses: Array.isArray(personnelDraft.expenses) ? personnelDraft.expenses : [],
        documents: Array.isArray(personnelDraft.documents) ? personnelDraft.documents : [],
      };
      if (editingPersonnelId) {
        await api.updatePersonnel(editingPersonnelId, payload);
      } else {
        await api.createPersonnel(payload as Partial<PersonnelRecord> & { firstName: string });
      }
      setPersonnelModalOpen(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!pageAccess.personnel) {
    return (
      <div className="page-shell">
        <AppSidebar
          active="events"
          onNavigate={onNavigate}
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={onSelectTournament}
          onCreateTournament={onCreateTournament}
          onEditTournament={onEditTournament}
          onDeleteTournament={onDeleteTournament}
          pageAccess={pageAccess}
        />
        <main className="main-content">
          <Card className="table-card">
            <CardContent>
              <p className="error">You are not allowed to access Personnel.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <AppSidebar
        active="personnel"
        onNavigate={onNavigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        onCreateTournament={onCreateTournament}
        onEditTournament={onEditTournament}
        onDeleteTournament={onDeleteTournament}
        pageAccess={pageAccess}
      />

      <main className="main-content">
        <Card className="table-card">
          <CardHeader className="table-card__header">
            <div className="table-card__titlebar">
              <CardTitle>Personnel</CardTitle>
              <Button variant="outline" size="sm" onClick={openCreatePersonnel} disabled={busy}>
                <i className="fa-solid fa-plus" />
                <span>New Personnel Record</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organization</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Arrival</th>
                    <th>Departure</th>
                    <th>Manager</th>
                    <th>Expenses</th>
                    <th>Docs</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={rowDropHoverId === row.id ? "data-table__row--drop-active" : ""}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setRowDropHoverId(row.id);
                      }}
                      onDragLeave={() => setRowDropHoverId((prev) => (prev === row.id ? null : prev))}
                      onDrop={(event) => {
                        event.preventDefault();
                        void openDocumentWizardFromDrop(row, event.dataTransfer.files);
                      }}
                    >
                      <td>{`${row.firstName} ${row.lastName}`.trim()}</td>
                      <td>{row.organization || "-"}</td>
                      <td>{row.role || "-"}</td>
                      <td>{row.department || "-"}</td>
                      <td>{row.arrivalDate || "-"}</td>
                      <td>{row.departureDate || "-"}</td>
                      <td>{managerOptions.find((user) => user.id === row.managerUserId)?.email || "-"}</td>
                      <td>{row.expenses.length}</td>
                      <td>{Array.isArray(row.documents) ? row.documents.length : 0}</td>
                      <td>
                        <div className="icon-actions">
                          <Button variant="outline" size="icon" onClick={() => openEditPersonnel(row)} title="Edit personnel">
                            <i className="fa-solid fa-pen-to-square" />
                          </Button>
                          <Button
                            variant="danger"
                            size="icon"
                            onClick={() => {
                              void removePersonnel(row);
                            }}
                            title="Delete personnel"
                          >
                            <i className="fa-solid fa-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="error">{error}</p> : null}
      </main>

      {personnelModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => setPersonnelModalOpen(false)}>
          <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader><CardTitle>{editingPersonnelId ? "Edit Personnel" : "New Personnel"}</CardTitle></CardHeader>
            <CardContent>
              <div className="modal-grid">
                <label className="field"><span>First Name</span><input value={personnelDraft.firstName ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, firstName: event.target.value }))} /></label>
                <label className="field"><span>Last Name</span><input value={personnelDraft.lastName ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, lastName: event.target.value }))} /></label>
                <label className="field"><span>Email</span><input value={personnelDraft.email ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, email: event.target.value }))} /></label>
                <label className="field"><span>Organization</span><input value={personnelDraft.organization ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, organization: event.target.value }))} /></label>
                <label className="field"><span>Arrival Date</span><input type="date" value={personnelDraft.arrivalDate ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, arrivalDate: event.target.value }))} /></label>
                <label className="field"><span>Departure Date</span><input type="date" value={personnelDraft.departureDate ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, departureDate: event.target.value }))} /></label>
                <label className="field"><span>Role</span><input value={personnelDraft.role ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, role: event.target.value }))} /></label>
                <label className="field"><span>Department</span><input value={personnelDraft.department ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, department: event.target.value }))} /></label>
                <label className="field"><span>Place of Service</span><input value={personnelDraft.placeOfService ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, placeOfService: event.target.value }))} /></label>
                <label className="field">
                  <span>Manager (SaaS User)</span>
                  <select value={personnelDraft.managerUserId ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, managerUserId: event.target.value || null }))}>
                    <option value="">Select manager</option>
                    {managerOptions.map((manager) => <option key={manager.id} value={manager.id}>{manager.email}</option>)}
                  </select>
                </label>
                <label className="field"><span>Offer Duration</span><input value={personnelDraft.offer?.duration ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, offer: { ...(prev.offer ?? { duration: "", compensation: "", benefits: [] }), duration: event.target.value } }))} /></label>
                <label className="field"><span>Compensation</span><input value={personnelDraft.offer?.compensation ?? ""} onChange={(event) => setPersonnelDraft((prev) => ({ ...prev, offer: { ...(prev.offer ?? { duration: "", compensation: "", benefits: [] }), compensation: event.target.value } }))} /></label>
                <div className="modal-actions modal-actions--left">
                  <Button variant="outline" onClick={() => setPersonnelModalOpen(false)}><i className="fa-solid fa-xmark" /><span>Cancel</span></Button>
                  <Button onClick={() => { void savePersonnel(); }} disabled={busy || !personnelDraft.firstName?.trim()}><i className="fa-solid fa-floppy-disk" /><span>{editingPersonnelId ? "Save Personnel" : "Create Personnel"}</span></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {documentModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => setDocumentModalOpen(false)}>
          <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>Register Document</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="doc-tabs">
                <button type="button" className={`doc-tabs__item ${documentTab === "compliance" ? "is-active" : ""}`} onClick={() => setDocumentTab("compliance")}>Compliance</button>
                <button type="button" className={`doc-tabs__item ${documentTab === "finance" ? "is-active" : ""}`} onClick={() => setDocumentTab("finance")}>Finance</button>
                <button type="button" className={`doc-tabs__item ${documentTab === "misc" ? "is-active" : ""}`} onClick={() => setDocumentTab("misc")}>Misc</button>
              </div>

              <div className="modal-grid">
                <label className="field field--wide"><span>Document Name</span><input value={documentDraft.name} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, name: event.target.value }))} /></label>
                <label className="field field--wide"><span>Notes</span><textarea value={documentDraft.notes} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, notes: event.target.value }))} /></label>

                {documentTab === "compliance" ? (
                  <>
                    <label className="field"><span>Document Type</span><input value={documentDraft.complianceType} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, complianceType: event.target.value }))} /></label>
                    <label className="field"><span>Reference Code</span><input value={documentDraft.complianceReference} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, complianceReference: event.target.value }))} /></label>
                  </>
                ) : null}

                {documentTab === "finance" ? (
                  <>
                    <label className="field"><span>Amount</span><input value={documentDraft.financeAmount} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, financeAmount: event.target.value }))} /></label>
                    <label className="field"><span>Currency</span><input value={documentDraft.financeCurrency} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, financeCurrency: event.target.value }))} /></label>
                    <label className="field"><span>Vendor</span><input value={documentDraft.financeVendor} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, financeVendor: event.target.value }))} /></label>
                    <label className="field"><span>Document Date</span><input type="date" value={documentDraft.financeDate} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, financeDate: event.target.value }))} /></label>
                    <label className="field field--wide"><span>Finance Summary</span><input value={documentDraft.financeSummary} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, financeSummary: event.target.value }))} /></label>
                    <div className="field field--wide">
                      <span>Auto-completion Parser</span>
                      <div className="modal-actions modal-actions--left">
                        <Button
                          variant="outline"
                          disabled={documentBusy || !documentFile}
                          onClick={() => {
                            if (documentFile) void parseFinanceFromPdf(documentFile);
                          }}
                        >
                          <i className="fa-solid fa-wand-magic-sparkles" />
                          <span>{documentBusy ? "Parsing..." : "Parse Finance Data"}</span>
                        </Button>
                      </div>
                      {documentDraft.parsedExpenses.length ? (
                        <div className="activation-tags__list">
                          {documentDraft.parsedExpenses.map((expense) => (
                            <span className="activation-tag" key={expense.id}>
                              {expense.category}: {expense.amount} {expense.currency}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {error ? <p className="error" style={{ gridColumn: "1 / -1" }}>{error}</p> : null}
                  </>
                ) : null}

                {documentTab === "misc" ? (
                  <label className="field field--wide"><span>Tags (comma separated)</span><input value={documentDraft.miscTags} onChange={(event) => setDocumentDraft((prev) => ({ ...prev, miscTags: event.target.value }))} /></label>
                ) : null}
              </div>

              <div className="modal-actions modal-actions--left">
                <Button variant="outline" onClick={() => setDocumentModalOpen(false)}><i className="fa-solid fa-xmark" /><span>Cancel</span></Button>
                <Button onClick={() => { void saveDocumentRegistration(); }} disabled={documentBusy || !documentFile}>
                  <i className="fa-solid fa-floppy-disk" />
                  <span>Save Document</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
