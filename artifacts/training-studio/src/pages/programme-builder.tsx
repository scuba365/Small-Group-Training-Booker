import React, { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  Plus,
  ChevronDown,
  ChevronRight,
  Layers,
  Dumbbell,
  Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

const BLOCK_TYPES = [
  "STRAIGHT_SET",
  "SUPERSET",
  "CIRCUIT",
  "AMRAP",
  "EMOM",
  "FOR_TIME",
  "TABATA",
] as const;

interface Exercise {
  id: string;
  name: string;
  exerciseType: string;
}

interface WorkoutExercise {
  id: string;
  exerciseId: string;
  orderIndex: number;
  exercise: Exercise | null;
  sets?: number | null;
  repsMin?: number | null;
  repsMax?: number | null;
  loadKg?: number | null;
  loadPercent1rm?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restSeconds?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  pacePerKm?: string | null;
  notes?: string | null;
}

interface Block {
  id: string;
  name?: string | null;
  blockType: string;
  orderIndex: number;
  rounds?: number | null;
  timeCapSeconds?: number | null;
  exercises: WorkoutExercise[];
}

interface Workout {
  id: string;
  name: string;
  orderIndex: number;
  blocks: Block[];
}

interface Day {
  id: string;
  dayNumber: number;
  label?: string | null;
  orderIndex: number;
  workouts: Workout[];
}

interface Week {
  id: string;
  weekNumber: number;
  label?: string | null;
  orderIndex: number;
  days: Day[];
}

interface Phase {
  id: string;
  name: string;
  orderIndex: number;
  weeks: Week[];
}

interface Programme {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  phases: Phase[];
}

// ─── API ──────────────────────────────────────────────────────────────────────

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

// ─── Programme List Page ──────────────────────────────────────────────────────

export function ProgrammeList() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: programmes = [], isLoading } = useQuery<Programme[]>({
    queryKey: ["programmes"],
    queryFn: () => apiFetch("/programmes"),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<Programme>("/programmes", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programmes"] });
      setNewName("");
      setCreating(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/programmes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["programmes"] }),
  });

  const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-yellow-500/20 text-yellow-400",
    ACTIVE: "bg-green-500/20 text-green-400",
    ARCHIVED: "bg-muted text-muted-foreground",
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Programmes</h1>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Programme
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : programmes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No programmes yet. Create your first programme.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programmes
            .filter((p) => p.status !== "ARCHIVED")
            .map((p) => (
              <Card key={p.id} className="flex items-center justify-between px-4 py-3 group">
                <div className="flex items-center gap-3">
                  <Link href={`/programmes/${p.id}`}>
                    <span className="font-medium hover:underline cursor-pointer">{p.name}</span>
                  </Link>
                  <Badge
                    variant="outline"
                    className={`text-xs border-0 ${STATUS_COLORS[p.status] ?? ""}`}
                  >
                    {p.status}
                  </Badge>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/programmes/${p.id}`}>
                    <Button variant="ghost" size="sm">
                      Open
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => archiveMutation.mutate(p.id)}
                    disabled={archiveMutation.isPending}
                  >
                    Archive
                  </Button>
                </div>
              </Card>
            ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={creating} onOpenChange={(o) => !o && setCreating(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Programme</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) createMutation.mutate(newName.trim());
            }}
            className="space-y-4"
          >
            <Input
              autoFocus
              placeholder="Programme name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !newName.trim()}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Programme Builder (detail view) ─────────────────────────────────────────

export default function ProgrammeBuilder() {
  const [, params] = useRoute("/programmes/:id");
  const id = params?.id;
  const qc = useQueryClient();

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  // Dialog state
  const [phaseDialog, setPhaseDialog] = useState(false);
  const [phaseName, setPhaseName] = useState("");
  const [weekDialog, setWeekDialog] = useState<{ phaseId: string } | null>(null);
  const [dayDialog, setDayDialog] = useState<{ weekId: string; weekNumber: number } | null>(null);
  const [workoutDialog, setWorkoutDialog] = useState<{ dayId: string } | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [blockDialog, setBlockDialog] = useState<{ workoutId: string } | null>(null);
  const [blockType, setBlockType] = useState<string>("STRAIGHT_SET");

  // Exercise picker state
  const [exPickerBlock, setExPickerBlock] = useState<string | null>(null);
  const [exSearch, setExSearch] = useState("");
  const [prescription, setPrescription] = useState<Record<string, string | number>>({});

  const { data: programme, isLoading } = useQuery<Programme>({
    queryKey: ["programme", id],
    queryFn: () => apiFetch(`/programmes/${id}`),
    enabled: !!id,
  });

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["exercises", exSearch],
    queryFn: () => apiFetch(`/exercises?search=${encodeURIComponent(exSearch)}`),
    enabled: !!exPickerBlock,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["programme", id] });
  }

  // Mutations
  const addPhase = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/programmes/${id}/phases`, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { invalidate(); setPhaseDialog(false); setPhaseName(""); },
  });

  const addWeek = useMutation({
    mutationFn: ({ phaseId, weekNumber }: { phaseId: string; weekNumber: number }) =>
      apiFetch(`/phases/${phaseId}/weeks`, { method: "POST", body: JSON.stringify({ weekNumber }) }),
    onSuccess: () => { invalidate(); setWeekDialog(null); },
  });

  const addDay = useMutation({
    mutationFn: ({ weekId, dayNumber, label }: { weekId: string; dayNumber: number; label: string }) =>
      apiFetch(`/weeks/${weekId}/days`, { method: "POST", body: JSON.stringify({ dayNumber, label }) }),
    onSuccess: () => { invalidate(); setDayDialog(null); },
  });

  const addWorkout = useMutation({
    mutationFn: ({ dayId, name }: { dayId: string; name: string }) =>
      apiFetch(`/days/${dayId}/workouts`, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { invalidate(); setWorkoutDialog(null); setWorkoutName(""); },
  });

  const addBlock = useMutation({
    mutationFn: ({ workoutId, blockType: bt }: { workoutId: string; blockType: string }) =>
      apiFetch(`/workouts/${workoutId}/blocks`, { method: "POST", body: JSON.stringify({ blockType: bt }) }),
    onSuccess: () => { invalidate(); setBlockDialog(null); setBlockType("STRAIGHT_SET"); },
  });

  const addExercise = useMutation({
    mutationFn: ({ blockId, exerciseId }: { blockId: string; exerciseId: string }) =>
      apiFetch(`/blocks/${blockId}/exercises`, {
        method: "POST",
        body: JSON.stringify({
          exerciseId,
          ...Object.fromEntries(
            Object.entries(prescription).map(([k, v]) => [
              k,
              typeof v === "string" ? (v === "" ? undefined : isNaN(Number(v)) ? v : Number(v)) : v,
            ])
          ),
        }),
      }),
    onSuccess: () => {
      invalidate();
      setExPickerBlock(null);
      setPrescription({});
      setExSearch("");
    },
  });

  const removeExercise = useMutation({
    mutationFn: (weId: string) =>
      apiFetch(`/workout-exercises/${weId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  function togglePhase(id: string) {
    setExpandedPhases((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleWeek(id: string) {
    setExpandedWeeks((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleDay(id: string) {
    setExpandedDays((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (!id) return <div className="p-6">Invalid programme</div>;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (!programme) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Programme not found.</p>
        <Link href="/programmes">
          <Button variant="link">Back to Programmes</Button>
        </Link>
      </div>
    );
  }

  function prescriptionSummary(we: WorkoutExercise) {
    const parts: string[] = [];
    if (we.sets) parts.push(`${we.sets} sets`);
    if (we.repsMin != null && we.repsMax != null) {
      parts.push(we.repsMin === we.repsMax ? `${we.repsMin} reps` : `${we.repsMin}–${we.repsMax} reps`);
    }
    if (we.loadKg) parts.push(`${we.loadKg}kg`);
    if (we.loadPercent1rm) parts.push(`${we.loadPercent1rm}% 1RM`);
    if (we.rpe) parts.push(`RPE ${we.rpe}`);
    if (we.tempo) parts.push(we.tempo);
    if (we.restSeconds) parts.push(`${we.restSeconds}s rest`);
    if (we.durationSeconds) parts.push(`${we.durationSeconds}s`);
    if (we.distanceMeters) parts.push(`${we.distanceMeters}m`);
    if (we.pacePerKm) parts.push(`@${we.pacePerKm}/km`);
    return parts.join(" · ") || "No prescription";
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/programmes">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{programme.name}</h1>
          <Badge variant="outline" className="text-xs border-0 mt-1">
            {programme.status}
          </Badge>
        </div>
        <div className="ml-auto">
          <Button onClick={() => setPhaseDialog(true)}>
            <Plus className="w-4 h-4 mr-1" />
            Add Phase
          </Button>
        </div>
      </div>

      {/* Phase tree */}
      {programme.phases.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No phases yet. Click "Add Phase" to begin building.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programme.phases.map((phase) => (
            <Card key={phase.id}>
              <CardHeader
                className="cursor-pointer py-3"
                onClick={() => togglePhase(phase.id)}
              >
                <div className="flex items-center gap-2">
                  {expandedPhases.has(phase.id) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <CardTitle className="text-base">{phase.name}</CardTitle>
                  <span className="text-xs text-muted-foreground ml-1">
                    {phase.weeks.length} week{phase.weeks.length !== 1 ? "s" : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWeekDialog({ phaseId: phase.id });
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Week
                  </Button>
                </div>
              </CardHeader>

              {expandedPhases.has(phase.id) && (
                <CardContent className="pt-0 space-y-2">
                  {phase.weeks.map((week) => (
                    <div key={week.id} className="border rounded-md">
                      <div
                        className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleWeek(week.id)}
                      >
                        {expandedWeeks.has(week.id) ? (
                          <ChevronDown className="w-3 h-3 mr-2" />
                        ) : (
                          <ChevronRight className="w-3 h-3 mr-2" />
                        )}
                        <span className="font-medium text-sm">
                          Week {week.weekNumber}
                          {week.label ? ` — ${week.label}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {week.days.length} day{week.days.length !== 1 ? "s" : ""}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-6 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDayDialog({ weekId: week.id, weekNumber: week.weekNumber });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Day
                        </Button>
                      </div>

                      {expandedWeeks.has(week.id) && (
                        <div className="px-4 pb-3 space-y-2">
                          {week.days.map((day) => (
                            <div key={day.id} className="border rounded bg-muted/20">
                              <div
                                className="flex items-center px-3 py-2 cursor-pointer"
                                onClick={() => toggleDay(day.id)}
                              >
                                {expandedDays.has(day.id) ? (
                                  <ChevronDown className="w-3 h-3 mr-2" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 mr-2" />
                                )}
                                <span className="text-sm font-medium">
                                  Day {day.dayNumber}
                                  {day.label ? ` — ${day.label}` : ""}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {day.workouts.length} workout{day.workouts.length !== 1 ? "s" : ""}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="ml-auto h-6 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setWorkoutDialog({ dayId: day.id });
                                  }}
                                >
                                  <Plus className="w-3 h-3 mr-1" />
                                  Workout
                                </Button>
                              </div>

                              {expandedDays.has(day.id) && (
                                <div className="px-4 pb-3 space-y-2">
                                  {day.workouts.map((workout) => (
                                    <div key={workout.id} className="border rounded bg-background p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="font-medium text-sm">{workout.name}</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 text-xs"
                                          onClick={() => setBlockDialog({ workoutId: workout.id })}
                                        >
                                          <Plus className="w-3 h-3 mr-1" />
                                          Block
                                        </Button>
                                      </div>

                                      {/* Blocks */}
                                      <div className="space-y-2">
                                        {workout.blocks.map((block, bi) => (
                                          <div key={block.id} className="border rounded p-2 bg-muted/10">
                                            <div className="flex items-center gap-2 mb-2">
                                              <span className="text-xs font-semibold uppercase text-muted-foreground">
                                                {String.fromCharCode(65 + bi)}.{" "}
                                                {block.blockType.replace(/_/g, " ")}
                                              </span>
                                              {block.rounds && (
                                                <span className="text-xs text-muted-foreground">
                                                  {block.rounds} rounds
                                                </span>
                                              )}
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="ml-auto h-5 text-xs"
                                                onClick={() => {
                                                  setPrescription({});
                                                  setExSearch("");
                                                  setExPickerBlock(block.id);
                                                }}
                                              >
                                                <Dumbbell className="w-3 h-3 mr-1" />
                                                Add Exercise
                                              </Button>
                                            </div>

                                            {/* Exercises */}
                                            <div className="space-y-1">
                                              {block.exercises.map((we) => (
                                                <div
                                                  key={we.id}
                                                  className="flex items-start justify-between gap-2 text-xs"
                                                >
                                                  <div>
                                                    <span className="font-medium">
                                                      {we.exercise?.name ?? "Unknown"}
                                                    </span>
                                                    <span className="text-muted-foreground ml-2">
                                                      {prescriptionSummary(we)}
                                                    </span>
                                                  </div>
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                                                    onClick={() => removeExercise.mutate(we.id)}
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </Button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── Dialogs ── */}

      {/* Add Phase */}
      <Dialog open={phaseDialog} onOpenChange={(o) => !o && setPhaseDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (phaseName.trim()) addPhase.mutate(phaseName.trim()); }} className="space-y-4">
            <Input autoFocus placeholder="Phase name (e.g. Accumulation)" value={phaseName} onChange={(e) => setPhaseName(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPhaseDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={addPhase.isPending || !phaseName.trim()}>Add Phase</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Week */}
      <Dialog open={!!weekDialog} onOpenChange={(o) => !o && setWeekDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Week</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (weekDialog) addWeek.mutate({ phaseId: weekDialog.phaseId, weekNumber: (programme.phases.find(p => p.id === weekDialog.phaseId)?.weeks.length ?? 0) + 1 }); }} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A new week will be added to this phase.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWeekDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={addWeek.isPending}>Add Week</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Day */}
      <Dialog open={!!dayDialog} onOpenChange={(o) => !o && setDayDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Day</DialogTitle></DialogHeader>
          {dayDialog && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const week = programme.phases.flatMap(p => p.weeks).find(w => w.id === dayDialog.weekId);
              const nextDay = (week?.days.length ?? 0) + 1;
              addDay.mutate({ weekId: dayDialog.weekId, dayNumber: nextDay, label: `Day ${nextDay}` });
            }} className="space-y-4">
              <p className="text-sm text-muted-foreground">A new training day will be added to Week {dayDialog.weekNumber}.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDayDialog(null)}>Cancel</Button>
                <Button type="submit" disabled={addDay.isPending}>Add Day</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Workout */}
      <Dialog open={!!workoutDialog} onOpenChange={(o) => !o && setWorkoutDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Workout</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (workoutDialog && workoutName.trim()) addWorkout.mutate({ dayId: workoutDialog.dayId, name: workoutName.trim() }); }} className="space-y-4">
            <Input autoFocus placeholder="Workout name (e.g. Lower Body A)" value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setWorkoutDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={addWorkout.isPending || !workoutName.trim()}>Add Workout</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Block */}
      <Dialog open={!!blockDialog} onOpenChange={(o) => !o && setBlockDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Block</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (blockDialog) addBlock.mutate({ workoutId: blockDialog.workoutId, blockType }); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Block Type</label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BLOCK_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBlockDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={addBlock.isPending}>Add Block</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Exercise Picker */}
      <Dialog open={!!exPickerBlock} onOpenChange={(o) => !o && setExPickerBlock(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Exercise to Block</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Search exercises..." value={exSearch} onChange={(e) => setExSearch(e.target.value)} autoFocus />
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded p-2">
              {exercises.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No exercises found</p>
              ) : exercises.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded text-sm hover:bg-muted transition-colors"
                  onClick={() => {
                    if (exPickerBlock) addExercise.mutate({ blockId: exPickerBlock, exerciseId: ex.id });
                  }}
                >
                  <span className="font-medium">{ex.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{ex.exerciseType}</span>
                </button>
              ))}
            </div>

            {/* Quick prescription */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "sets", label: "Sets", placeholder: "4" },
                { key: "repsMin", label: "Reps Min", placeholder: "6" },
                { key: "repsMax", label: "Reps Max", placeholder: "8" },
                { key: "loadPercent1rm", label: "% 1RM", placeholder: "75" },
                { key: "rpe", label: "RPE", placeholder: "8" },
                { key: "restSeconds", label: "Rest (s)", placeholder: "180" },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
                  <Input
                    className="h-7 text-xs"
                    placeholder={placeholder}
                    value={(prescription[key] as string) ?? ""}
                    onChange={(e) => setPrescription((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-0.5">Tempo</label>
              <Input className="h-7 text-xs" placeholder="3-1-1-0" value={(prescription.tempo as string) ?? ""} onChange={(e) => setPrescription((p) => ({ ...p, tempo: e.target.value }))} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
