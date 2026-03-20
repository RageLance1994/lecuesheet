import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { UnsavedChangesModal } from "../components/UnsavedChangesModal";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { api, type Tournament, type Venue } from "../lib/api";

type Props = {
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
};

type ScreenDraft = {
  id: string;
  type: "ribbon" | "giant_screen" | "fascia";
  resX: number;
  resY: number;
  framerate: number;
  codec: string;
  referencePic: {
    name: string;
    mime: string;
    data: string;
  } | null;
};

type SpeakerDraft = {
  id: string;
  name: string;
  zone: string;
  notes: string;
};

type VenueDraft = {
  name: string;
  city: string;
  address: string;
  screens: ScreenDraft[];
  speakers: SpeakerDraft[];
};

function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyScreen(): ScreenDraft {
  return {
    id: uid(),
    type: "giant_screen",
    resX: 1920,
    resY: 1080,
    framerate: 60,
    codec: ".mov",
    referencePic: null,
  };
}

function emptySpeaker(): SpeakerDraft {
  return {
    id: uid(),
    name: "",
    zone: "",
    notes: "",
  };
}

const emptyDraft: VenueDraft = {
  name: "",
  city: "",
  address: "",
  screens: [emptyScreen()],
  speakers: [emptySpeaker()],
};

function isVenueDraftDirty(draft: VenueDraft) {
  if (draft.name.trim() || draft.city.trim() || draft.address.trim()) return true;
  if (draft.screens.length > 1 || draft.speakers.length > 1) return true;
  const hasScreenChanges = draft.screens.some((screen) =>
    screen.type !== "giant_screen" ||
    screen.resX !== 1920 ||
    screen.resY !== 1080 ||
    screen.framerate !== 60 ||
    screen.codec !== ".mov" ||
    screen.referencePic !== null,
  );
  if (hasScreenChanges) return true;
  return draft.speakers.some((speaker) => speaker.name.trim() || speaker.zone.trim() || speaker.notes.trim());
}

export function VenuesPage({
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
}: Props) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<VenueDraft>(emptyDraft);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  async function loadVenues() {
    setError("");
    if (!selectedTournamentId.trim()) {
      setVenues([]);
      return;
    }
    try {
      setVenues(await api.getVenues(selectedTournamentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadVenues();
  }, [selectedTournamentId]);

  async function fileToDataUrl(file: File) {
    return new Promise<{ name: string; mime: string; data: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          mime: file.type,
          data: String(reader.result ?? ""),
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function attachScreenFile(screenId: string, file: File) {
    const encoded = await fileToDataUrl(file);
    setDraft((prev) => ({
      ...prev,
      screens: prev.screens.map((screen) =>
        screen.id === screenId ? { ...screen, referencePic: encoded } : screen,
      ),
    }));
  }

  async function submitVenue() {
    if (!draft.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createVenue({
        name: draft.name.trim(),
        tournamentId: selectedTournamentId,
        city: draft.city.trim(),
        address: draft.address.trim(),
        tech: {
          screens: draft.screens.map((screen) => ({
            id: screen.id,
            type: screen.type,
            res: { x: screen.resX, y: screen.resY },
            framerate: screen.framerate,
            codec: screen.codec,
            referencePic: screen.referencePic,
          })),
          speakers: draft.speakers
            .filter((speaker) => speaker.name.trim())
            .map((speaker) => ({
              id: speaker.id,
              name: speaker.name.trim(),
              zone: speaker.zone.trim(),
              notes: speaker.notes.trim(),
            })),
        },
      });
      setOpen(false);
      setDraft({
        ...emptyDraft,
        screens: [emptyScreen()],
        speakers: [emptySpeaker()],
      });
      await loadVenues();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => venues, [venues]);
  const hasUnsavedChanges = isVenueDraftDirty(draft);

  function requestCloseModal() {
    if (busy) return;
    if (hasUnsavedChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    setOpen(false);
  }

  return (
    <div className="page-shell">
      <AppSidebar
        active="venues"
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
              <CardTitle>Venues</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={busy}>
                <i className="fa-solid fa-plus" />
                <span>New Venue</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>City</th>
                    <th>Address</th>
                    <th>Screens</th>
                    <th>Speakers</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((venue) => (
                    <tr key={venue.id}>
                      <td>{venue.name}</td>
                      <td>{venue.city || "-"}</td>
                      <td>{venue.address || "-"}</td>
                      <td>{String(venue.tech?.screens?.length ?? 0)}</td>
                      <td>{String(venue.tech?.speakers?.length ?? 0)}</td>
                      <td>{new Date(venue.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="data-table__empty">
                        No venues yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error ? <p className="error">{error}</p> : null}
      </main>

      {open ? (
        <>
        <div className="modal-overlay" onMouseDown={requestCloseModal}>
          <Card className="modal modal-venue-tech" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>New Venue</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="modal-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitVenue();
                }}
              >
                <label className="field">
                  <span>Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    required
                  />
                </label>
                <label className="field">
                  <span>City</span>
                  <input
                    value={draft.city}
                    onChange={(event) => setDraft((prev) => ({ ...prev, city: event.target.value }))}
                  />
                </label>
                <label className="field notes-field">
                  <span>Address</span>
                  <input
                    value={draft.address}
                    onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
                  />
                </label>

                <div className="venue-tech-builder notes-field">
                  <div className="venue-tech-column">
                    <div className="venue-tech-column__head">
                      <h4>Screens</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, screens: [...prev.screens, emptyScreen()] }))
                        }
                        disabled={busy}
                      >
                        <i className="fa-solid fa-plus" />
                        <span>Add screen</span>
                      </Button>
                    </div>

                    <div className="venue-tech-list">
                      {draft.screens.map((screen) => (
                        <div key={screen.id} className="venue-tech-card">
                          <div className="venue-tech-card__row">
                            <label className="field">
                              <span>Type</span>
                              <select
                                value={screen.type}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    screens: prev.screens.map((item) =>
                                      item.id === screen.id
                                        ? {
                                            ...item,
                                            type: event.target.value as ScreenDraft["type"],
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              >
                                <option value="ribbon">Ribbon</option>
                                <option value="giant_screen">Giant Screen</option>
                                <option value="fascia">Fascia</option>
                              </select>
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Remove screen"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  screens: prev.screens.length > 1
                                    ? prev.screens.filter((item) => item.id !== screen.id)
                                    : prev.screens,
                                }))
                              }
                            >
                              <i className="fa-solid fa-trash" />
                            </Button>
                          </div>

                          <div className="venue-tech-card__grid">
                            <label className="field">
                              <span>Resolution X</span>
                              <input
                                type="number"
                                min={1}
                                value={screen.resX}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    screens: prev.screens.map((item) =>
                                      item.id === screen.id
                                        ? { ...item, resX: Number(event.target.value || 0) }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Resolution Y</span>
                              <input
                                type="number"
                                min={1}
                                value={screen.resY}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    screens: prev.screens.map((item) =>
                                      item.id === screen.id
                                        ? { ...item, resY: Number(event.target.value || 0) }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Frame Rate</span>
                              <input
                                type="number"
                                min={1}
                                value={screen.framerate}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    screens: prev.screens.map((item) =>
                                      item.id === screen.id
                                        ? { ...item, framerate: Number(event.target.value || 0) }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Codec</span>
                              <input
                                value={screen.codec}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    screens: prev.screens.map((item) =>
                                      item.id === screen.id
                                        ? { ...item, codec: event.target.value }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>

                          <label
                            className="venue-dropzone"
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "copy";
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              const file = event.dataTransfer.files?.[0];
                              if (!file) return;
                              void attachScreenFile(screen.id, file);
                            }}
                          >
                            <span>
                              {screen.referencePic?.name
                                ? `Reference: ${screen.referencePic.name}`
                                : "Reference picture (drop file or click)"}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                void attachScreenFile(screen.id, file);
                              }}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="venue-tech-column">
                    <div className="venue-tech-column__head">
                      <h4>Speakers</h4>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, speakers: [...prev.speakers, emptySpeaker()] }))
                        }
                        disabled={busy}
                      >
                        <i className="fa-solid fa-plus" />
                        <span>Add speaker</span>
                      </Button>
                    </div>

                    <div className="venue-tech-list">
                      {draft.speakers.map((speaker) => (
                        <div key={speaker.id} className="venue-tech-card">
                          <div className="venue-tech-card__row">
                            <label className="field">
                              <span>Name</span>
                              <input
                                value={speaker.name}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    speakers: prev.speakers.map((item) =>
                                      item.id === speaker.id ? { ...item, name: event.target.value } : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Remove speaker"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  speakers: prev.speakers.length > 1
                                    ? prev.speakers.filter((item) => item.id !== speaker.id)
                                    : prev.speakers,
                                }))
                              }
                            >
                              <i className="fa-solid fa-trash" />
                            </Button>
                          </div>

                          <div className="venue-tech-card__grid">
                            <label className="field">
                              <span>Zone</span>
                              <input
                                value={speaker.zone}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    speakers: prev.speakers.map((item) =>
                                      item.id === speaker.id ? { ...item, zone: event.target.value } : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Notes</span>
                              <input
                                value={speaker.notes}
                                onChange={(event) =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    speakers: prev.speakers.map((item) =>
                                      item.id === speaker.id ? { ...item, notes: event.target.value } : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="modal-actions modal-actions--left">
                  <Button type="button" variant="outline" onClick={requestCloseModal} disabled={busy}>
                    <i className="fa-solid fa-xmark" />
                    <span>Cancel</span>
                  </Button>
                  <Button type="submit" disabled={busy}>
                    <i className="fa-solid fa-floppy-disk" />
                    <span>Save Venue</span>
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
            setOpen(false);
          }}
        />
        </>
      ) : null}
    </div>
  );
}
