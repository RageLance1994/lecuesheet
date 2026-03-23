import { useEffect, useMemo, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { api, hasPrivilege, type Team, type TeamPlayer, type Tournament, type UserAccount } from "../lib/api";

type Props = {
  onNavigate: (path: string) => void;
  tournaments: Tournament[];
  selectedTournamentId: string;
  onSelectTournament: (tournamentId: string) => void;
  onCreateTournament: () => void;
  onEditTournament: (tournament: Tournament) => void;
  onDeleteTournament: (tournament: Tournament) => void;
  currentUser: UserAccount | null;
  pageAccess: {
    events: boolean;
    activations: boolean;
    venues: boolean;
    teams: boolean;
    personnel: boolean;
    users: boolean;
  };
};

type TeamDraft = {
  name: string;
  country: string;
  tricode: string;
  logoUrl: string;
  players: TeamPlayer[];
};

function uid() {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyDraft(): TeamDraft {
  return {
    name: "",
    country: "",
    tricode: "",
    logoUrl: "",
    players: [],
  };
}

export function TeamsPage({
  onNavigate,
  tournaments,
  selectedTournamentId,
  onSelectTournament,
  onCreateTournament,
  onEditTournament,
  onDeleteTournament,
  currentUser,
  pageAccess,
}: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [draft, setDraft] = useState<TeamDraft>(emptyDraft);
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [playerPosition, setPlayerPosition] = useState("");

  async function loadTeams() {
    setError("");
    if (!selectedTournamentId.trim()) {
      setTeams([]);
      return;
    }
    try {
      setTeams(await api.getTeams(selectedTournamentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void loadTeams();
  }, [selectedTournamentId]);

  function openCreate() {
    setEditingTeamId(null);
    setWizardStep(0);
    setDraft(emptyDraft());
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
    setModalOpen(true);
  }

  function openEdit(team: Team) {
    setEditingTeamId(team.id);
    setWizardStep(0);
    setDraft({
      name: team.name || "",
      country: team.country || "",
      tricode: team.tricode || "",
      logoUrl: team.logoUrl || "",
      players: Array.isArray(team.players) ? team.players : [],
    });
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
    setModalOpen(true);
  }

  function addPlayer() {
    const name = playerName.trim();
    if (!name) return;
    const parsedNumber = Number(playerNumber);
    setDraft((prev) => ({
      ...prev,
      players: [
        ...prev.players,
        {
          id: uid(),
          name,
          number: Number.isFinite(parsedNumber) && parsedNumber >= 0 ? Math.round(parsedNumber) : null,
          position: playerPosition.trim() || null,
        },
      ],
    }));
    setPlayerName("");
    setPlayerNumber("");
    setPlayerPosition("");
  }

  async function saveTeam() {
    if (!draft.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: draft.name.trim(),
        tournamentId: selectedTournamentId,
        country: draft.country.trim() || null,
        tricode: draft.tricode.trim().toUpperCase() || null,
        logoUrl: draft.logoUrl.trim() || null,
        players: draft.players
          .filter((player) => player.name.trim())
          .map((player) => ({
            id: player.id,
            name: player.name.trim(),
            number: player.number ?? null,
            position: player.position?.trim() || null,
          })),
      };
      if (editingTeamId) {
        await api.updateTeam(editingTeamId, payload);
      } else {
        await api.createTeam(payload);
      }
      setModalOpen(false);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTeam(team: Team) {
    if (!window.confirm(`Delete team "${team.name}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteTeam(team.id);
      await loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!modalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      setModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, busy]);

  const rows = useMemo(() => teams, [teams]);

  return (
    <div className="page-shell">
      <AppSidebar
        active="teams"
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
              <CardTitle>Teams</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={openCreate}
                disabled={busy || !hasPrivilege(currentUser, "teams", "create")}
              >
                <i className="fa-solid fa-plus" />
                <span>New Team</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Country</th>
                    <th>Tricode</th>
                    <th>Players</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((team) => (
                    <tr key={team.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {team.logoUrl ? (
                            <img
                              src={team.logoUrl}
                              alt=""
                              style={{ width: 24, height: 24, borderRadius: 999, objectFit: "cover" }}
                            />
                          ) : null}
                          <span>{team.name}</span>
                        </div>
                      </td>
                      <td>{team.country || "-"}</td>
                      <td>{team.tricode || "-"}</td>
                      <td>{team.players?.length ?? 0}</td>
                      <td>{new Date(team.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="icon-actions">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            title="Edit"
                            onClick={() => openEdit(team)}
                            disabled={!hasPrivilege(currentUser, "teams", "edit")}
                          >
                            <i className="fa-solid fa-pen-to-square" />
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="icon"
                            title="Delete"
                            onClick={() => {
                              void removeTeam(team);
                            }}
                            disabled={!hasPrivilege(currentUser, "teams", "delete")}
                          >
                            <i className="fa-solid fa-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="data-table__empty">
                        No teams yet.
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

      {modalOpen ? (
        <div className="modal-overlay" onMouseDown={() => !busy && setModalOpen(false)}>
          <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>{editingTeamId ? "Edit Team" : "New Team"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="modal-grid">
                <div className="field notes-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Wizard</span>
                  <div className="icon-actions">
                    <Button
                      type="button"
                      variant={wizardStep === 0 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWizardStep(0)}
                    >
                      <span>1. Team Info</span>
                    </Button>
                    <Button
                      type="button"
                      variant={wizardStep === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWizardStep(1)}
                    >
                      <span>2. Players</span>
                    </Button>
                  </div>
                </div>

                {wizardStep === 0 ? (
                  <>
                    <label className="field">
                      <span>Team Name</span>
                      <input
                        value={draft.name}
                        onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Country</span>
                      <input
                        value={draft.country}
                        onChange={(event) => setDraft((prev) => ({ ...prev, country: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Tricode</span>
                      <input
                        maxLength={3}
                        value={draft.tricode}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, tricode: event.target.value.toUpperCase() }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Logo URL</span>
                      <input
                        value={draft.logoUrl}
                        onChange={(event) => setDraft((prev) => ({ ...prev, logoUrl: event.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <div className="notes-field" style={{ gridColumn: "1 / -1", display: "grid", gap: 10 }}>
                    <div className="modal-grid" style={{ gridTemplateColumns: "1fr 140px 1fr auto" }}>
                      <label className="field">
                        <span>Player Name</span>
                        <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Number</span>
                        <input value={playerNumber} onChange={(event) => setPlayerNumber(event.target.value)} />
                      </label>
                      <label className="field">
                        <span>Position</span>
                        <input value={playerPosition} onChange={(event) => setPlayerPosition(event.target.value)} />
                      </label>
                      <div className="field" style={{ alignSelf: "end" }}>
                        <Button type="button" onClick={addPlayer} disabled={!playerName.trim()}>
                          <i className="fa-solid fa-plus" />
                          <span>Add</span>
                        </Button>
                      </div>
                    </div>

                    <div className="data-table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Number</th>
                            <th>Position</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {draft.players.map((player) => (
                            <tr key={player.id}>
                              <td>{player.name}</td>
                              <td>{player.number ?? "-"}</td>
                              <td>{player.position || "-"}</td>
                              <td>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="icon"
                                  title="Remove player"
                                  onClick={() =>
                                    setDraft((prev) => ({
                                      ...prev,
                                      players: prev.players.filter((item) => item.id !== player.id),
                                    }))
                                  }
                                >
                                  <i className="fa-solid fa-trash" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {draft.players.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="data-table__empty">
                                No players added.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="modal-actions modal-actions--left">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (busy) return;
                      setModalOpen(false);
                    }}
                  >
                    <i className="fa-solid fa-xmark" />
                    <span>Cancel</span>
                  </Button>
                  {wizardStep === 0 ? (
                    <Button type="button" onClick={() => setWizardStep(1)}>
                      <i className="fa-solid fa-arrow-right" />
                      <span>Next: Players</span>
                    </Button>
                  ) : (
                    <>
                      <Button type="button" variant="outline" onClick={() => setWizardStep(0)}>
                        <i className="fa-solid fa-arrow-left" />
                        <span>Back</span>
                      </Button>
                      <Button onClick={() => { void saveTeam(); }} disabled={busy || !draft.name.trim()}>
                        <i className="fa-solid fa-floppy-disk" />
                        <span>{editingTeamId ? "Save Team" : "Create Team"}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
