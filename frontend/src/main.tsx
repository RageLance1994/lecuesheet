import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { HardConfirmModal } from "./components/HardConfirmModal";
import { App } from "./pages/App";
import { EventsPage } from "./pages/EventsPage";
import { ActivationsPage } from "./pages/ActivationsPage";
import { VenuesPage } from "./pages/VenuesPage";
import { TeamsPage } from "./pages/TeamsPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { UsersPage } from "./pages/UsersPage";
import { api, hasPrivilege, setApiAuthToken, setApiUser, type Tournament, type UserAccount } from "./lib/api";
import {
  TournamentWizardModal,
  emptyTournamentDraft,
  type TournamentDraft,
} from "./components/TournamentWizardModal";
import { Button } from "./components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/Card";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/globals.css";

const LAST_TOURNAMENT_STORAGE_KEY = "lecuesheet:lastTournamentId";
const LAST_CUESHEET_EVENT_STORAGE_KEY = "lecuesheet:lastCuesheetEventId";
const AUTH_TOKEN_STORAGE_KEY = "lecuesheet:authToken";

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/events";
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function parseCuesheetEventId(pathname: string) {
  const match = pathname.match(/^\/events\/([^/]+)$/);
  return match ? match[1] : null;
}

function resolveInitialPathname() {
  return normalizePathname(window.location.pathname);
}

function RouterShell() {
  const [pathname, setPathname] = useState(resolveInitialPathname);
  const [search, setSearch] = useState(() => window.location.search);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [tournamentWizardOpen, setTournamentWizardOpen] = useState(false);
  const [tournamentWizardMode, setTournamentWizardMode] = useState<"create" | "edit">("create");
  const [tournamentWizardDraft, setTournamentWizardDraft] = useState<TournamentDraft>(
    emptyTournamentDraft(),
  );
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [busyTournament, setBusyTournament] = useState(false);
  const [deleteTournamentTarget, setDeleteTournamentTarget] = useState<Tournament | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    const currentPath = normalizePathname(window.location.pathname);
    if (pathname !== currentPath) {
      window.history.replaceState({}, "", `${pathname}${window.location.search}`);
    }
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/events");
      setPathname("/events");
      setSearch(window.location.search);
    }
    const onPop = () => {
      setPathname(normalizePathname(window.location.pathname));
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const cuesheetEventId = parseCuesheetEventId(pathname);
    try {
      if (cuesheetEventId) {
        window.localStorage.setItem(LAST_CUESHEET_EVENT_STORAGE_KEY, decodeURIComponent(cuesheetEventId));
      }
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
  }, [pathname]);

  useEffect(() => {
    let active = true;
    const storedToken = (() => {
      try {
        return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim() ?? "";
      } catch {
        return "";
      }
    })();
    if (!storedToken) {
      if (active) {
        setCurrentUser(null);
        setAuthResolved(true);
      }
      return () => {
        active = false;
      };
    }

    setApiAuthToken(storedToken);
    api
      .getCurrentUser()
      .then((user) => {
        if (!active) return;
        setCurrentUser(user);
        setApiUser(user.id);
        setAuthResolved(true);
      })
      .catch(() => {
        if (!active) return;
        setApiAuthToken("");
        try {
          window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
        } catch {
          // Ignore storage failures.
        }
        setCurrentUser(null);
        setAuthResolved(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!currentUser) {
      setTournaments([]);
      return () => {
        active = false;
      };
    }
    api
      .getTournaments()
      .then((rows) => {
        if (active) setTournaments(rows);
      })
      .catch(() => {
        if (active) setTournaments([]);
      });
    return () => {
      active = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!tournaments.length) return;
    const requested = new URLSearchParams(search).get("tournament") ?? "";
    const stored = (() => {
      try {
        return window.localStorage.getItem(LAST_TOURNAMENT_STORAGE_KEY) ?? "";
      } catch {
        return "";
      }
    })();
    const fallbackId = tournaments[0].id;
    const resolved = tournaments.some((item) => item.id === requested)
      ? requested
      : tournaments.some((item) => item.id === stored)
        ? stored
        : fallbackId;
    if (resolved !== selectedTournamentId) {
      setSelectedTournamentId(resolved);
    }
    try {
      window.localStorage.setItem(LAST_TOURNAMENT_STORAGE_KEY, resolved);
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
    if (resolved !== requested) {
      const params = new URLSearchParams(search);
      params.set("tournament", resolved);
      const nextSearch = `?${params.toString()}`;
      window.history.replaceState({}, "", `${pathname}${nextSearch}`);
      setSearch(nextSearch);
    }
  }, [currentUser, pathname, search, selectedTournamentId, tournaments]);

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const response = await api.login({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      setApiAuthToken(response.token);
      setApiUser(response.user.id);
      try {
        window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.token);
      } catch {
        // Ignore storage failures.
      }
      setCurrentUser(response.user);
      setAuthResolved(true);
      setLoginPassword("");
    } catch {
      setLoginError("Invalid credentials");
    } finally {
      setLoginBusy(false);
    }
  }

  function navigate(nextPath: string) {
    const url = new URL(nextPath, window.location.origin);
    const normalizedPath = normalizePathname(url.pathname);
    const params = new URLSearchParams(url.search);
    const tournamentParam = params.get("tournament") || selectedTournamentId;
    if (tournamentParam) {
      params.set("tournament", tournamentParam);
    }
    const normalizedSearch = params.toString() ? `?${params.toString()}` : "";
    if (normalizedPath === window.location.pathname && normalizedSearch === window.location.search) {
      setPathname(normalizedPath);
      setSearch(normalizedSearch);
      return;
    }
    window.history.pushState({}, "", `${normalizedPath}${normalizedSearch}`);
    setPathname(normalizedPath);
    setSearch(normalizedSearch);
  }

  function selectTournament(tournamentId: string) {
    setSelectedTournamentId(tournamentId);
    try {
      if (tournamentId) {
        window.localStorage.setItem(LAST_TOURNAMENT_STORAGE_KEY, tournamentId);
      } else {
        window.localStorage.removeItem(LAST_TOURNAMENT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
    const params = new URLSearchParams(search);
    if (tournamentId) {
      params.set("tournament", tournamentId);
    } else {
      params.delete("tournament");
    }
    const nextSearch = params.toString() ? `?${params.toString()}` : "";
    window.history.replaceState({}, "", `${pathname}${nextSearch}`);
    setSearch(nextSearch);
  }

  function openTournamentCreate() {
    setTournamentWizardMode("create");
    setEditingTournamentId(null);
    setTournamentWizardDraft(emptyTournamentDraft());
    setTournamentWizardOpen(true);
  }

  function openTournamentEdit(tournament: Tournament) {
    setTournamentWizardMode("edit");
    setEditingTournamentId(tournament.id);
    setTournamentWizardDraft({
      name: tournament.name || "",
      startDate: tournament.startDate || "",
      endDate: tournament.endDate || "",
      federation: tournament.federation || "",
      logoUrl: tournament.logoUrl || "",
      keyPeople: tournament.keyPeople ?? [],
      matchesCount: tournament.matchesCount === null || tournament.matchesCount === undefined ? "" : String(tournament.matchesCount),
      format: tournament.format || "Single elimination",
      teamsCount: tournament.teamsCount === null || tournament.teamsCount === undefined ? "" : String(tournament.teamsCount),
      hostCountries: tournament.hostCountries ?? [],
      eventPhases:
        Array.isArray(tournament.eventPhases) && tournament.eventPhases.length > 0
          ? tournament.eventPhases
          : emptyTournamentDraft().eventPhases,
    });
    setTournamentWizardOpen(true);
  }

  async function submitTournamentWizard() {
    setBusyTournament(true);
    try {
      const payload = {
        name: tournamentWizardDraft.name.trim(),
        startDate: tournamentWizardDraft.startDate || null,
        endDate: tournamentWizardDraft.endDate || null,
        federation: tournamentWizardDraft.federation.trim() || null,
        logoUrl: tournamentWizardDraft.logoUrl.trim() || null,
        keyPeople: tournamentWizardDraft.keyPeople,
        matchesCount: tournamentWizardDraft.matchesCount.trim() ? Number(tournamentWizardDraft.matchesCount) : null,
        format: tournamentWizardDraft.format || null,
        teamsCount: tournamentWizardDraft.teamsCount.trim() ? Number(tournamentWizardDraft.teamsCount) : null,
        hostCountries: tournamentWizardDraft.hostCountries,
        eventPhases: (tournamentWizardDraft.eventPhases ?? [])
          .filter((phase) => phase.label.trim())
          .map((phase, index) => ({
            key: phase.key?.trim() || `PHASE_${index + 1}`,
            label: phase.label.trim(),
            offsetMinutes: Number.isFinite(Number(phase.offsetMinutes))
              ? Math.round(Number(phase.offsetMinutes))
              : 0,
          })),
      };

      if (tournamentWizardMode === "edit" && editingTournamentId) {
        await api.updateTournament(editingTournamentId, payload);
      } else {
        const created = await api.createTournament(payload);
        selectTournament(created.id);
      }

      const rows = await api.getTournaments();
      setTournaments(rows);
      setTournamentWizardOpen(false);
    } finally {
      setBusyTournament(false);
    }
  }

  async function deleteTournamentNow(tournament: Tournament) {
    await api.deleteTournament(tournament.id);
    const rows = await api.getTournaments();
    setTournaments(rows);
    if (!rows.some((item) => item.id === selectedTournamentId)) {
      const fallbackId = rows[0]?.id ?? "";
      selectTournament(fallbackId);
      navigate(`${pathname}${fallbackId ? `?tournament=${encodeURIComponent(fallbackId)}` : ""}`);
    }
  }

  const route = useMemo(() => {
    if (pathname === "/users") {
      return { type: "users" as const };
    }
    if (pathname === "/personnel") {
      return { type: "personnel" as const };
    }
    if (pathname === "/activations") {
      return { type: "activations" as const };
    }
    if (pathname === "/venues") {
      return { type: "venues" as const };
    }
    if (pathname === "/teams") {
      return { type: "teams" as const };
    }
    const cuesheetMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (cuesheetMatch) {
      return { type: "cuesheet" as const, eventId: cuesheetMatch[1] };
    }
    return { type: "events" as const };
  }, [pathname]);

  const pageAccess = useMemo(() => {
    const user = currentUser;
    return {
      events: hasPrivilege(user, "events", "view"),
      activations: hasPrivilege(user, "activations", "view"),
      venues: hasPrivilege(user, "venues", "view"),
      teams: hasPrivilege(user, "teams", "view"),
      personnel: hasPrivilege(user, "personnel", "view") && user?.role === "super_admin",
      users: user?.role === "super_admin",
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    if (!authResolved) return;
    const allowedPath = pageAccess.events
      ? "/events"
      : pageAccess.activations
        ? "/activations"
        : pageAccess.venues
          ? "/venues"
          : pageAccess.teams
            ? "/teams"
          : pageAccess.personnel
            ? "/personnel"
            : "/events";
    const routeBlocked =
      (pathname.startsWith("/events") && !pageAccess.events) ||
      (pathname.startsWith("/activations") && !pageAccess.activations) ||
      (pathname.startsWith("/venues") && !pageAccess.venues) ||
      (pathname.startsWith("/teams") && !pageAccess.teams) ||
      (pathname.startsWith("/personnel") && !pageAccess.personnel) ||
      (pathname.startsWith("/users") && !pageAccess.users);
    if (routeBlocked) {
      navigate(allowedPath);
    }
  }, [authResolved, currentUser, pageAccess, pathname]);

  if (!authResolved) {
    return <div className="page-shell" style={{ display: "grid", placeItems: "center" }}>Loading...</div>;
  }

  if (!currentUser) {
    return (
      <div className="page-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Card className="modal modal-confirm" style={{ width: "min(420px, 94vw)" }}>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="modal-grid" onSubmit={submitLogin}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </label>
              {loginError ? <p className="error" style={{ margin: 0 }}>{loginError}</p> : null}
              <div className="modal-actions">
                <Button type="submit" disabled={loginBusy}>
                  <span>{loginBusy ? "Signing in..." : "Sign In"}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (route.type === "cuesheet") {
    return (
      <>
        <App
          eventId={route.eventId}
          onNavigate={navigate}
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={selectTournament}
          onCreateTournament={openTournamentCreate}
          onEditTournament={openTournamentEdit}
          onDeleteTournament={setDeleteTournamentTarget}
          currentUser={currentUser}
          pageAccess={pageAccess}
        />
        <TournamentWizardModal
          open={tournamentWizardOpen}
          mode={tournamentWizardMode}
          draft={tournamentWizardDraft}
          busy={busyTournament}
          onChange={setTournamentWizardDraft}
          onClose={() => setTournamentWizardOpen(false)}
          onSubmit={() => {
            void submitTournamentWizard();
          }}
        />
      </>
    );
  }

  if (route.type === "venues") {
    return (
      <>
        <VenuesPage
          onNavigate={navigate}
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={selectTournament}
          onCreateTournament={openTournamentCreate}
          onEditTournament={openTournamentEdit}
          onDeleteTournament={setDeleteTournamentTarget}
          currentUser={currentUser}
          pageAccess={pageAccess}
        />
        <TournamentWizardModal
          open={tournamentWizardOpen}
          mode={tournamentWizardMode}
          draft={tournamentWizardDraft}
          busy={busyTournament}
          onChange={setTournamentWizardDraft}
          onClose={() => setTournamentWizardOpen(false)}
          onSubmit={() => {
            void submitTournamentWizard();
          }}
        />
      </>
    );
  }

  if (route.type === "activations") {
    return (
      <>
        <ActivationsPage
          onNavigate={navigate}
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={selectTournament}
          onCreateTournament={openTournamentCreate}
          onEditTournament={openTournamentEdit}
          onDeleteTournament={setDeleteTournamentTarget}
          currentUser={currentUser}
          pageAccess={pageAccess}
        />
        <TournamentWizardModal
          open={tournamentWizardOpen}
          mode={tournamentWizardMode}
          draft={tournamentWizardDraft}
          busy={busyTournament}
          onChange={setTournamentWizardDraft}
          onClose={() => setTournamentWizardOpen(false)}
          onSubmit={() => {
            void submitTournamentWizard();
          }}
        />
      </>
    );
  }

  if (route.type === "personnel") {
    return currentUser ? (
      <PersonnelPage
        onNavigate={navigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={selectTournament}
        onCreateTournament={openTournamentCreate}
        onEditTournament={openTournamentEdit}
        onDeleteTournament={setDeleteTournamentTarget}
        pageAccess={pageAccess}
      />
    ) : null;
  }

  if (route.type === "teams") {
    return (
      <>
        <TeamsPage
          onNavigate={navigate}
          tournaments={tournaments}
          selectedTournamentId={selectedTournamentId}
          onSelectTournament={selectTournament}
          onCreateTournament={openTournamentCreate}
          onEditTournament={openTournamentEdit}
          onDeleteTournament={setDeleteTournamentTarget}
          currentUser={currentUser}
          pageAccess={pageAccess}
        />
        <TournamentWizardModal
          open={tournamentWizardOpen}
          mode={tournamentWizardMode}
          draft={tournamentWizardDraft}
          busy={busyTournament}
          onChange={setTournamentWizardDraft}
          onClose={() => setTournamentWizardOpen(false)}
          onSubmit={() => {
            void submitTournamentWizard();
          }}
        />
      </>
    );
  }

  if (route.type === "users") {
    return (
      <UsersPage
        onNavigate={navigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={selectTournament}
        onCreateTournament={openTournamentCreate}
        onEditTournament={openTournamentEdit}
        onDeleteTournament={setDeleteTournamentTarget}
        pageAccess={pageAccess}
      />
    );
  }

  return (
    <>
      <EventsPage
        onNavigate={navigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={selectTournament}
        onCreateTournament={openTournamentCreate}
        onEditTournament={openTournamentEdit}
        onDeleteTournament={setDeleteTournamentTarget}
        currentUser={currentUser}
        pageAccess={pageAccess}
      />
      <TournamentWizardModal
        open={tournamentWizardOpen}
        mode={tournamentWizardMode}
        draft={tournamentWizardDraft}
        busy={busyTournament}
        onChange={setTournamentWizardDraft}
        onClose={() => setTournamentWizardOpen(false)}
        onSubmit={() => {
          void submitTournamentWizard();
        }}
      />
      <HardConfirmModal
        open={Boolean(deleteTournamentTarget)}
        busy={busyTournament}
        title="Delete tournament"
        description={
          deleteTournamentTarget
            ? `Confirm deletion of tournament "${deleteTournamentTarget.name}"? Linked events, activations, and venues will also be removed.`
            : "Confirm tournament deletion?"
        }
        actionLabel="Delete Tournament"
        onCancel={() => {
          if (busyTournament) return;
          setDeleteTournamentTarget(null);
        }}
        onApprove={async () => {
          if (!deleteTournamentTarget) return;
          setBusyTournament(true);
          try {
            await deleteTournamentNow(deleteTournamentTarget);
            setDeleteTournamentTarget(null);
          } finally {
            setBusyTournament(false);
          }
        }}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <RouterShell />
  </React.StrictMode>,
);
