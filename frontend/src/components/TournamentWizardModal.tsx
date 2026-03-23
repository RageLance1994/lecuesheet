import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import type { EventPhase } from "../lib/api";

const COUNTRY_OPTIONS = [
  "Italy",
  "France",
  "Germany",
  "Spain",
  "Portugal",
  "United Kingdom",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Austria",
  "Poland",
  "Czech Republic",
  "Croatia",
  "Serbia",
  "Greece",
  "Turkey",
  "United States",
  "Canada",
  "Mexico",
  "Brazil",
];

export type TournamentDraft = {
  name: string;
  startDate: string;
  endDate: string;
  federation: string;
  logoUrl: string;
  keyPeople: string[];
  matchesCount: string;
  format: string;
  teamsCount: string;
  hostCountries: string[];
  eventPhases: EventPhase[];
};

export const EVENT_PHASE_TEMPLATES: Array<{
  id: string;
  label: string;
  phases: EventPhase[];
}> = [
  {
    id: "soccer",
    label: "Calcio",
    phases: [
      { key: "GATES_OPEN", label: "Gates Open", offsetMinutes: -120 },
      { key: "KICK_OFF", label: "Kick Off", offsetMinutes: 0 },
      { key: "HALF_TIME", label: "Half Time", offsetMinutes: 45 },
      { key: "SECOND_HALF_KICK_OFF", label: "Kick Off 2nd Half", offsetMinutes: 60 },
      { key: "FULL_TIME", label: "Full Time", offsetMinutes: 105 },
    ],
  },
  {
    id: "basketball",
    label: "Basket",
    phases: [
      { key: "GATES_OPEN", label: "Gates Open", offsetMinutes: -90 },
      { key: "TIP_OFF", label: "Tip Off", offsetMinutes: 0 },
      { key: "HALF_TIME", label: "Half Time", offsetMinutes: 24 },
      { key: "THIRD_QUARTER_START", label: "Start 3rd Quarter", offsetMinutes: 39 },
      { key: "FULL_TIME", label: "Final Buzzer", offsetMinutes: 58 },
    ],
  },
  {
    id: "american_football",
    label: "Football Americano",
    phases: [
      { key: "GATES_OPEN", label: "Gates Open", offsetMinutes: -120 },
      { key: "KICK_OFF", label: "Kick Off", offsetMinutes: 0 },
      { key: "HALF_TIME", label: "Half Time", offsetMinutes: 60 },
      { key: "SECOND_HALF_KICK_OFF", label: "Kick Off 2nd Half", offsetMinutes: 80 },
      { key: "FULL_TIME", label: "Final Whistle", offsetMinutes: 150 },
    ],
  },
];

function phaseKeyFromLabel(label: string, index: number) {
  const key = String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key || `PHASE_${index + 1}`;
}

type Props = {
  open: boolean;
  mode: "create" | "edit";
  draft: TournamentDraft;
  busy?: boolean;
  onChange: (next: TournamentDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function emptyTournamentDraft(): TournamentDraft {
  return {
    name: "",
    startDate: "",
    endDate: "",
    federation: "",
    logoUrl: "",
    keyPeople: [],
    matchesCount: "",
    format: "Single elimination",
    teamsCount: "",
    hostCountries: [],
    eventPhases: EVENT_PHASE_TEMPLATES[0].phases.map((phase) => ({ ...phase })),
  };
}

export function TournamentWizardModal({
  open,
  mode,
  draft,
  busy,
  onChange,
  onClose,
  onSubmit,
}: Props) {
  const [keyPeopleInput, setKeyPeopleInput] = useState("");
  const [countryInput, setCountryInput] = useState("");
  const [phaseTemplateId, setPhaseTemplateId] = useState(EVENT_PHASE_TEMPLATES[0].id);
  const [phasesOpen, setPhasesOpen] = useState(false);

  useEffect(() => {
    if (open) setPhasesOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>{mode === "create" ? "New Tournament" : "Edit Tournament"}</CardTitle>
        </CardHeader>
        <CardContent className="modal-content-scroll">
          <form
            className="modal-grid"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label className="field">
              <span>Name</span>
              <input
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Tournament logo</span>
              <input
                value={draft.logoUrl}
                onChange={(event) => onChange({ ...draft, logoUrl: event.target.value })}
                placeholder="https://..."
              />
            </label>
            <label className="field">
              <span>Start date</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => onChange({ ...draft, startDate: event.target.value })}
              />
            </label>
            <label className="field">
              <span>End date</span>
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => onChange({ ...draft, endDate: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Federation</span>
              <input
                value={draft.federation}
                onChange={(event) => onChange({ ...draft, federation: event.target.value })}
                placeholder="UEFA"
              />
            </label>
            <label className="field">
              <span>Number of matches</span>
              <input
                type="number"
                min={0}
                value={draft.matchesCount}
                onChange={(event) => onChange({ ...draft, matchesCount: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Number of teams</span>
              <input
                type="number"
                min={0}
                value={draft.teamsCount}
                onChange={(event) => onChange({ ...draft, teamsCount: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Format</span>
              <select
                value={draft.format}
                onChange={(event) => onChange({ ...draft, format: event.target.value })}
              >
                <option value="Single elimination">Single elimination</option>
                <option value="Score">Score</option>
              </select>
            </label>

            <div className="field notes-field">
              <span>Event Phases</span>
              <button
                type="button"
                className="phase-editor__toggle"
                onClick={() => setPhasesOpen((prev) => !prev)}
              >
                <strong>Configure Phases</strong>
                <span>{`${draft.eventPhases.length} phases`}</span>
                <i className={`fa-solid ${phasesOpen ? "fa-chevron-up" : "fa-chevron-down"}`} />
              </button>
              {!phasesOpen ? (
                <div className="phase-editor__summary">
                  <span>Kick-Off is always minute 0. Phases can be negative.</span>
                </div>
              ) : null}
              {phasesOpen ? (
                <>
                  <div className="activation-tags__input">
                    <select
                      value={phaseTemplateId}
                      onChange={(event) => setPhaseTemplateId(event.target.value)}
                    >
                      {EVENT_PHASE_TEMPLATES.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const template = EVENT_PHASE_TEMPLATES.find((item) => item.id === phaseTemplateId);
                        if (!template) return;
                        onChange({
                          ...draft,
                          eventPhases: template.phases.map((phase) => ({ ...phase })),
                        });
                      }}
                    >
                      <i className="fa-solid fa-wand-magic-sparkles" />
                      <span>Apply Template</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onChange({
                          ...draft,
                          eventPhases: [
                            ...draft.eventPhases,
                            {
                              key: `PHASE_${draft.eventPhases.length + 1}`,
                              label: `Phase ${draft.eventPhases.length + 1}`,
                              offsetMinutes: 0,
                            },
                          ],
                        })
                      }
                    >
                      <i className="fa-solid fa-plus" />
                      <span>Add Phase</span>
                    </Button>
                  </div>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Minutes From Kick-Off</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {(draft.eventPhases || []).map((phase, index) => (
                          <tr key={`${phase.key}-${index}`}>
                            <td>
                              <input
                                value={phase.label}
                                onChange={(event) => {
                                  const label = event.target.value;
                                  onChange({
                                    ...draft,
                                    eventPhases: draft.eventPhases.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            label,
                                            key: phaseKeyFromLabel(label, index),
                                          }
                                        : item,
                                    ),
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={1}
                                value={String(phase.offsetMinutes ?? 0)}
                                onChange={(event) =>
                                  onChange({
                                    ...draft,
                                    eventPhases: draft.eventPhases.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? {
                                            ...item,
                                            offsetMinutes: Number.isFinite(Number(event.target.value))
                                              ? Math.round(Number(event.target.value))
                                              : 0,
                                          }
                                        : item,
                                    ),
                                  })
                                }
                                placeholder="e.g. -15"
                              />
                            </td>
                            <td>
                              <Button
                                type="button"
                                variant="danger"
                                size="icon"
                                title="Remove phase"
                                onClick={() =>
                                  onChange({
                                    ...draft,
                                    eventPhases: draft.eventPhases.filter((_, itemIndex) => itemIndex !== index),
                                  })
                                }
                                disabled={draft.eventPhases.length <= 1}
                              >
                                <i className="fa-solid fa-trash" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            <div className="field notes-field">
              <span>Key People</span>
              <div className="activation-tags__list">
                {draft.keyPeople.map((person) => (
                  <button
                    key={person}
                    type="button"
                    className="activation-tag"
                    onClick={() =>
                      onChange({ ...draft, keyPeople: draft.keyPeople.filter((item) => item !== person) })
                    }
                  >
                    {person}
                    <i className="fa-solid fa-xmark" />
                  </button>
                ))}
              </div>
              <div className="activation-tags__input">
                <input
                  value={keyPeopleInput}
                  onChange={(event) => setKeyPeopleInput(event.target.value)}
                  placeholder="Add person"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = keyPeopleInput.trim();
                    if (!next || draft.keyPeople.includes(next)) return;
                    onChange({ ...draft, keyPeople: [...draft.keyPeople, next] });
                    setKeyPeopleInput("");
                  }}
                >
                  <i className="fa-solid fa-user-plus" />
                  <span>Add</span>
                </Button>
              </div>
            </div>

            <div className="field notes-field">
              <span>Host countries</span>
              <div className="activation-tags__list">
                {draft.hostCountries.map((country) => (
                  <button
                    key={country}
                    type="button"
                    className="activation-tag"
                    onClick={() =>
                      onChange({
                        ...draft,
                        hostCountries: draft.hostCountries.filter((item) => item !== country),
                      })
                    }
                  >
                    {country}
                    <i className="fa-solid fa-xmark" />
                  </button>
                ))}
              </div>
              <div className="activation-tags__input">
                <input
                  list="country-options"
                  value={countryInput}
                  onChange={(event) => setCountryInput(event.target.value)}
                  placeholder="Search country"
                />
                <datalist id="country-options">
                  {COUNTRY_OPTIONS.map((country) => (
                    <option key={country} value={country} />
                  ))}
                </datalist>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = countryInput.trim();
                    if (!next || draft.hostCountries.includes(next)) return;
                    onChange({ ...draft, hostCountries: [...draft.hostCountries, next] });
                    setCountryInput("");
                  }}
                >
                  <i className="fa-solid fa-earth-europe" />
                  <span>Add</span>
                </Button>
              </div>
            </div>

            <div className="modal-actions modal-actions--left">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                <i className="fa-solid fa-xmark" />
                <span>Cancel</span>
              </Button>
              <Button type="submit" disabled={busy || !draft.name.trim()}>
                <i className="fa-solid fa-floppy-disk" />
                <span>{mode === "create" ? "Create Tournament" : "Save Tournament"}</span>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
