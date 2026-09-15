import React, { useState, useCallback } from "react";
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
  Copy,
  Users,
  Calendar,
  Check,
  X,
  Pencil,
  LayoutTemplate,
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
type BlockType = (typeof BLOCK_TYPES)[number];

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

interface WorkoutTemplate {
  id: string;
  name: string;
  description?: string | null;
  blocks: Block[];
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
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

// ─── Prescription helpers ─────────────────────────────────────────────────────

type PrescriptionFields = Partial<{
  sets: string;
  repsMin: string;
  repsMax: string;
  loadKg: string;
  loadPercent1rm: string;
  rpe: string;
  tempo: string;
  restSeconds: string;
  durationSeconds: string;
  distanceMeters: string;
  pacePerKm: string;
  notes: string;
}>;

function weToForm(we: WorkoutExercise): PrescriptionFields {
  return {
    sets: we.sets != null ? String(we.sets) : "",
    repsMin: we.repsMin != null ? String(we.repsMin) : "",
    repsMax: we.repsMax != null ? String(we.repsMax) : "",
    loadKg: we.loadKg != null ? String(we.loadKg) : "",
    loadPercent1rm: we.loadPercent1rm != null ? String(we.loadPercent1rm) : "",
    rpe: we.rpe != null ? String(we.rpe) : "",
    tempo: we.tempo ?? "",
    restSeconds: we.restSeconds != null ? String(we.restSeconds) : "",
    durationSeconds: we.durationSeconds != null ? String(we.durationSeconds) : "",
    distanceMeters: we.distanceMeters != null ? String(we.distanceMeters) : "",
    pacePerKm: we.pacePerKm ?? "",
    notes: we.notes ?? "",
  };
}

function formToPayload(fields: PrescriptionFields) {
  const numericKeys = [
    "sets", "repsMin", "repsMax", "loadKg", "loadPercent1rm",
    "rpe", "restSeconds", "durationSeconds", "distanceMeters",
  ] as const;
  const result: Record<string, string | number | undefined> = {};
  for (const key of numericKeys) {
    const v = fields[key];
    result[key] = v && v !== "" ? Number(v) : undefined;
  }
  result.tempo = fields.tempo || undefined;
  result.pacePerKm = fields.pacePerKm || undefined;
  result.notes = fields.notes || undefined;
  return result;
}

function prescriptionSummary(we: WorkoutExercise) {
  const parts: string[] = [];
  if (we.sets) parts.push(`${we.sets}×`);
  if (we.repsMin != null && we.repsMax != null) {
    parts.push(we.repsMin === we.repsMax ? `${we.repsMin}` : `${we.repsMin}–${we.repsMax}`);
  }
  if (we.loadKg) parts.push(`${we.loadKg}kg`);
  if (we.loadPercent1rm) parts.push(`${we.loadPercent1rm}%`);
  if (we.rpe) parts.push(`RPE${we.rpe}`);
  if (we.tempo) parts.push(we.tempo);
  if (we.restSeconds) parts.push(`${we.restSeconds}s rest`);
  if (we.durationSeconds) parts.push(`${we.durationSeconds}s`);
  if (we.distanceMeters) parts.push(`${we.distanceMeters}m`);
  return parts.join(" · ") || "—";
}

// ─── Prescription Editor Panel ────────────────────────────────────────────────

interface PrescriptionEditorProps {
  exerciseName: string;
  value: PrescriptionFields;
  onChange: (v: PrescriptionFields) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
  isNew?: boolean;
}

function PrescriptionEditor({
  exerciseName,
  value,
  onChange,
  onSave,
  onCancel,
  onDelete,
  isSaving,
  isDeleting,
  isNew,
}: PrescriptionEditorProps) {
  function field(key: keyof PrescriptionFields, label: string, placeholder: string, type: "text" | "number" = "number") {
    return (
      <div key={key}>
        <label className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wide">{label}</label>
        <Input
          className="h-7 text-xs"
          type={type}
          placeholder={placeholder}
          value={value[key] ?? ""}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-3">
      <p className="text-sm font-semibold text-primary truncate">{exerciseName}</p>
      <div className="grid grid-cols-3 gap-2">
        {field("sets", "Sets", "4")}
        {field("repsMin", "Reps Min", "6")}
        {field("repsMax", "Reps Max", "8")}
        {field("loadKg", "Load (kg)", "80")}
        {field("loadPercent1rm", "% 1RM", "75")}
        {field("rpe", "RPE", "8")}
        {field("restSeconds", "Rest (s)", "180")}
        {field("durationSeconds", "Duration (s)", "60")}
        {field("distanceMeters", "Distance (m)", "400")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {field("tempo", "Tempo", "3-1-1-0", "text")}
        {field("pacePerKm", "Pace /km", "5:00", "text")}
      </div>
      <div>
        <label className="text-[10px] text-muted-foreground block mb-0.5 uppercase tracking-wide">Notes</label>
        <Input
          className="h-7 text-xs"
          placeholder="Cues, coaching notes..."
          value={value.notes ?? ""}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1">
          {onDelete && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              {isDeleting ? "Removing..." : "Remove"}
            </Button>
          )}
        </div>
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onCancel}>
            <X className="w-3 h-3 mr-1" />Cancel
          </Button>
          <Button type="button" size="sm" className="h-7 text-xs" onClick={onSave} disabled={isSaving}>
            <Check className="w-3 h-3 mr-1" />
            {isSaving ? "Saving..." : isNew ? "Add" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
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

  const copyProgrammeMutation = useMutation({
    mutationFn: (id: string) => apiFetch<Programme>(`/programmes/${id}/copy`, { method: "POST" }),
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
                    <Button variant="ghost" size="sm">Open</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyProgrammeMutation.mutate(p.id)}
                    disabled={copyProgrammeMutation.isPending}
                  >
                    <Copy className="w-3 h-3 mr-1" />Copy
                  </Button>
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

// ─── Assignment Modal ─────────────────────────────────────────────────────────

interface AssignmentModalProps {
  programmeId: string;
  programmeName: string;
  open: boolean;
  onClose: () => void;
}

interface AssignmentRow {
  assignment: {
    id: string;
    memberId: string;
    startDate?: string | null;
    notes?: string | null;
  };
  member: { id: string; name: string; email: string };
  programme: { id: string; name: string };
}

function AssignmentModal({ programmeId, programmeName, open, onClose }: AssignmentModalProps) {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["coach-members"],
    queryFn: () => apiFetch("/coach/members"),
    enabled: open,
  });

  const { data: allAssignments = [] } = useQuery<AssignmentRow[]>({
    queryKey: ["assignments"],
    queryFn: () => apiFetch("/assignments"),
    enabled: open,
  });

  const assignments = allAssignments.filter((a) => a.programme.id === programmeId);

  const assignMutation = useMutation({
    mutationFn: () =>
      apiFetch("/assignments", {
        method: "POST",
        body: JSON.stringify({
          programmeId,
          memberId,
          startDate: startDate || undefined,
          notes: notes || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      setMemberId("");
      setStartDate("");
      setNotes("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const unassignMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/assignments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignments"] }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Assign Programme
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{programmeName}</p>
        </DialogHeader>
        <div className="space-y-4">
          {/* Existing assignments */}
          {assignments.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Currently assigned</p>
              <div className="space-y-1">
                {assignments.map((a) => (
                  <div key={a.assignment.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{a.member.name}</span>
                      {a.assignment.startDate && (
                        <span className="text-xs text-muted-foreground ml-2">
                          from {new Date(a.assignment.startDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => unassignMutation.mutate(a.assignment.id)}
                      disabled={unassignMutation.isPending}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New assignment form */}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Add assignment</p>
            <div>
              <label className="text-sm font-medium mb-1 block">Member</label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Input
                placeholder="Optional notes for this assignment"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button
              className="w-full"
              onClick={() => assignMutation.mutate()}
              disabled={!memberId || assignMutation.isPending}
            >
              {assignMutation.isPending ? "Assigning..." : "Assign Programme"}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Programme Builder (detail view) ─────────────────────────────────────────

export default function ProgrammeBuilder() {
  const [, params] = useRoute("/programmes/:id");
  const id = params?.id;
  const qc = useQueryClient();

  // Expand state
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());

  // Dialog state
  const [phaseDialog, setPhaseDialog] = useState(false);
  const [phaseName, setPhaseName] = useState("");
  const [weekDialog, setWeekDialog] = useState<{ phaseId: string } | null>(null);
  const [dayDialog, setDayDialog] = useState<{ weekId: string; weekNumber: number } | null>(null);
  const [workoutDialog, setWorkoutDialog] = useState<{ dayId: string } | null>(null);
  const [workoutDialogMode, setWorkoutDialogMode] = useState<"new" | "template">("new");
  const [workoutName, setWorkoutName] = useState("");
  const [blockDialog, setBlockDialog] = useState<{ workoutId: string } | null>(null);
  const [blockType, setBlockType] = useState<string>("STRAIGHT_SET");
  const [assignOpen, setAssignOpen] = useState(false);

  // Exercise picker & prescription state
  // activeEditor: { blockId, weId (null=new), exerciseId, exerciseName, fields }
  const [activeEditor, setActiveEditor] = useState<{
    blockId: string;
    weId: string | null;
    exerciseId: string;
    exerciseName: string;
    fields: PrescriptionFields;
  } | null>(null);
  const [exSearch, setExSearch] = useState("");
  const [showExPicker, setShowExPicker] = useState(false);

  const { data: programme, isLoading } = useQuery<Programme>({
    queryKey: ["programme", id],
    queryFn: () => apiFetch(`/programmes/${id}`),
    enabled: !!id,
  });

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ["exercises", exSearch],
    queryFn: () => apiFetch(`/exercises?search=${encodeURIComponent(exSearch)}`),
    enabled: showExPicker,
  });

  const { data: templates = [] } = useQuery<WorkoutTemplate[]>({
    queryKey: ["workout-templates"],
    queryFn: () => apiFetch("/workout-templates"),
    enabled: workoutDialogMode === "template" && !!workoutDialog,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["programme", id] });
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  const addPhase = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/programmes/${id}/phases`, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { invalidate(); setPhaseDialog(false); setPhaseName(""); },
  });

  const copyPhase = useMutation({
    mutationFn: (phaseId: string) => apiFetch(`/phases/${phaseId}/copy`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const addWeek = useMutation({
    mutationFn: ({ phaseId, weekNumber }: { phaseId: string; weekNumber: number }) =>
      apiFetch(`/phases/${phaseId}/weeks`, { method: "POST", body: JSON.stringify({ weekNumber }) }),
    onSuccess: () => { invalidate(); setWeekDialog(null); },
  });

  const copyWeek = useMutation({
    mutationFn: (weekId: string) => apiFetch(`/weeks/${weekId}/copy`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const addDay = useMutation({
    mutationFn: ({ weekId, dayNumber, label }: { weekId: string; dayNumber: number; label: string }) =>
      apiFetch(`/weeks/${weekId}/days`, { method: "POST", body: JSON.stringify({ dayNumber, label }) }),
    onSuccess: () => { invalidate(); setDayDialog(null); },
  });

  const copyDay = useMutation({
    mutationFn: (dayId: string) => apiFetch(`/days/${dayId}/copy`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const addWorkout = useMutation({
    mutationFn: ({ dayId, name }: { dayId: string; name: string }) =>
      apiFetch(`/days/${dayId}/workouts`, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: () => { invalidate(); setWorkoutDialog(null); setWorkoutName(""); },
  });

  const addWorkoutFromTemplate = useMutation({
    mutationFn: ({ dayId, templateId }: { dayId: string; templateId: string }) =>
      apiFetch(`/days/${dayId}/workouts/from-template/${templateId}`, { method: "POST" }),
    onSuccess: () => { invalidate(); setWorkoutDialog(null); },
  });

  const copyWorkout = useMutation({
    mutationFn: (workoutId: string) => apiFetch(`/workouts/${workoutId}/copy`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const addBlock = useMutation({
    mutationFn: ({ workoutId, blockType: bt }: { workoutId: string; blockType: string }) =>
      apiFetch(`/workouts/${workoutId}/blocks`, { method: "POST", body: JSON.stringify({ blockType: bt }) }),
    onSuccess: () => { invalidate(); setBlockDialog(null); setBlockType("STRAIGHT_SET"); },
  });

  const copyBlock = useMutation({
    mutationFn: (blockId: string) => apiFetch(`/blocks/${blockId}/copy`, { method: "POST" }),
    onSuccess: invalidate,
  });

  const addExercise = useMutation({
    mutationFn: ({ blockId, exerciseId, fields }: { blockId: string; exerciseId: string; fields: PrescriptionFields }) =>
      apiFetch(`/blocks/${blockId}/exercises`, {
        method: "POST",
        body: JSON.stringify({ exerciseId, ...formToPayload(fields) }),
      }),
    onSuccess: () => { invalidate(); setActiveEditor(null); setShowExPicker(false); setExSearch(""); },
  });

  const updateExercise = useMutation({
    mutationFn: ({ weId, fields }: { weId: string; fields: PrescriptionFields }) =>
      apiFetch(`/workout-exercises/${weId}`, {
        method: "PUT",
        body: JSON.stringify(formToPayload(fields)),
      }),
    onSuccess: () => { invalidate(); setActiveEditor(null); },
  });

  const removeExercise = useMutation({
    mutationFn: (weId: string) => apiFetch(`/workout-exercises/${weId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setActiveEditor(null); },
  });

  // ── Toggle helpers ────────────────────────────────────────────────────────────

  const toggle = useCallback((set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    set((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  // ── Exercise picker open ──────────────────────────────────────────────────────

  function openNewExercise(blockId: string) {
    setActiveEditor(null);
    setExSearch("");
    setShowExPicker(true);
    // Store blockId for when an exercise is selected
    setActiveEditor({ blockId, weId: null, exerciseId: "", exerciseName: "", fields: {} });
  }

  function selectExerciseFromPicker(ex: Exercise) {
    if (!activeEditor) return;
    setShowExPicker(false);
    setActiveEditor({
      blockId: activeEditor.blockId,
      weId: null,
      exerciseId: ex.id,
      exerciseName: ex.name,
      fields: {},
    });
  }

  function openEditExercise(blockId: string, we: WorkoutExercise) {
    setShowExPicker(false);
    setActiveEditor({
      blockId,
      weId: we.id,
      exerciseId: we.exerciseId,
      exerciseName: we.exercise?.name ?? "Exercise",
      fields: weToForm(we),
    });
  }

  function handleSavePrescription() {
    if (!activeEditor) return;
    if (activeEditor.weId) {
      updateExercise.mutate({ weId: activeEditor.weId, fields: activeEditor.fields });
    } else {
      addExercise.mutate({ blockId: activeEditor.blockId, exerciseId: activeEditor.exerciseId, fields: activeEditor.fields });
    }
  }

  // ── Breadcrumb context ────────────────────────────────────────────────────────

  // activePhaseId / activeWeekId / activeDayId — derived from hover / expand state
  // For now, we show a persistent breadcrumb of "Programme" in the header

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

  const STATUS_COLORS: Record<string, string> = {
    DRAFT: "bg-yellow-500/20 text-yellow-400",
    ACTIVE: "bg-green-500/20 text-green-400",
    ARCHIVED: "bg-muted text-muted-foreground",
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* ── Header with breadcrumb ── */}
      <div className="sticky top-[68px] z-10 bg-background/95 backdrop-blur border-b border-border/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/programmes">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </Link>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
            <span className="text-muted-foreground/60 hidden sm:inline">Programmes</span>
            <ChevronRight className="w-3 h-3 shrink-0 hidden sm:inline" />
            <span className="font-semibold text-foreground truncate">{programme.name}</span>
            <Badge
              variant="outline"
              className={`text-xs border-0 ml-1 ${STATUS_COLORS[programme.status] ?? ""}`}
            >
              {programme.status}
            </Badge>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Assign
            </Button>
            <Button size="sm" onClick={() => setPhaseDialog(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add Phase
            </Button>
          </div>
        </div>
      </div>

      <div className="px-6 pt-5 space-y-3">
        {programme.phases.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No phases yet. Click "Add Phase" to begin building.</p>
          </div>
        ) : (
          programme.phases.map((phase) => (
            <Card key={phase.id}>
              {/* Phase header */}
              <CardHeader
                className="cursor-pointer py-3"
                onClick={() => toggle(setExpandedPhases, phase.id)}
              >
                <div className="flex items-center gap-2">
                  {expandedPhases.has(phase.id) ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  <CardTitle className="text-base">{phase.name}</CardTitle>
                  <span className="text-xs text-muted-foreground ml-1">
                    {phase.weeks.length} week{phase.weeks.length !== 1 ? "s" : ""}
                  </span>
                  <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => copyPhase.mutate(phase.id)}
                      disabled={copyPhase.isPending}
                    >
                      <Copy className="w-3 h-3 mr-1" />Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setWeekDialog({ phaseId: phase.id })}
                    >
                      <Plus className="w-3 h-3 mr-1" />Week
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedPhases.has(phase.id) && (
                <CardContent className="pt-0 space-y-2">
                  {phase.weeks.map((week) => (
                    <div key={week.id} className="border rounded-md">
                      {/* Week header */}
                      <div
                        className="flex items-center px-3 py-2 cursor-pointer hover:bg-muted/50"
                        onClick={() => toggle(setExpandedWeeks, week.id)}
                      >
                        {expandedWeeks.has(week.id) ? (
                          <ChevronDown className="w-3 h-3 mr-2 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 mr-2 shrink-0" />
                        )}
                        <span className="font-medium text-sm">
                          Week {week.weekNumber}{week.label ? ` — ${week.label}` : ""}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {week.days.length} day{week.days.length !== 1 ? "s" : ""}
                        </span>
                        <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => copyWeek.mutate(week.id)}
                            disabled={copyWeek.isPending}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => setDayDialog({ weekId: week.id, weekNumber: week.weekNumber })}
                          >
                            <Plus className="w-3 h-3 mr-1" />Day
                          </Button>
                        </div>
                      </div>

                      {expandedWeeks.has(week.id) && (
                        <div className="px-4 pb-3 space-y-2">
                          {week.days.map((day) => (
                            <div key={day.id} className="border rounded bg-muted/20">
                              {/* Day header */}
                              <div
                                className="flex items-center px-3 py-2 cursor-pointer"
                                onClick={() => toggle(setExpandedDays, day.id)}
                              >
                                {expandedDays.has(day.id) ? (
                                  <ChevronDown className="w-3 h-3 mr-2 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 mr-2 shrink-0" />
                                )}
                                <span className="text-sm font-medium">
                                  Day {day.dayNumber}{day.label ? ` — ${day.label}` : ""}
                                </span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {day.workouts.length} workout{day.workouts.length !== 1 ? "s" : ""}
                                </span>
                                <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => copyDay.mutate(day.id)}
                                    disabled={copyDay.isPending}
                                  >
                                    <Copy className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => {
                                      setWorkoutDialogMode("new");
                                      setWorkoutDialog({ dayId: day.id });
                                    }}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />Workout
                                  </Button>
                                </div>
                              </div>

                              {expandedDays.has(day.id) && (
                                <div className="px-4 pb-3 space-y-2">
                                  {day.workouts.map((workout) => (
                                    <div key={workout.id} className="border rounded bg-background p-3">
                                      {/* Workout header */}
                                      <div className="flex items-center justify-between mb-2 gap-2">
                                        <div
                                          className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                                          onClick={() => toggle(setExpandedWorkouts, workout.id)}
                                        >
                                          {expandedWorkouts.has(workout.id) ? (
                                            <ChevronDown className="w-3 h-3 shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3 h-3 shrink-0" />
                                          )}
                                          <span className="font-medium text-sm truncate">{workout.name}</span>
                                          <span className="text-xs text-muted-foreground shrink-0">
                                            {workout.blocks.length} block{workout.blocks.length !== 1 ? "s" : ""}
                                          </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => copyWorkout.mutate(workout.id)}
                                            disabled={copyWorkout.isPending}
                                          >
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => setBlockDialog({ workoutId: workout.id })}
                                          >
                                            <Plus className="w-3 h-3 mr-1" />Block
                                          </Button>
                                        </div>
                                      </div>

                                      {expandedWorkouts.has(workout.id) && (
                                        <div className="space-y-2 mt-1">
                                          {workout.blocks.map((block, bi) => (
                                            <div key={block.id} className="border rounded p-2 bg-muted/10">
                                              {/* Block header */}
                                              <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-semibold uppercase text-muted-foreground">
                                                  {String.fromCharCode(65 + bi)}. {block.blockType.replace(/_/g, " ")}
                                                </span>
                                                {block.rounds && (
                                                  <span className="text-xs text-muted-foreground">
                                                    {block.rounds}×
                                                  </span>
                                                )}
                                                <div className="ml-auto flex gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 text-xs"
                                                    onClick={() => copyBlock.mutate(block.id)}
                                                    disabled={copyBlock.isPending}
                                                  >
                                                    <Copy className="w-3 h-3" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-5 text-xs"
                                                    onClick={() => openNewExercise(block.id)}
                                                  >
                                                    <Dumbbell className="w-3 h-3 mr-1" />Add
                                                  </Button>
                                                </div>
                                              </div>

                                              {/* Exercises */}
                                              <div className="space-y-1.5">
                                                {block.exercises.map((we) => {
                                                  const isEditing =
                                                    activeEditor?.weId === we.id ||
                                                    (activeEditor?.weId === null &&
                                                      activeEditor?.blockId === block.id &&
                                                      activeEditor?.exerciseId === we.exerciseId &&
                                                      !showExPicker);
                                                  const isThisEditing = activeEditor?.weId === we.id;

                                                  return (
                                                    <div key={we.id}>
                                                      {isThisEditing ? (
                                                        <PrescriptionEditor
                                                          exerciseName={activeEditor.exerciseName}
                                                          value={activeEditor.fields}
                                                          onChange={(f) =>
                                                            setActiveEditor((prev) =>
                                                              prev ? { ...prev, fields: f } : null
                                                            )
                                                          }
                                                          onSave={handleSavePrescription}
                                                          onCancel={() => setActiveEditor(null)}
                                                          onDelete={() => removeExercise.mutate(we.id)}
                                                          isSaving={updateExercise.isPending}
                                                          isDeleting={removeExercise.isPending}
                                                        />
                                                      ) : (
                                                        <button
                                                          type="button"
                                                          className="w-full flex items-start justify-between gap-2 text-xs rounded px-2 py-1.5 hover:bg-muted/50 transition-colors text-left group/ex"
                                                          onClick={() => openEditExercise(block.id, we)}
                                                        >
                                                          <div className="min-w-0">
                                                            <span className="font-medium">
                                                              {we.exercise?.name ?? "Unknown"}
                                                            </span>
                                                            <span className="text-muted-foreground ml-2">
                                                              {prescriptionSummary(we)}
                                                            </span>
                                                          </div>
                                                          <Pencil className="w-3 h-3 shrink-0 text-muted-foreground opacity-0 group-hover/ex:opacity-100 mt-0.5" />
                                                        </button>
                                                      )}
                                                    </div>
                                                  );
                                                })}

                                                {/* Inline new exercise — picker or editor */}
                                                {activeEditor?.blockId === block.id && activeEditor?.weId === null && (
                                                  <div>
                                                    {showExPicker ? (
                                                      <div className="border rounded-lg p-2 bg-primary/5 border-primary/40 space-y-2">
                                                        <Input
                                                          autoFocus
                                                          className="h-7 text-xs"
                                                          placeholder="Search exercises..."
                                                          value={exSearch}
                                                          onChange={(e) => setExSearch(e.target.value)}
                                                        />
                                                        <div className="max-h-40 overflow-y-auto space-y-0.5">
                                                          {exercises.length === 0 ? (
                                                            <p className="text-xs text-muted-foreground text-center py-3">
                                                              {exSearch ? "No exercises found" : "Type to search"}
                                                            </p>
                                                          ) : (
                                                            exercises.map((ex) => (
                                                              <button
                                                                key={ex.id}
                                                                type="button"
                                                                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors"
                                                                onClick={() => selectExerciseFromPicker(ex)}
                                                              >
                                                                <span className="font-medium">{ex.name}</span>
                                                                <span className="text-muted-foreground ml-2">{ex.exerciseType}</span>
                                                              </button>
                                                            ))
                                                          )}
                                                        </div>
                                                        <Button
                                                          type="button"
                                                          variant="ghost"
                                                          size="sm"
                                                          className="h-6 text-xs w-full"
                                                          onClick={() => { setActiveEditor(null); setShowExPicker(false); }}
                                                        >
                                                          Cancel
                                                        </Button>
                                                      </div>
                                                    ) : activeEditor.exerciseId ? (
                                                      <PrescriptionEditor
                                                        exerciseName={activeEditor.exerciseName}
                                                        value={activeEditor.fields}
                                                        onChange={(f) =>
                                                          setActiveEditor((prev) =>
                                                            prev ? { ...prev, fields: f } : null
                                                          )
                                                        }
                                                        onSave={handleSavePrescription}
                                                        onCancel={() => setActiveEditor(null)}
                                                        isSaving={addExercise.isPending}
                                                        isNew
                                                      />
                                                    ) : null}
                                                  </div>
                                                )}
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
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* ── Dialogs ── */}

      {/* Add Phase */}
      <Dialog open={phaseDialog} onOpenChange={(o) => !o && setPhaseDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (phaseName.trim()) addPhase.mutate(phaseName.trim()); }}
            className="space-y-4"
          >
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (weekDialog) {
                const weekNumber = (programme.phases.find(p => p.id === weekDialog.phaseId)?.weeks.length ?? 0) + 1;
                addWeek.mutate({ phaseId: weekDialog.phaseId, weekNumber });
              }
            }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">A new week will be added to this phase.</p>
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const week = programme.phases.flatMap(p => p.weeks).find(w => w.id === dayDialog.weekId);
                const nextDay = (week?.days.length ?? 0) + 1;
                addDay.mutate({ weekId: dayDialog.weekId, dayNumber: nextDay, label: `Day ${nextDay}` });
              }}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">A new training day will be added to Week {dayDialog.weekNumber}.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDayDialog(null)}>Cancel</Button>
                <Button type="submit" disabled={addDay.isPending}>Add Day</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Workout (new or from template) */}
      <Dialog open={!!workoutDialog} onOpenChange={(o) => !o && setWorkoutDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Workout</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Mode tabs */}
            <div className="flex rounded-lg border overflow-hidden text-sm">
              <button
                type="button"
                className={`flex-1 py-2 font-medium transition-colors ${workoutDialogMode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                onClick={() => setWorkoutDialogMode("new")}
              >
                New Workout
              </button>
              <button
                type="button"
                className={`flex-1 py-2 font-medium transition-colors flex items-center justify-center gap-1.5 ${workoutDialogMode === "template" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                onClick={() => setWorkoutDialogMode("template")}
              >
                <LayoutTemplate className="w-3.5 h-3.5" />
                From Template
              </button>
            </div>

            {workoutDialogMode === "new" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (workoutDialog && workoutName.trim())
                    addWorkout.mutate({ dayId: workoutDialog.dayId, name: workoutName.trim() });
                }}
                className="space-y-4"
              >
                <Input
                  autoFocus
                  placeholder="Workout name (e.g. Lower Body A)"
                  value={workoutName}
                  onChange={(e) => setWorkoutName(e.target.value)}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setWorkoutDialog(null)}>Cancel</Button>
                  <Button type="submit" disabled={addWorkout.isPending || !workoutName.trim()}>
                    {addWorkout.isPending ? "Adding..." : "Add Workout"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-2">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No templates saved yet.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-3 py-2.5 rounded-md border hover:bg-muted transition-colors"
                        onClick={() => {
                          if (workoutDialog)
                            addWorkoutFromTemplate.mutate({ dayId: workoutDialog.dayId, templateId: t.id });
                        }}
                        disabled={addWorkoutFromTemplate.isPending}
                      >
                        <p className="font-medium text-sm">{t.name}</p>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.blocks.length} block{t.blocks.length !== 1 ? "s" : ""} ·{" "}
                          {t.blocks.reduce((s, b) => s + b.exercises.length, 0)} exercises
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setWorkoutDialog(null)}>Cancel</Button>
                </DialogFooter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Block */}
      <Dialog open={!!blockDialog} onOpenChange={(o) => !o && setBlockDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Block</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (blockDialog) addBlock.mutate({ workoutId: blockDialog.workoutId, blockType }); }}
            className="space-y-4"
          >
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

      {/* Assignment Modal */}
      {id && (
        <AssignmentModal
          programmeId={id}
          programmeName={programme.name}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
