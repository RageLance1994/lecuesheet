import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { api, type Activation, type Tournament } from "../lib/api";

type Props = {
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
};

type ActivationSpecs = {
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
};

type WizardItem = ActivationSpecs & {
  name: string;
  tags: string[];
  fileLabel: string | null;
};

type WebkitFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file: (success: (file: File) => void, error?: (error: unknown) => void) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: WebkitFileSystemEntry[]) => void,
      error?: (error: unknown) => void,
    ) => void;
  };
};

const EMPTY_SPECS: ActivationSpecs = {
  fileName: null,
  mimeType: null,
  sizeBytes: null,
  durationMs: null,
};

const MEDIA_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "mp3",
  "wav",
  "aac",
  "m4a",
  "ogg",
  "flac",
]);

function getFileExtension(fileName: string) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  return match ? match[1].toLowerCase() : "";
}

function inferMimeTypeFromName(fileName: string): string | null {
  const ext = getFileExtension(fileName);
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    webm: "video/webm",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    aac: "audio/aac",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    flac: "audio/flac",
  };
  return map[ext] ?? null;
}

function isLikelyMediaFile(file: File) {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) {
    return true;
  }
  return MEDIA_EXTENSIONS.has(getFileExtension(file.name));
}

function fileNameToTitle(fileName: string) {
  const base = fileName.replace(/\.[^/.]+$/, "").trim();
  return base || "Untitled Activation";
}

function formatFileSize(sizeBytes?: number | null) {
  if (!sizeBytes || sizeBytes <= 0) return "-";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs || durationMs <= 0) return "-";
  return `${Math.round(durationMs / 1000)}s`;
}

function dedupeFiles(files: File[]) {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const file of files) {
    const key = `${file.name}__${file.size}__${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

function createEmptyWizardItem(): WizardItem {
  return {
    name: "",
    tags: [],
    fileLabel: null,
    ...EMPTY_SPECS,
  };
}

function wizardItemFromActivation(activation: Activation): WizardItem {
  return {
    name: activation.name,
    tags: activation.tags ?? [],
    fileLabel: activation.fileName ?? null,
    fileName: activation.fileName ?? null,
    mimeType: activation.mimeType ?? null,
    sizeBytes: activation.sizeBytes ?? null,
    durationMs: activation.durationMs ?? null,
  };
}

async function extractDurationMs(file: File): Promise<number | null> {
  if (!isLikelyMediaFile(file)) {
    return null;
  }

  return new Promise((resolve) => {
    const media = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(objectUrl);
    };

    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const duration = Number(media.duration);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        resolve(null);
        return;
      }
      resolve(Math.round(duration * 1000));
    };
    media.onerror = () => {
      cleanup();
      resolve(null);
    };
    media.src = objectUrl;
  });
}

async function extractFileSpecs(file: File): Promise<ActivationSpecs> {
  return {
    fileName: file.name || null,
    mimeType: file.type || inferMimeTypeFromName(file.name),
    sizeBytes: Number.isFinite(file.size) ? file.size : null,
    durationMs: await extractDurationMs(file),
  };
}

async function readAllEntries(
  reader: NonNullable<WebkitFileSystemEntry["createReader"]> extends () => infer R ? R : never,
) {
  const collected: WebkitFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve) => {
      reader.readEntries((entries) => resolve(entries ?? []), () => resolve([]));
    });
    if (batch.length === 0) break;
    collected.push(...batch);
  }
  return collected;
}

async function filesFromEntry(entry: WebkitFileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => {
      entry.file((file) => resolve([file]), () => resolve([]));
    });
  }

  if (!entry.isDirectory || !entry.createReader) {
    return [];
  }

  const reader = entry.createReader();
  const children = await readAllEntries(reader);
  const nested = await Promise.all(children.map((child) => filesFromEntry(child)));
  return nested.flat();
}

async function extractDroppedFiles(items: DataTransferItem[], files: File[]): Promise<File[]> {
  const collected: File[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entryGetter = (item as DataTransferItem & {
      webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
    }).webkitGetAsEntry;
    if (entryGetter) {
      const entry = entryGetter.call(item);
      if (entry) {
        collected.push(...(await filesFromEntry(entry)));
        continue;
      }
    }
    const direct = item.getAsFile();
    if (direct) collected.push(direct);
  }
  if (!collected.length) {
    collected.push(...files);
  }
  return dedupeFiles(collected);
}

export function ActivationsPage({
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
}: Props) {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingActivationId, setEditingActivationId] = useState<string | null>(null);
  const [wizardItems, setWizardItems] = useState<WizardItem[]>([createEmptyWizardItem()]);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [tagInput, setTagInput] = useState("");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [groupedView, setGroupedView] = useState(true);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  const currentWizardItem = wizardItems[wizardIndex] ?? null;

  async function loadActivations() {
    setError("");
    try {
      setActivations(await api.getActivations(selectedTournamentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadActivations();
  }, [selectedTournamentId]);

  function resetWizard() {
    setEditingActivationId(null);
    setWizardItems([createEmptyWizardItem()]);
    setWizardIndex(0);
    setTagInput("");
    setConfirmCloseOpen(false);
  }

  function setCurrentWizardItem(updater: (item: WizardItem) => WizardItem) {
    setWizardItems((prev) =>
      prev.map((item, index) => (index === wizardIndex ? updater(item) : item)),
    );
  }

  function openWizardCreate() {
    resetWizard();
    setWizardOpen(true);
  }

  function openWizardEdit(activation: Activation) {
    setEditingActivationId(activation.id);
    setWizardItems([wizardItemFromActivation(activation)]);
    setWizardIndex(0);
    setTagInput("");
    setWizardOpen(true);
  }

  async function openWizardWithFiles(files: File[]) {
    const uniqueFiles = dedupeFiles(files);
    if (!uniqueFiles.length) return;
    resetWizard();
    setWizardOpen(true);
    setBusy(true);
    setError("");
    try {
      const specsList = await Promise.all(uniqueFiles.map((file) => extractFileSpecs(file)));
      const nextItems: WizardItem[] = uniqueFiles.map((file, index) => ({
        name: fileNameToTitle(file.name),
        tags: [],
        fileLabel: file.name,
        ...specsList[index],
      }));
      setWizardItems(nextItems);
      setWizardIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyFileSelection(file: File) {
    setBusy(true);
    setError("");
    try {
      const specs = await extractFileSpecs(file);
      setCurrentWizardItem((current) => ({
        ...current,
        ...specs,
        fileLabel: file.name,
        name: current.name.trim() ? current.name : fileNameToTitle(file.name),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDropzonePick(file: File) {
    await openWizardWithFiles([file]);
  }

  async function handleDataTransferDrop(items: DataTransferItem[], files: File[]) {
    const dropped = await extractDroppedFiles(items, files);
    if (!dropped.length) return;
    await openWizardWithFiles(dropped);
  }

  async function submitWizard() {
    setBusy(true);
    setError("");
    try {
      if (editingActivationId) {
        const item = wizardItems[0];
        if (!item || !item.name.trim()) {
          setBusy(false);
          return;
        }
        await api.updateActivation(editingActivationId, {
          name: item.name.trim(),
          tags: item.tags,
          fileName: item.fileName,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          durationMs: item.durationMs,
        });
      } else {
        const toCreate = wizardItems.filter((item) => item.name.trim());
        for (const item of toCreate) {
          await api.createActivation({
            name: item.name.trim(),
            tournamentId: selectedTournamentId,
            tags: item.tags,
            fileName: item.fileName ?? undefined,
            mimeType: item.mimeType ?? undefined,
            sizeBytes: item.sizeBytes ?? undefined,
            durationMs: item.durationMs ?? undefined,
          });
        }
      }

      setWizardOpen(false);
      resetWizard();
      await loadActivations();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteActivation(activationId: string) {
    const confirmed = window.confirm("Delete this activation?");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteActivation(activationId);
      await loadActivations();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => activations, [activations]);
  const groupedRows = useMemo(() => {
    const map = new Map<string, Activation[]>();
    for (const activation of rows) {
      const tags = activation.tags.length ? activation.tags : ["Uncategorized"];
      for (const tag of tags) {
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag)?.push(activation);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const canSubmit = editingActivationId
    ? Boolean(currentWizardItem?.name.trim())
    : wizardItems.some((item) => item.name.trim());
  const hasUnsavedChanges = wizardItems.some((item) =>
    item.name.trim() ||
    item.tags.length > 0 ||
    item.fileName ||
    item.mimeType ||
    item.sizeBytes ||
    item.durationMs,
  );

  function requestCloseWizard() {
    if (busy) return;
    if (hasUnsavedChanges || tagInput.trim()) {
      setConfirmCloseOpen(true);
      return;
    }
    setWizardOpen(false);
    resetWizard();
  }

  function renderActivationRow(item: Activation, rowKey: string) {
    return (
      <tr key={rowKey}>
        <td>{item.name}</td>
        <td>
          {item.fileName || "-"}
          {item.mimeType ? ` (${item.mimeType})` : ""}
          {item.sizeBytes ? ` - ${formatFileSize(item.sizeBytes)}` : ""}
        </td>
        <td>{formatDuration(item.durationMs)}</td>
        <td>{item.tags.length ? item.tags.join(", ") : "-"}</td>
        <td>{new Date(item.updatedAt).toLocaleString()}</td>
        <td>
          <div className="icon-actions">
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Edit activation"
              onClick={() => openWizardEdit(item)}
              disabled={busy}
            >
              <i className="fa-solid fa-pen-to-square" />
            </Button>
            <Button
              type="button"
              variant="danger"
              size="icon"
              title="Delete activation"
              onClick={() => {
                void handleDeleteActivation(item.id);
              }}
              disabled={busy}
            >
              <i className="fa-solid fa-trash" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="page-shell">
      <AppSidebar
        active="activations"
        onNavigate={onNavigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={onSelectTournament}
        onCreateTournament={onCreateTournament}
        onEditTournament={onEditTournament}
        onDeleteTournament={onDeleteTournament}
      />

      <main className="main-content">
        <Card className="table-card">
          <CardHeader className="table-card__header">
            <div className="table-card__titlebar">
              <CardTitle>Activations</CardTitle>
              <div className="icon-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupedView((current) => !current)}
                  disabled={busy}
                >
                  <i className={`fa-solid ${groupedView ? "fa-list" : "fa-folder-tree"}`} />
                  <span>{groupedView ? "Flat View" : "Grouped View"}</span>
                </Button>
                <Button variant="outline" size="sm" onClick={openWizardCreate} disabled={busy}>
                  <i className="fa-solid fa-plus" />
                  <span>Register Content</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>File</th>
                    <th>Duration</th>
                    <th>Tags</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedView
                    ? groupedRows.map(([groupName, items]) => {
                      const isOpen = openGroups.includes(groupName);
                      return (
                        <>
                          <tr key={`group-${groupName}`} className="activation-group-row">
                            <td colSpan={6}>
                              <button
                                type="button"
                                className="activation-group-row__toggle"
                                onClick={() =>
                                  setOpenGroups((prev) =>
                                    prev.includes(groupName)
                                      ? prev.filter((item) => item !== groupName)
                                      : [...prev, groupName],
                                  )
                                }
                              >
                                <i className={`fa-solid ${isOpen ? "fa-chevron-down" : "fa-chevron-right"}`} />
                                <strong>{groupName}</strong>
                                <span>{items.length} items</span>
                              </button>
                            </td>
                          </tr>
                          {isOpen ? items.map((item) => renderActivationRow(item, `${groupName}-${item.id}`)) : null}
                        </>
                      );
                    })
                    : rows.map((item) => renderActivationRow(item, item.id))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="data-table__empty">No activation contents yet.</td>
                    </tr>
                  ) : null}
                  <tr className="activation-table-drop-row">
                    <td colSpan={6}>
                      <label
                        className="activation-dropzone activation-dropzone--table"
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "copy";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const items = Array.from(event.dataTransfer.items ?? []);
                          const files = Array.from(event.dataTransfer.files ?? []);
                          void handleDataTransferDrop(items, files);
                        }}
                      >
                        <span className="activation-dropzone__compact">
                          <i className="fa-solid fa-circle-plus" aria-hidden />
                          <span>Add Content</span>
                        </span>
                        <input
                          type="file"
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            void handleDropzonePick(file);
                          }}
                        />
                      </label>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="error">{error}</p> : null}
      </main>

      {wizardOpen ? (
        <>
        <div className="modal-overlay" onMouseDown={requestCloseWizard}>
          <Card className="modal modal-activation-wizard" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>{editingActivationId ? "Edit Activation" : "Register Activation Content"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="activation-wizard-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitWizard();
                }}
              >
                {wizardItems.length > 1 ? (
                  <div className="activation-wizard__pager">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWizardIndex((prev) => Math.max(0, prev - 1))}
                      disabled={busy || wizardIndex === 0}
                    >
                      <i className="fa-solid fa-chevron-left" />
                      <span>Prev</span>
                    </Button>
                    <strong>
                      {wizardIndex + 1}/{wizardItems.length} {currentWizardItem?.fileLabel ? `- ${currentWizardItem.fileLabel}` : ""}
                    </strong>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWizardIndex((prev) => Math.min(wizardItems.length - 1, prev + 1))}
                      disabled={busy || wizardIndex >= wizardItems.length - 1}
                    >
                      <span>Next</span>
                      <i className="fa-solid fa-chevron-right" />
                    </Button>
                  </div>
                ) : null}

                <label className="field">
                  <span>Activation name</span>
                  <input
                    value={currentWizardItem?.name ?? ""}
                    onChange={(event) =>
                      setCurrentWizardItem((item) => ({ ...item, name: event.target.value }))
                    }
                    placeholder="Sky Full of Stars"
                    required
                  />
                </label>

                <div className="activation-tags">
                  <div className="activation-tags__list">
                    {(currentWizardItem?.tags ?? []).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className="activation-tag"
                        onClick={() =>
                          setCurrentWizardItem((item) => ({
                            ...item,
                            tags: item.tags.filter((itemTag) => itemTag !== tag),
                          }))
                        }
                        title="Remove tag"
                      >
                        {tag}
                        <i className="fa-solid fa-xmark" />
                      </button>
                    ))}
                  </div>
                  <div className="activation-tags__input">
                    <input
                      value={tagInput}
                      onChange={(event) => setTagInput(event.target.value)}
                      placeholder="Add tag"
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        const next = tagInput.trim();
                        if (!next || (currentWizardItem?.tags ?? []).includes(next)) return;
                        setCurrentWizardItem((item) => ({ ...item, tags: [...item.tags, next] }));
                        setTagInput("");
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = tagInput.trim();
                        if (!next || (currentWizardItem?.tags ?? []).includes(next)) return;
                        setCurrentWizardItem((item) => ({ ...item, tags: [...item.tags, next] }));
                        setTagInput("");
                      }}
                    >
                      <i className="fa-solid fa-tag" />
                      <span>Add</span>
                    </Button>
                  </div>
                </div>

                <label
                  className="activation-dropzone activation-dropzone--mini"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const items = Array.from(event.dataTransfer.items ?? []);
                    const files = Array.from(event.dataTransfer.files ?? []);
                    void handleDataTransferDrop(items, files);
                  }}
                >
                  <span>
                    {currentWizardItem?.fileLabel
                      ? `Selected file: ${currentWizardItem.fileLabel}`
                      : "Drop or click to pick a content file"}
                  </span>
                  <input
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void applyFileSelection(file);
                    }}
                  />
                </label>

                <div className="activation-specs-grid">
                  <div>
                    <span>Mime</span>
                    <strong>{currentWizardItem?.mimeType || "-"}</strong>
                  </div>
                  <div>
                    <span>Size</span>
                    <strong>{formatFileSize(currentWizardItem?.sizeBytes)}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{formatDuration(currentWizardItem?.durationMs)}</strong>
                  </div>
                </div>

                <div className="modal-actions modal-actions--left">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={requestCloseWizard}
                    disabled={busy}
                  >
                    <i className="fa-solid fa-xmark" />
                    <span>Cancel</span>
                  </Button>
                  <Button type="submit" disabled={busy || !canSubmit}>
                    <i className="fa-solid fa-floppy-disk" />
                    <span>
                      {editingActivationId
                        ? "Save Changes"
                        : wizardItems.length > 1
                          ? `Create ${wizardItems.filter((item) => item.name.trim()).length} Activations`
                          : "Create Activation"}
                    </span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
        <UnsavedChangesModal
          open={confirmCloseOpen}
          busy={busy}
          onCancel={() => setConfirmCloseOpen(false)}
          onConfirm={() => {
            setConfirmCloseOpen(false);
            setWizardOpen(false);
            resetWizard();
          }}
        />
        </>
      ) : null}
    </div>
  );
}
