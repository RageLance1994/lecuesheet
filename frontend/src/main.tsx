import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./pages/App";
import { EventsPage } from "./pages/EventsPage";
import { ActivationsPage } from "./pages/ActivationsPage";
import { VenuesPage } from "./pages/VenuesPage";
import { api, type Tournament } from "./lib/api";
import {
  TournamentWizardModal,
  emptyTournamentDraft,
  type TournamentDraft,
} from "./components/TournamentWizardModal";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/globals.css";

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/events";
  return pathname;
}

function RouterShell() {
  const [pathname, setPathname] = useState(() => normalizePathname(window.location.pathname));
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

  useEffect(() => {
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
    let active = true;
    api.getTournaments().then((rows) => {
      if (active) setTournaments(rows);
    }).catch(() => {
      if (active) setTournaments([]);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tournaments.length) return;
    const requested = new URLSearchParams(search).get("tournament") ?? "";
    const resolved = tournaments.some((item) => item.id === requested) ? requested : tournaments[0].id;
    if (resolved !== selectedTournamentId) {
      setSelectedTournamentId(resolved);
    }
    if (resolved !== requested) {
      const params = new URLSearchParams(search);
      params.set("tournament", resolved);
      const nextSearch = `?${params.toString()}`;
      window.history.replaceState({}, "", `${pathname}${nextSearch}`);
      setSearch(nextSearch);
    }
  }, [pathname, search, selectedTournamentId, tournaments]);

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
      logoUrl: tournament.logoUrl || "",
      keyPeople: tournament.keyPeople ?? [],
      matchesCount: tournament.matchesCount === null || tournament.matchesCount === undefined ? "" : String(tournament.matchesCount),
      format: tournament.format || "Eliminazione diretta",
      teamsCount: tournament.teamsCount === null || tournament.teamsCount === undefined ? "" : String(tournament.teamsCount),
      hostCountries: tournament.hostCountries ?? [],
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
        logoUrl: tournamentWizardDraft.logoUrl.trim() || null,
        keyPeople: tournamentWizardDraft.keyPeople,
        matchesCount: tournamentWizardDraft.matchesCount.trim() ? Number(tournamentWizardDraft.matchesCount) : null,
        format: tournamentWizardDraft.format || null,
        teamsCount: tournamentWizardDraft.teamsCount.trim() ? Number(tournamentWizardDraft.teamsCount) : null,
        hostCountries: tournamentWizardDraft.hostCountries,
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

  async function deleteTournament(tournament: Tournament) {
    const confirmed = window.confirm(`Delete tournament "${tournament.name}"?`);
    if (!confirmed) return;
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
    if (pathname === "/activations") {
      return { type: "activations" as const };
    }
    if (pathname === "/venues") {
      return { type: "venues" as const };
    }
    const cuesheetMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (cuesheetMatch) {
      return { type: "cuesheet" as const, eventId: cuesheetMatch[1] };
    }
    return { type: "events" as const };
  }, [pathname]);

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
          onDeleteTournament={(tournament) => {
            void deleteTournament(tournament);
          }}
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
          onDeleteTournament={(tournament) => {
            void deleteTournament(tournament);
          }}
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
          onDeleteTournament={(tournament) => {
            void deleteTournament(tournament);
          }}
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

  return (
    <>
      <EventsPage
        onNavigate={navigate}
        tournaments={tournaments}
        selectedTournamentId={selectedTournamentId}
        onSelectTournament={selectTournament}
        onCreateTournament={openTournamentCreate}
        onEditTournament={openTournamentEdit}
        onDeleteTournament={(tournament) => {
          void deleteTournament(tournament);
        }}
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

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
  <React.StrictMode>
    <RouterShell />
  </React.StrictMode>,
);
