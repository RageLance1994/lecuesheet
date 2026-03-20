import { useEffect, useMemo, useState } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import type { MatchInfoDraft, Venue } from "../lib/api";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

type Props = {
  open: boolean;
  draft: MatchInfoDraft;
  venueOptions?: Venue[];
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

export function MatchPlannerModal({
  open,
  draft,
  venueOptions = [],
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

  const hasUnsavedChanges = JSON.stringify(draft) !== initialDraftJson;

  function requestClose() {
    if (busy) return;
    if (hasUnsavedChanges) {
      setConfirmCloseOpen(true);
      return;
    }
    onClose();
  }

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
                          <span>Team A name</span>
                          <input
                            value={draft.teamAName}
                            onChange={(event) => updateField("teamAName", event.target.value)}
                            disabled={busy}
                            placeholder="Home Team"
                          />
                        </label>
                        <label className="field">
                          <span>Team A code</span>
                          <input
                            value={draft.teamACode}
                            onChange={(event) => updateField("teamACode", event.target.value)}
                            disabled={busy}
                            placeholder="PSG"
                          />
                        </label>
                        <label className="field">
                          <span>Team A logo URL</span>
                          <input
                            value={draft.teamALogoUrl}
                            onChange={(event) => updateField("teamALogoUrl", event.target.value)}
                            disabled={busy}
                            placeholder="https://..."
                          />
                        </label>
                      </div>
                    </div>

                    <div className="planner-team-card">
                      <div className="planner-team-card__title">
                        <span>Team B</span>
                        <TeamAvatar name={draft.teamBName} logoUrl={draft.teamBLogoUrl} />
                      </div>
                      <div className="planner-fields planner-fields--stacked">
                        <label className="field">
                          <span>Team B name</span>
                          <input
                            value={draft.teamBName}
                            onChange={(event) => updateField("teamBName", event.target.value)}
                            disabled={busy}
                            placeholder="Away Team"
                          />
                        </label>
                        <label className="field">
                          <span>Team B code</span>
                          <input
                            value={draft.teamBCode}
                            onChange={(event) => updateField("teamBCode", event.target.value)}
                            disabled={busy}
                            placeholder="CHE"
                          />
                        </label>
                        <label className="field">
                          <span>Team B logo URL</span>
                          <input
                            value={draft.teamBLogoUrl}
                            onChange={(event) => updateField("teamBLogoUrl", event.target.value)}
                            disabled={busy}
                            placeholder="https://..."
                          />
                        </label>
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

