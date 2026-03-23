import { useEffect, useState } from "react";
import { AppSidebar } from "../components/AppSidebar";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { api, type Privileges, type Tournament, type UserAccount } from "../lib/api";

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

const PRIVILEGE_GROUPS = [
  { page: "events", label: "Events", actions: ["view", "create", "edit", "delete", "import"] },
  { page: "activations", label: "Activations", actions: ["view", "create", "edit", "delete", "upload"] },
  { page: "venues", label: "Venues", actions: ["view", "create", "edit", "delete"] },
  { page: "teams", label: "Teams", actions: ["view", "create", "edit", "delete"] },
  { page: "tournaments", label: "Tournaments", actions: ["view", "create", "edit", "delete"] },
  { page: "cuesheet", label: "CueSheet", actions: ["view", "edit", "import", "reorder"] },
  {
    page: "personnel",
    label: "Personnel",
    actions: ["view", "create", "edit", "delete", "manageUsers", "managePrivileges"],
  },
] as const;

function emptyPrivileges(): Privileges {
  return Object.fromEntries(
    PRIVILEGE_GROUPS.map((group) => [
      group.page,
      Object.fromEntries(group.actions.map((action) => [action, false])),
    ]),
  );
}

function fullPrivileges(): Privileges {
  return Object.fromEntries(
    PRIVILEGE_GROUPS.map((group) => [
      group.page,
      Object.fromEntries(group.actions.map((action) => [action, true])),
    ]),
  );
}

export function UsersPage({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openGroups, setOpenGroups] = useState<string[]>(["events"]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userDraft, setUserDraft] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "staff",
    department: "",
    organization: "",
    active: true,
    privileges: emptyPrivileges(),
  });

  async function loadUsers() {
    setBusy(true);
    setError("");
    try {
      setUsers(await api.getUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function openCreateUser() {
    setEditingUserId(null);
    setUserDraft({
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: "staff",
      department: "",
      organization: "",
      active: true,
      privileges: emptyPrivileges(),
    });
    setUserModalOpen(true);
  }

  function openEditUser(user: UserAccount) {
    setEditingUserId(user.id);
    setUserDraft({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      password: user.password,
      role: user.role,
      department: user.department || "",
      organization: user.organization || "",
      active: user.active,
      privileges: user.privileges || emptyPrivileges(),
    });
    setUserModalOpen(true);
  }

  async function saveUser() {
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...userDraft,
        privileges: userDraft.role === "super_admin" ? fullPrivileges() : userDraft.privileges,
      };
      if (editingUserId) {
        await api.updateUser(editingUserId, payload);
      } else {
        await api.createUser(payload);
      }
      setUserModalOpen(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(user: UserAccount) {
    if (user.role === "super_admin") return;
    if (!window.confirm(`Delete user ${user.email}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api.deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!userModalOpen || busy) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setUserModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [userModalOpen, busy]);

  return (
    <div className="page-shell">
      <AppSidebar
        active="users"
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
              <CardTitle>SaaS Users</CardTitle>
              <Button variant="outline" size="sm" onClick={openCreateUser} disabled={busy}>
                <i className="fa-solid fa-user-plus" />
                <span>New User</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{`${user.firstName} ${user.lastName}`.trim()}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>{user.department || "-"}</td>
                      <td>{user.active ? "Active" : "Disabled"}</td>
                      <td>
                        <div className="icon-actions">
                          <Button type="button" variant="outline" size="icon" title="Edit" onClick={() => openEditUser(user)}>
                            <i className="fa-solid fa-pen-to-square" />
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="icon"
                            title="Delete"
                            onClick={() => {
                              void removeUser(user);
                            }}
                            disabled={user.role === "super_admin"}
                          >
                            <i className="fa-solid fa-trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="data-table__empty">No users.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        {error ? <p className="error">{error}</p> : null}
      </main>

      {userModalOpen ? (
        <div className="modal-overlay" onMouseDown={() => setUserModalOpen(false)}>
          <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
            <CardHeader>
              <CardTitle>{editingUserId ? "Edit User" : "New User"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="modal-grid">
                <label className="field"><span>First Name</span><input value={userDraft.firstName} onChange={(event) => setUserDraft((prev) => ({ ...prev, firstName: event.target.value }))} /></label>
                <label className="field"><span>Last Name</span><input value={userDraft.lastName} onChange={(event) => setUserDraft((prev) => ({ ...prev, lastName: event.target.value }))} /></label>
                <label className="field"><span>Email</span><input value={userDraft.email} onChange={(event) => setUserDraft((prev) => ({ ...prev, email: event.target.value }))} /></label>
                <label className="field"><span>Password</span><input value={userDraft.password} onChange={(event) => setUserDraft((prev) => ({ ...prev, password: event.target.value }))} /></label>
                <label className="field"><span>Role</span><input value={userDraft.role} onChange={(event) => setUserDraft((prev) => ({ ...prev, role: event.target.value }))} /></label>
                <label className="field"><span>Department</span><input value={userDraft.department} onChange={(event) => setUserDraft((prev) => ({ ...prev, department: event.target.value }))} /></label>

                <div className="field notes-field" style={{ gridColumn: "1 / -1" }}>
                  <span>Privileges</span>
                  <div className="privileges-grid">
                    {PRIVILEGE_GROUPS.map((group) => {
                      const isOpen = openGroups.includes(group.page);
                      return (
                        <div key={group.page} className="privileges-group">
                          <button
                            type="button"
                            className="privileges-group__head"
                            onClick={() =>
                              setOpenGroups((prev) =>
                                prev.includes(group.page)
                                  ? prev.filter((item) => item !== group.page)
                                  : [...prev, group.page],
                              )
                            }
                          >
                            <strong>{group.label}</strong>
                            <i className={`fa-solid ${isOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
                          </button>
                          {isOpen ? (
                            <div className="privileges-table">
                              {group.actions.map((action) => {
                                const checked = Boolean(userDraft.privileges?.[group.page]?.[action]);
                                return (
                                  <button
                                    type="button"
                                    className="privileges-table__row"
                                    key={`${group.page}-${action}`}
                                    onClick={() =>
                                      setUserDraft((prev) => ({
                                        ...prev,
                                        privileges: {
                                          ...prev.privileges,
                                          [group.page]: {
                                            ...(prev.privileges?.[group.page] ?? {}),
                                            [action]: !checked,
                                          },
                                        },
                                      }))
                                    }
                                  >
                                    <input type="checkbox" readOnly checked={checked} />
                                    <span>{action.toUpperCase()}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="modal-actions modal-actions--left">
                  <Button variant="outline" onClick={() => setUserModalOpen(false)}>
                    <i className="fa-solid fa-xmark" />
                    <span>Cancel</span>
                  </Button>
                  <Button
                    onClick={() => {
                      void saveUser();
                    }}
                    disabled={busy || !userDraft.firstName.trim() || !userDraft.email.trim()}
                  >
                    <i className="fa-solid fa-floppy-disk" />
                    <span>{editingUserId ? "Save User" : "Create User"}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
