import React from "react";
import { Link, useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Dumbbell, CheckCircle2, Clock3, Circle, User } from "lucide-react";

interface SetLog {
  id: string;
  setNumber: number;
  reps?: number | null;
  loadKg?: number | null;
  rpe?: number | null;
  rir?: number | null;
  distanceMeters?: number | null;
  timeSeconds?: number | null;
  calories?: number | null;
  completed: boolean;
}

interface ExerciseWithSets {
  exerciseInstance: { id: string; exerciseId: string; orderIndex: number };
  sets: SetLog[];
}

interface CoachWorkoutDetail {
  instance: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    durationSeconds: number | null;
    sessionRpe: number | null;
    notes: string | null;
  };
  member: { id: string; name: string };
  workout: { id: string; name: string };
  exercises: ExerciseWithSets[];
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const STATUS_CONFIG = {
  COMPLETED: { label: "Done", icon: CheckCircle2, className: "bg-green-500/20 text-green-400 border-green-500/30" },
  IN_PROGRESS: { label: "In progress", icon: Clock3, className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  NOT_STARTED: { label: "Not started", icon: Circle, className: "bg-muted text-muted-foreground" },
};

function SetTable({ sets }: { sets: SetLog[] }) {
  if (sets.length === 0) return <p className="text-xs text-muted-foreground italic">No sets logged</p>;

  return (
    <div className="space-y-1 mt-2">
      {sets.map((s) => {
        const parts: string[] = [];
        if (s.reps != null) parts.push(`${s.reps} reps`);
        if (s.loadKg != null) parts.push(`${s.loadKg}kg`);
        if (s.distanceMeters != null) parts.push(`${s.distanceMeters}m`);
        if (s.timeSeconds != null) parts.push(`${s.timeSeconds}s`);
        if (s.calories != null) parts.push(`${s.calories}cal`);
        if (s.rpe != null) parts.push(`RPE ${s.rpe}`);
        if (s.rir != null) parts.push(`RIR ${s.rir}`);

        return (
          <div key={s.id} className="flex items-center gap-2 text-xs">
            <span className="w-10 text-muted-foreground shrink-0">Set {s.setNumber}</span>
            <span className={s.completed ? "text-foreground" : "text-muted-foreground"}>
              {parts.length > 0 ? parts.join(" · ") : "—"}
            </span>
            {!s.completed && <span className="text-muted-foreground/50 text-[10px]">incomplete</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function CoachWorkoutDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery<CoachWorkoutDetail>({
    queryKey: ["coach-workout-detail", id],
    queryFn: () => apiFetch(`/coach/workout-instances/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-5 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground p-5 max-w-2xl mx-auto">
        <Link href="/coach/monitoring">
          <Button variant="ghost" size="icon" className="mb-4">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <p className="text-muted-foreground text-sm">Workout not found.</p>
      </div>
    );
  }

  const { instance, member, workout, exercises } = data;
  const cfg = STATUS_CONFIG[instance.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NOT_STARTED;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/40 px-5 py-4 flex items-center gap-3">
          <Link href="/coach/monitoring">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Coach View
            </p>
            <h1 className="text-lg font-bold truncate">{workout.name}</h1>
          </div>
          <Badge variant="outline" className={`text-[10px] border shrink-0 ${cfg.className}`}>
            <Icon className="w-2.5 h-2.5 mr-1" />
            {cfg.label}
          </Badge>
        </div>

        <div className="p-5 space-y-5">
          {/* Member info */}
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{member.name}</p>
              {instance.sessionRpe && (
                <p className="text-sm text-muted-foreground">Session RPE: {instance.sessionRpe}</p>
              )}
              {instance.durationSeconds && (
                <p className="text-xs text-muted-foreground">{formatDuration(instance.durationSeconds)}</p>
              )}
            </div>
          </div>

          {/* Session notes */}
          {instance.notes && (
            <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wider">Session notes</p>
              <p>{instance.notes}</p>
            </div>
          )}

          {/* Exercises */}
          {exercises.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No exercise data recorded.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                Exercise data
              </h2>
              {exercises.map((row, idx) => (
                <div key={row.exerciseInstance.id} className="rounded-xl border border-border/60 bg-card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                    <p className="font-semibold text-sm">Exercise {idx + 1}</p>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {row.sets.filter((s) => s.completed).length}/{row.sets.length} sets
                    </span>
                  </div>
                  <SetTable sets={row.sets} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
