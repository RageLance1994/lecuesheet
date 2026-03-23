import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import type { MatchInfoDraft, Team, Venue } from "../lib/api";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

type Props = {
  open: boolean;
  draft: MatchInfoDraft;
  venueOptions?: Venue[];
  teamOptions?: Team[];
  onRegisterTeam?: () => void;
  onChange: (next: MatchInfoDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  busy?: boolean;
};

const STEPS = [
  {
    key: "match",
    title: "Match",
    description: "Core identifiers and location.",
  },
  {
    key: "teams",
    title: "Teams",
    description: "Team rows and optional logos.",
  },
  {
    key: "schedule",
    title: "Schedule",
    description: "Gates, date, kick-off (local time), and venue.",
  },
] as const;

function TeamAvatar({ name, logoUrl }: { name: string; logoUrl: string }) {
  const initials = useMemo(() => {
    const cleaned = name.trim();
    if (!cleaned) return "T";
    return cleaned
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);
  }, [name]);

  if (logoUrl.trim()) {
    return <img className="planner-avatar__img" src={logoUrl} alt="" />;
  }

  return <span className="planner-avatar__fallback">{initials}</span>;
}

function TeamComboBox({
  valueId,
  options,
  disabled,
  placeholder,
  onSelect,
}: {
  valueId: string;
  options: Team[];
  disabled?: boolean;
  placeholder?: string;
  onSelect: (teamId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((team) => team.id === valueId) ?? null;

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = options.filter((team) => {
    if (!normalizedQuery) return true;
    const name = String(team.name || "").toLowerCase();
    const tricode = String(team.tricode || "").toLowerCase();
    const country = String(team.country || "").toLowerCase();
    return name.includes(normalizedQuery) || tricode.includes(normalizedQuery) || country.includes(normalizedQuery);
  });

  return (
    <div className="team-combobox" ref={rootRef}>
      <button
        type="button"
        className="team-combobox__trigger"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((state) => !state);
          setQuery("");
        }}
      >
        <span className="team-combobox__trigger-main">
          {selected?.logoUrl ? (
            <img className="team-combobox__logo" src={selected.logoUrl} alt="" />
          ) : (
            <span className="team-combobox__logo-fallback" aria-hidden>
              <i className="fa-solid fa-shield-halved" />
            </span>
          )}
          <span>{selected ? `${selected.name}${selected.tricode ? ` (${selected.tricode})` : ""}` : (placeholder || "Select team")}</span>
        </span>
        <i className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"} team-combobox__caret`} />
      </button>

      {open ? (
        <div className="team-combobox__menu">
          <div className="team-combobox__search-wrap">
            <input
              className="team-combobox__search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search team, code, country..."
              autoFocus
            />
          </div>
          <button
            type="button"
            className={`team-combobox__item ${!valueId ? "is-selected" : ""}`}
            onClick={() => {
              onSelect("");
              setOpen(false);
              setQuery("");
            }}
          >
            <span className="team-combobox__item-copy">
              <strong>No team selected</strong>
              <small>Clear current value</small>
            </span>
          </button>
          {filtered.map((team) => {
            const isSelected = team.id === valueId;
            return (
              <button
                key={team.id}
                type="button"
                className={`team-combobox__item ${isSelected ? "is-selected" : ""}`}
                onClick={() => {
                  onSelect(team.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="team-combobox__item-main">
                  {team.logoUrl ? (
                    <img className="team-combobox__logo" src={team.logoUrl} alt="" />
                  ) : (
                    <span className="team-combobox__logo-fallback" aria-hidden>
                      <i className="fa-solid fa-shield-halved" />
                    </span>
                  )}
                  <span className="team-combobox__item-copy">
                    <strong>{team.name}</strong>
                    <small>
                      {team.tricode || "-"}{team.country ? ` • ${team.country}` : ""}
                    </small>
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="team-combobox__empty">No team matches your search.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MatchPlannerModal({
  open,
  draft,
  venueOptions = [],
  teamOptions = [],
  onRegisterTeam,
  onChange,
  onClose,
  onSubmit,
  busy,
}: Props) {
  const [step, setStep] = useState(0);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [initialDraftJson, setInitialDraftJson] = useState("");

  useEffect(() => {
    if (open) {
      setStep(0);
      setInitialDraftJson(JSON.stringify(draft));
      setConfirmCloseOpen(false);
    }
  }, [open]);

  if (!open) return null;

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  function updateField<K extends keyof MatchInfoDraft>(key: K, value: MatchInfoDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function selectVenue(venueId: string) {
    if (!venueId) {
      onChange({ ...draft, venueId: "" });
      return;
    }
    const venue = venueOptions.find((item) => item.id === venueId);
    if (!venue) return;
    onChange({
      ...draft,
      venueId: venue.id,
      venue: venue.name || "",
      city: venue.city || draft.city,
    });
  }

  function advance() {
    if (isLastStep) {
      onSubmit();
      return;
    }
    setStep((next) => Math.min(next + 1, STEPS.length - 1));
  }

  function selectTeam(side: "A" | "B", teamId: string) {
    if (!teamId) {
      if (side === "A") {
        onChange({
          ...draft,
          teamAName: "",
          teamACode: "",
          teamALogoUrl: "",
        });
      } else {
        onChange({
          ...draft,
          teamBName: "",
          teamBCode: "",
          teamBLogoUrl: "",
        });
      }
      return;
    }

    const team = teamOptions.find((item) => item.id === teamId);
    if (!team) return;
    if (side === "A") {
      onChange({
        ...draft,
        teamAName: team.name || "",
        teamACode: team.tricode || "",
        teamALogoUrl: team.logoUrl || "",
      });
      return;
    }
    onChange({
      ...draft,
      teamBName: team.name || "",
      teamBCode: team.tricode || "",
      teamBLogoUrl: team.logoUrl || "",
    });
  }

  const selectedTeamAId =
    teamOptions.find(
      (team) =>
        (team.name || "").trim() === draft.teamAName.trim() &&
        (team.tricode || "").trim() === draft.teamACode.trim(),
    )?.id || "";
  const selectedTeamBId =
    teamOptions.find(
      (team) =>
        (team.name || "").trim() === draft.teamBName.trim() &&
        (team.tricode || "").trim() === draft.teamBCode.trim(),
    )?.id || "";

  const hasUnsavedChanges = JSON.stringify(draft) !== initialDraftJson;

  function requestClose() {
    if (busy) return;
    if (hasUnsavedChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  }

  useEffect(() => {
    if (!open || confirmCloseOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      requestClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, confirmCloseOpen, busy, hasUnsavedChanges, onClose]);

  return (
    <>
    <div className="modal-overlay" onMouseDown={requestClose}>
      <Card className="modal modal-planner" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader className="planner-modal__header">
          <div>
            <CardTitle>Planner / Wizard</CardTitle>
            <CardDescription>{currentStep.description}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" title="Close planner" onClick={requestClose} disabled={busy}>
            <i className="fa-solid fa-xmark" />
          </Button>
        </CardHeader>
        <CardContent className="planner-modal__content">
          <form
            className="planner-modal__form"
            onSubmit={(event) => {
              event.preventDefault();
              advance();
            }}
          >
            <div className="planner-stepper" role="tablist" aria-label="Match planner steps">
              {STEPS.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={[
                    "planner-stepper__item",
                    index === step ? "is-active" : "",
                    index < step ? "is-complete" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setStep(index)}
                  disabled={busy}
                >
                  <span className="planner-stepper__index">{index + 1}</span>
                  <span className="planner-stepper__copy">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="planner-modal__grid">
              <section className="planner-panel">
                {currentStep.key === "match" ? (
                  <div className="planner-fields">
                    <label className="field planner-field--wide">
                      <span>Venue record</span>
                      <select
                        value={draft.venueId || ""}
                        onChange={(event) => selectVenue(event.target.value)}
                        disabled={busy || venueOptions.length === 0}
                      >
                        <option value="">Select a venue</option>
                        {venueOptions.map((venue) => (
                          <option key={venue.id} value={venue.id}>
                            {venue.name} {venue.city ? `(${venue.city})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Match ID</span>
                      <input
                        value={draft.matchId}
                        onChange={(event) => updateField("matchId", event.target.value)}
                        disabled={busy}
                        placeholder="MATCH-0142"
                      />
                    </label>
                    <label className="field">
                      <span>City</span>
                      <input
                        value={draft.city}
                        onChange={(event) => updateField("city", event.target.value)}
                        disabled={busy}
                        placeholder="Rome"
                      />
                    </label>
                    <label className="field planner-field--wide">
                      <span>Venue</span>
                      <input
                        value={draft.venue}
                        onChange={(event) => updateField("venue", event.target.value)}
                        disabled={busy}
                        placeholder="Stadio Olimpico"
                      />
                    </label>
                  </div>
                ) : null}

                {currentStep.key === "teams" ? (
                  <div className="planner-fields planner-fields--teams">
                    <div className="planner-team-card">
                      <div className="planner-team-card__title">
                        <span>Team A</span>
                        <TeamAvatar name={draft.teamAName} logoUrl={draft.teamALogoUrl} />
                      </div>
                      <div className="planner-fields planner-fields--stacked">
                        <label className="field">
                          <span>Team A</span>
                          <TeamComboBox
                            valueId={selectedTeamAId}
                            options={teamOptions}
                            disabled={busy || teamOptions.length === 0}
                            placeholder="Select Team A"
                            onSelect={(teamId) => selectTeam("A", teamId)}
                          />
                        </label>
                        <div className="planner-summary-card">
                          <strong>{draft.teamAName || "-"}</strong>
                          <span>{draft.teamACode || "-"}</span>
                          <span>{draft.teamALogoUrl ? "Logo linked" : "No logo set"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="planner-team-card">
                      <div className="planner-team-card__title">
                        <span>Team B</span>
                        <TeamAvatar name={draft.teamBName} logoUrl={draft.teamBLogoUrl} />
                      </div>
                      <div className="planner-fields planner-fields--stacked">
                        <label className="field">
                          <span>Team B</span>
                          <TeamComboBox
                            valueId={selectedTeamBId}
                            options={teamOptions}
                            disabled={busy || teamOptions.length === 0}
                            placeholder="Select Team B"
                            onSelect={(teamId) => selectTeam("B", teamId)}
                          />
                        </label>
                        <div className="planner-summary-card">
                          <strong>{draft.teamBName || "-"}</strong>
                          <span>{draft.teamBCode || "-"}</span>
                          <span>{draft.teamBLogoUrl ? "Logo linked" : "No logo set"}</span>
                        </div>
                      </div>
                    </div>
                    <div className="planner-field--wide">
                      <div className="modal-actions modal-actions--left">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onRegisterTeam?.()}
                          disabled={busy}
                        >
                          <i className="fa-solid fa-shield-halved" />
                          <span>Register Team</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep.key === "schedule" ? (
                  <div className="planner-fields">
                    <label className="field">
                      <span>Gates Open</span>
                      <input
                        type="time"
                        value={draft.gatesOpen}
                        onChange={(event) => updateField("gatesOpen", event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label className="field">
                      <span>Date</span>
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) => updateField("date", event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label className="field">
                      <span>Kick-off (Local Time)</span>
                      <input
                        type="time"
                        value={draft.kickoffTime}
                        onChange={(event) => updateField("kickoffTime", event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label className="field planner-field--wide">
                      <span>Summary</span>
                      <div className="planner-summary-card">
                        <strong>{draft.matchId || "-"}</strong>
                        <span>{draft.city || "-"}</span>
                        <span>{draft.venue || "-"}</span>
                      </div>
                    </label>
                  </div>
                ) : null}
              </section>

              <aside className="planner-preview">
                <div className="planner-preview__header">
                  <span>Live Preview</span>
                  <strong>{draft.matchId || "-"}</strong>
                </div>

                <div className="planner-preview__teams">
                  <div className="planner-preview__team">
                    <span className="planner-preview__team-label">A</span>
                    <TeamAvatar name={draft.teamAName} logoUrl={draft.teamALogoUrl} />
                    <div>
                      <strong>{draft.teamAName || "-"}</strong>
                      <span>{draft.teamACode || "-"}</span>
                      <span>{draft.teamALogoUrl ? "Logo linked" : "No logo set"}</span>
                    </div>
                  </div>
                  <div className="planner-preview__team">
                    <span className="planner-preview__team-label">B</span>
                    <TeamAvatar name={draft.teamBName} logoUrl={draft.teamBLogoUrl} />
                    <div>
                      <strong>{draft.teamBName || "-"}</strong>
                      <span>{draft.teamBCode || "-"}</span>
                      <span>{draft.teamBLogoUrl ? "Logo linked" : "No logo set"}</span>
                    </div>
                  </div>
                </div>

                <div className="planner-preview__fields">
                  <div>
                    <span>Gates Open</span>
                    <strong>{draft.gatesOpen || "-"}</strong>
                  </div>
                  <div>
                    <span>City</span>
                    <strong>{draft.city || "-"}</strong>
                  </div>
                  <div>
                    <span>Date</span>
                    <strong>{draft.date || "-"}</strong>
                  </div>
                  <div>
                    <span>Kick-off (Local Time)</span>
                    <strong>{draft.kickoffTime || "-"}</strong>
                  </div>
                  <div className="planner-preview__venue">
                    <span>Venue</span>
                    <strong>{draft.venue || "-"}</strong>
                  </div>
                </div>
              </aside>
            </div>

            <div className="modal-actions planner-modal__actions">
              <Button variant="outline" onClick={requestClose} disabled={busy}>
                <i className="fa-solid fa-xmark" />
                <span>Cancel</span>
              </Button>
              <div className="planner-modal__action-group">
                <Button
                  variant="outline"
                  onClick={() => setStep((next) => Math.max(next - 1, 0))}
                  disabled={busy || step === 0}
                >
                  <i className="fa-solid fa-arrow-left" />
                  <span>Back</span>
                </Button>
                <Button type="submit" disabled={busy}>
                  <i className={`fa-solid ${isLastStep ? "fa-floppy-disk" : "fa-arrow-right"}`} />
                  <span>{isLastStep ? "Save Match Info" : "Next"}</span>
                </Button>
              </div>
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
        onClose();
      }}
    />
    </>
  );
}

