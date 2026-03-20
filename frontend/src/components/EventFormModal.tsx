import { useEffect, useMemo, useState } from "react";
import { PHASES } from "../lib/api";
import type { Activation, CueEvent, PhaseKey } from "../lib/api";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { UnsavedChangesModal } from "./UnsavedChangesModal";

export type EventDraft = {
  phase: PhaseKey;
  category: string;
  cue: string;
  asset: string;
  operator: string;
  audio: string;
  script: string;
  activationId: string;
  screenTargets: Array<{ screenId: string; screenLabel: string; value: string }>;
  status: string;
  notes: string;
};

type ScreenOption = { id: string; label: string; type: string };

type Props = {
  open: boolean;
  title: string;
  draft: EventDraft;
  activationOptions?: Activation[];
  screenOptions?: ScreenOption[];
  onChange: (next: EventDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  busy?: boolean;
};

export const emptyDraft: EventDraft = {
  phase: "GATES_OPEN",
  category: "",
  cue: "",
  asset: "",
  operator: "",
  audio: "",
  script: "",
  activationId: "",
  screenTargets: [],
  status: "pending",
  notes: "",
};

export function draftFromEvent(event: CueEvent): EventDraft {
  return {
    phase: event.phase,
    category: event.category,
    cue: event.cue,
    asset: event.asset,
    operator: event.operator,
    audio: event.audio ?? "",
    script: event.script ?? "",
    activationId: event.activationId ?? "",
    screenTargets: Array.isArray(event.screenTargets) ? event.screenTargets : [],
    status: event.status,
    notes: event.notes,
  };
}

export function EventFormModal({
  open,
  title,
  draft,
  activationOptions = [],
  screenOptions = [],
  onChange,
  onClose,
  onSubmit,
  submitLabel,
  busy,
}: Props) {
  const [search, setSearch] = useState("");
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [initialDraftJson, setInitialDraftJson] = useState("");
  const recentActivations = activationOptions.slice(0, 6);
  const filteredActivations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return recentActivations;
    return activationOptions
      .filter((item) => {
        const haystack = `${item.name} ${item.fileName ?? ""} ${item.tags.join(" ")}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 12);
  }, [activationOptions, recentActivations, search]);

  function ensureTargets(nextDraft: EventDraft) {
    const next = { ...nextDraft };
    const existing = new Map(next.screenTargets.map((item) => [item.screenId, item]));
    next.screenTargets = screenOptions.map((screen) => {
      const previous = existing.get(screen.id);
      return previous ?? { screenId: screen.id, screenLabel: screen.label, value: "" };
    });
    return next;
  }

  useEffect(() => {
    if (open) {
      setInitialDraftJson(JSON.stringify(draft));
      setConfirmCloseOpen(false);
    }
  }, [open]);

  useEffect(() => {
    const hasAllTargets = screenOptions.every((screen) =>
      draft.screenTargets.some((item) => item.screenId === screen.id),
    );
    if (hasAllTargets) return;
    onChange(ensureTargets(draft));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenOptions.length]);

  function pickActivation(activation: Activation) {
    onChange({
      ...draft,
      activationId: activation.id,
      cue: draft.cue || activation.name,
      asset: draft.asset || activation.fileName || "",
      category: draft.category || (activation.tags[0] ?? ""),
    });
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

  if (!open) return null;

  return (
    <>
    <div className="modal-overlay" onMouseDown={requestClose}>
      <Card className="modal modal-activation" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="activation-form-layout">
            <section className="activation-form-db">
              <label className="field">
                <span>From Database</span>
                <input
                  placeholder="Search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <div className="activation-recent">
                <h4>Recent Activations</h4>
                {filteredActivations.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="activation-recent__item"
                    onClick={() => pickActivation(item)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </section>

            <section className="activation-form-fields">
              <div className="modal-grid">
                <label className="field">
                  <span>Phase</span>
                  <select
                    value={draft.phase}
                    onChange={(event) =>
                      onChange({ ...draft, phase: event.target.value as EventDraft["phase"] })
                    }
                  >
                    {PHASES.map((phase) => (
                      <option key={phase.key} value={phase.key}>
                        {phase.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Name</span>
                  <input
                    value={draft.cue}
                    onChange={(event) => onChange({ ...draft, cue: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <input
                    value={draft.category}
                    onChange={(event) => onChange({ ...draft, category: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Audio</span>
                  <input
                    value={draft.audio}
                    onChange={(event) => onChange({ ...draft, audio: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Asset / Template</span>
                  <input
                    value={draft.asset}
                    onChange={(event) => onChange({ ...draft, asset: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Operator</span>
                  <input
                    value={draft.operator}
                    onChange={(event) => onChange({ ...draft, operator: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={draft.status}
                    onChange={(event) => onChange({ ...draft, status: event.target.value })}
                  >
                    <option value="pending">pending</option>
                    <option value="ready">ready</option>
                    <option value="live">live</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                </label>
                <label className="field">
                  <span>Notes</span>
                  <input
                    value={draft.notes}
                    onChange={(event) => onChange({ ...draft, notes: event.target.value })}
                  />
                </label>
                <label className="field notes-field">
                  <span>Script</span>
                  <textarea
                    value={draft.script}
                    onChange={(event) => onChange({ ...draft, script: event.target.value })}
                    rows={4}
                  />
                </label>
              </div>

              {screenOptions.length ? (
                <div className="activation-screen-targets">
                  <h4>Venue Screen Targets</h4>
                  <div className="activation-screen-targets__grid">
                    {screenOptions.map((screen) => {
                      const target = draft.screenTargets.find((item) => item.screenId === screen.id) ?? {
                        screenId: screen.id,
                        screenLabel: screen.label,
                        value: "",
                      };
                      return (
                        <label key={screen.id} className="field">
                          <span>{screen.label}</span>
                          <input
                            value={target.value}
                            onChange={(event) =>
                              onChange({
                                ...draft,
                                screenTargets: draft.screenTargets
                                  .filter((item) => item.screenId !== screen.id)
                                  .concat({
                                    screenId: screen.id,
                                    screenLabel: screen.label,
                                    value: event.target.value,
                                  }),
                              })
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
          <div className="modal-actions">
            <Button variant="outline" onClick={requestClose} disabled={busy}>
              <i className="fa-solid fa-xmark" />
              <span>Cancel</span>
            </Button>
            <Button onClick={onSubmit} disabled={busy}>
              <i className="fa-solid fa-floppy-disk" />
              <span>{submitLabel}</span>
            </Button>
          </div>
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
