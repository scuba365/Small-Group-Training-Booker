import React, { useState, useEffect, useRef } from "react";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Check,
  Plus,
  Timer,
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Trophy,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetLog {
  id: string;
  setNumber: number;
  reps?: number | null;
  loadKg?: number | null;
  rpe?: number | null;
  rir?: number | null;
  distanceMeters?: number | null;
  timeSeconds?: number | null;
  pacePerKm?: string | null;
  calories?: number | null;
  completed: boolean;
}

interface PreviousPerformance {
  completedAt: string | null;
  sets: SetLog[];
}

interface Exercise {
  exerciseInstanceId: string | null;
  workoutExerciseId: string;
  exercise: {
    id: string;
    name: string;
    exerciseType: string;
  };
  prescription: {
    sets?: number | null;
    repsMin?: number | null;
    repsMax?: number | null;
    loadKg?: number | null;
    loadPercent1rm?: number | null;
    rpe?: number | null;
    rir?: number | null;
    tempo?: string | null;
    restSeconds?: number | null;
    durationSeconds?: number | null;
    distanceMeters?: number | null;
    pacePerKm?: string | null;
    calories?: number | null;
    targetTime?: string | null;
    targetPace?: string | null;
    notes?: string | null;
  };
  sets: SetLog[];
  previousPerformance: PreviousPerformance | null;
}

interface Block {
  id: string;
  name?: string | null;
  blockType: string;
  orderIndex: number;
  rounds?: number | null;
  timeCapSeconds?: number | null;
  notes?: string | null;
  exercises: Exercise[];
}

interface WorkoutInstance {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  sessionRpe?: number | null;
  workoutId: string;
  blocks: Block[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function prescriptionLabel(p: Exercise["prescription"]): string {
  const parts: string[] = [];
  if (p.sets) parts.push(`${p.sets} ×`);
  if (p.repsMin != null && p.repsMax != null) {
    parts.push(p.repsMin === p.repsMax ? `${p.repsMin} reps` : `${p.repsMin}–${p.repsMax} reps`);
  }
  if (p.loadKg) parts.push(`${p.loadKg}kg`);
  if (p.loadPercent1rm) parts.push(`${p.loadPercent1rm}% 1RM`);
  if (p.rpe) parts.push(`RPE ${p.rpe}`);
  if (p.distanceMeters) parts.push(`${p.distanceMeters}m`);
  if (p.durationSeconds) parts.push(`${Math.floor(p.durationSeconds / 60)}min`);
  if (p.pacePerKm) parts.push(`@ ${p.pacePerKm}/km`);
  if (p.targetTime) parts.push(p.targetTime);
  return parts.join(" ") || "—";
}

function prevSetLabel(set: SetLog, type: string): string {
  const parts: string[] = [];
  if (set.loadKg != null) parts.push(`${set.loadKg}kg`);
  if (set.reps != null) parts.push(`× ${set.reps}`);
  if (set.rpe != null) parts.push(`RPE ${set.rpe}`);
  if (set.distanceMeters != null) parts.push(`${set.distanceMeters}m`);
  if (set.timeSeconds != null) parts.push(formatDuration(set.timeSeconds));
  if (set.pacePerKm) parts.push(`@ ${set.pacePerKm}/km`);
  if (set.calories != null) parts.push(`${set.calories}cal`);
  return parts.join(" ") || "—";
}

function isStrength(type: string) {
  return type === "STRENGTH";
}

function isCardio(type: string) {
  return type === "CARDIO";
}

// ─── Set Row ──────────────────────────────────────────────────────────────────

function SetRow({
  set,
  setIndex,
  exerciseType,
  instanceId,
  exerciseInstanceId,
  onSaved,
}: {
  set: SetLog | null;
  setIndex: number;
  exerciseType: string;
  instanceId: string;
  exerciseInstanceId: string;
  onSaved: (saved: SetLog) => void;
}) {
  const [reps, setReps] = useState(set?.reps?.toString() ?? "");
  const [load, setLoad] = useState(set?.loadKg?.toString() ?? "");
  const [rpe, setRpe] = useState(set?.rpe?.toString() ?? "");
  const [dist, setDist] = useState(set?.distanceMeters?.toString() ?? "");
  const [time, setTime] = useState(set?.timeSeconds?.toString() ?? "");
  const [calories, setCalories] = useState(set?.calories?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  const saveSet = async (completed: boolean) => {
    setSaving(true);
    const body: Record<string, unknown> = {
      setNumber: setIndex + 1,
      completed,
    };
    if (reps) body.reps = parseInt(reps, 10);
    if (load) body.loadKg = parseFloat(load);
    if (rpe) body.rpe = parseFloat(rpe);
    if (dist) body.distanceMeters = parseFloat(dist);
    if (time) body.timeSeconds = parseInt(time, 10);
    if (calories) body.calories = parseInt(calories, 10);

    try {
      let saved: SetLog;
      if (set?.id) {
        saved = await apiFetch(
          `/workout-instances/${instanceId}/exercises/${exerciseInstanceId}/sets/${set.id}`,
          { method: "PUT", body: JSON.stringify(body) },
        );
      } else {
        saved = await apiFetch(
          `/workout-instances/${instanceId}/exercises/${exerciseInstanceId}/sets`,
          { method: "POST", body: JSON.stringify(body) },
        );
      }
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  };

  const isComplete = set?.completed ?? false;

  return (
    <div
      className={`flex items-center gap-2 py-2.5 border-b border-border/30 last:border-0 ${
        isComplete ? "opacity-60" : ""
      }`}
    >
      <span className="w-6 text-center text-xs font-mono text-muted-foreground shrink-0">
        {setIndex + 1}
      </span>

      {(isStrength(exerciseType) || exerciseType === "CONDITIONING" || exerciseType === "HYROX") && (
        <>
          {!isCardio(exerciseType) && (
            <Input
              type="number"
              placeholder="Reps"
              className="h-8 text-sm text-center px-1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              disabled={isComplete}
            />
          )}
          {(isStrength(exerciseType) || exerciseType === "HYROX") && (
            <Input
              type="number"
              placeholder="kg"
              className="h-8 text-sm text-center px-1"
              value={load}
              onChange={(e) => setLoad(e.target.value)}
              disabled={isComplete}
            />
          )}
        </>
      )}

      {(isCardio(exerciseType) || exerciseType === "CONDITIONING" || exerciseType === "HYROX") && (
        <>
          <Input
            type="number"
            placeholder="m"
            className="h-8 text-sm text-center px-1"
            value={dist}
            onChange={(e) => setDist(e.target.value)}
            disabled={isComplete}
          />
          <Input
            type="number"
            placeholder="sec"
            className="h-8 text-sm text-center px-1"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={isComplete}
          />
        </>
      )}

      <Input
        type="number"
        placeholder="RPE"
        className="h-8 text-sm text-center px-1 w-16 shrink-0"
        value={rpe}
        onChange={(e) => setRpe(e.target.value)}
        disabled={isComplete}
      />

      <button
        className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center border transition-colors ${
          isComplete
            ? "bg-primary border-primary text-primary-foreground"
            : "border-border hover:border-primary hover:bg-primary/10"
        }`}
        onClick={() => saveSet(!isComplete)}
        disabled={saving}
      >
        <Check className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Exercise Card ────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  instanceId,
  onSetsUpdate,
}: {
  exercise: Exercise;
  instanceId: string;
  onSetsUpdate: (exerciseInstanceId: string, sets: SetLog[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const [sets, setSets] = useState<(SetLog | null)[]>(() => {
    const targetSets = exercise.prescription.sets ?? 1;
    const existing = exercise.sets ?? [];
    const result: (SetLog | null)[] = [...existing];
    while (result.length < targetSets) result.push(null);
    return result;
  });

  const handleSaved = (index: number, saved: SetLog) => {
    setSets((prev) => {
      const next = [...prev];
      next[index] = saved;
      onSetsUpdate(exercise.exerciseInstanceId!, next.filter(Boolean) as SetLog[]);
      return next;
    });
  };

  const addSet = () => setSets((prev) => [...prev, null]);

  const prev = exercise.previousPerformance;
  const completedSets = sets.filter((s) => s?.completed).length;
  const totalSets = sets.length;

  return (
    <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{exercise.exercise.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {prescriptionLabel(exercise.prescription)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {completedSets > 0 && (
            <span className="text-xs font-mono text-primary">
              {completedSets}/{totalSets}
            </span>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {/* Previous performance */}
          {prev && prev.sets.length > 0 && (
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Last time
                {prev.completedAt
                  ? ` · ${new Date(prev.completedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
                  : ""}
              </p>
              <div className="space-y-1">
                {prev.sets.map((s) => (
                  <p key={s.id} className="text-xs text-muted-foreground font-mono">
                    Set {s.setNumber}: {prevSetLabel(s, exercise.exercise.exerciseType)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Column headers */}
          <div className="flex items-center gap-2 px-0">
            <span className="w-6 shrink-0" />
            {isStrength(exercise.exercise.exerciseType) && (
              <>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">REPS</span>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">KG</span>
              </>
            )}
            {isCardio(exercise.exercise.exerciseType) && (
              <>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">M</span>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">SEC</span>
              </>
            )}
            {(exercise.exercise.exerciseType === "CONDITIONING" ||
              exercise.exercise.exerciseType === "HYROX") && (
              <>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">REPS</span>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">M</span>
                <span className="text-[10px] text-muted-foreground flex-1 text-center">SEC</span>
              </>
            )}
            <span className="text-[10px] text-muted-foreground w-16 text-center shrink-0">RPE</span>
            <span className="w-8 shrink-0" />
          </div>

          {/* Set rows */}
          <div>
            {sets.map((set, idx) => (
              <SetRow
                key={idx}
                set={set}
                setIndex={idx}
                exerciseType={exercise.exercise.exerciseType}
                instanceId={instanceId}
                exerciseInstanceId={exercise.exerciseInstanceId!}
                onSaved={(saved) => handleSaved(idx, saved)}
              />
            ))}
          </div>

          <button
            onClick={addSet}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add set
          </button>

          {exercise.prescription.notes && (
            <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-3">
              {exercise.prescription.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Block Section ────────────────────────────────────────────────────────────

const BLOCK_TYPE_LABELS: Record<string, string> = {
  STRAIGHT_SET: "Straight Set",
  SUPERSET: "Superset",
  CIRCUIT: "Circuit",
  AMRAP: "AMRAP",
  EMOM: "EMOM",
  FOR_TIME: "For Time",
  TABATA: "Tabata",
};

function BlockSection({
  block,
  instanceId,
}: {
  block: Block;
  instanceId: string;
}) {
  const [, forceUpdate] = useState(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {block.name && <h3 className="text-sm font-bold">{block.name}</h3>}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
          {BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType}
        </Badge>
        {block.rounds && (
          <span className="text-xs text-muted-foreground">{block.rounds} rounds</span>
        )}
        {block.timeCapSeconds && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Timer className="w-3 h-3" />
            {Math.floor(block.timeCapSeconds / 60)}min cap
          </span>
        )}
      </div>
      {block.notes && (
        <p className="text-xs text-muted-foreground">{block.notes}</p>
      )}
      <div className="space-y-2">
        {block.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.workoutExerciseId}
            exercise={exercise}
            instanceId={instanceId}
            onSetsUpdate={() => forceUpdate((n) => n + 1)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Completion Modal ─────────────────────────────────────────────────────────

function CompletionModal({
  open,
  onClose,
  onConfirm,
  durationSeconds,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (sessionRpe: number, notes: string) => void;
  durationSeconds: number;
  isPending: boolean;
}) {
  const [sessionRpe, setSessionRpe] = useState(7);
  const [notes, setNotes] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Session Complete
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {durationSeconds > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              Duration: <span className="font-semibold text-foreground">{formatDuration(durationSeconds)}</span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-3">How did the session feel overall?</p>
            <div className="flex gap-1.5 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  onClick={() => setSessionRpe(v)}
                  className={`w-9 h-9 rounded-xl text-sm font-bold transition-colors ${
                    sessionRpe === v
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-muted-foreground">Easy</span>
              <span className="text-[10px] text-muted-foreground">Max effort</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Notes (optional)</p>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none text-foreground placeholder:text-muted-foreground"
              rows={3}
              placeholder="How did it go? Anything to remember for next time…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(sessionRpe, notes)} disabled={isPending}>
            {isPending ? "Saving…" : "Save & Finish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WorkoutSession() {
  const { id: instanceId } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [completionOpen, setCompletionOpen] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  const { data: instance, isLoading } = useQuery<WorkoutInstance>({
    queryKey: ["workout-instance", instanceId],
    queryFn: () => apiFetch(`/workout-instances/${instanceId}`),
    enabled: !!instanceId,
    refetchOnWindowFocus: false,
  });

  const completeMutation = useMutation({
    mutationFn: ({ sessionRpe, notes }: { sessionRpe: number; notes: string }) =>
      apiFetch(`/workout-instances/${instanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED", sessionRpe, notes: notes || undefined }),
      }),
    onSuccess: () => {
      setCompletionOpen(false);
      navigate("/my-programme");
    },
  });

  const durationSeconds = instance?.startedAt
    ? Math.floor((Date.now() - new Date(instance.startedAt).getTime()) / 1000)
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-5 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Workout not found.</p>
      </div>
    );
  }

  const allExercisesHaveInstances = instance.blocks
    .flatMap((b) => b.exercises)
    .every((e) => e.exerciseInstanceId !== null);

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/40 px-5 py-4 flex items-center gap-3">
          <Link href="/my-programme">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">In progress</p>
            <h1 className="text-base font-bold truncate">Today's Workout</h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono shrink-0">
            <Timer className="w-3.5 h-3.5" />
            {instance.startedAt
              ? formatDuration(
                  Math.floor((Date.now() - new Date(instance.startedAt).getTime()) / 1000),
                )
              : "0:00"}
          </div>
        </div>

        {/* Blocks */}
        <div className="p-5 space-y-8">
          {instance.blocks.length === 0 ? (
            <div className="text-center py-16">
              <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">No exercises in this workout.</p>
            </div>
          ) : (
            instance.blocks.map((block) => (
              <BlockSection key={block.id} block={block} instanceId={instanceId!} />
            ))
          )}
        </div>
      </div>

      {/* Sticky finish bar */}
      <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border/60 p-4">
        <div className="max-w-lg mx-auto">
          <Button
            className="w-full h-12 text-base font-bold gap-2"
            onClick={() => setCompletionOpen(true)}
          >
            <Trophy className="w-5 h-5" />
            Finish Workout
          </Button>
        </div>
      </div>

      <CompletionModal
        open={completionOpen}
        onClose={() => setCompletionOpen(false)}
        onConfirm={(rpe, notes) => completeMutation.mutate({ sessionRpe: rpe, notes })}
        durationSeconds={durationSeconds}
        isPending={completeMutation.isPending}
      />
    </div>
  );
}
