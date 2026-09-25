import React, { useState } from "react";
import { Link } from "wouter";
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
import { MultiSelect } from "@/components/multi-select";
import { TiptapEditor } from "@/components/tiptap-editor";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { importExerciseLibrary } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth-context";
import { Dumbbell, Plus, Search, Pencil, Archive, ChevronLeft, ExternalLink, Download } from "lucide-react";

const EXERCISE_TYPES = ["STRENGTH", "CARDIO", "CONDITIONING", "HYROX"] as const;
type ExerciseType = (typeof EXERCISE_TYPES)[number];

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Quads", "Hamstrings", "Glutes", "Calves", "Core", "Full Body", "Other",
] as const;

const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Kettlebell", "Cable", "Machine",
  "Bench", "Rack", "SkiErg", "Bike", "Sled",
  "Wall Ball", "Sandbag", "Bodyweight", "Other",
] as const;

// Fields visible by exercise type
const TYPE_FIELDS: Record<ExerciseType, { showLoad: boolean; showCardio: boolean }> = {
  STRENGTH:     { showLoad: true,  showCardio: false },
  CONDITIONING: { showLoad: false, showCardio: true  },
  CARDIO:       { showLoad: false, showCardio: true  },
  HYROX:        { showLoad: true,  showCardio: true  },
};

interface Exercise {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  exerciseType: string;
  primaryMuscleGroups?: string[] | null;
  equipment?: string[] | null;
  videoUrl?: string | null;
  organisationId?: string | null;
  isArchived: boolean;
}

interface ExerciseFormData {
  name: string;
  description: string;
  instructions: string;
  exerciseType: ExerciseType;
  primaryMuscleGroups: string[];
  equipment: string[];
  videoUrl: string;
}

const TYPE_COLORS: Record<string, string> = {
  STRENGTH:     "bg-blue-500/20 text-blue-400",
  CARDIO:       "bg-green-500/20 text-green-400",
  CONDITIONING: "bg-orange-500/20 text-orange-400",
  HYROX:        "bg-purple-500/20 text-purple-400",
};

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

const EMPTY_FORM: ExerciseFormData = {
  name: "",
  description: "",
  instructions: "",
  exerciseType: "STRENGTH",
  primaryMuscleGroups: [],
  equipment: [],
  videoUrl: "",
};

export default function ExerciseLibrary() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canImport = user?.role === "OWNER";

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState<ExerciseFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (typeFilter !== "ALL") params.set("exerciseType", typeFilter);

  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ["exercises", search, typeFilter],
    queryFn: () => apiFetch(`/exercises?${params}`),
  });

  const createMutation = useMutation({
    mutationFn: (data: ExerciseFormData) =>
      apiFetch<Exercise>("/exercises", {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
          description: data.description || undefined,
          instructions: data.instructions || undefined,
          exerciseType: data.exerciseType,
          primaryMuscleGroups: data.primaryMuscleGroups.length ? data.primaryMuscleGroups : undefined,
          equipment: data.equipment.length ? data.equipment : undefined,
          videoUrl: data.videoUrl || undefined,
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); closeDialog(); },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExerciseFormData> }) =>
      apiFetch<Exercise>(`/exercises/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: data.name,
          description: data.description || undefined,
          instructions: data.instructions || undefined,
          exerciseType: data.exerciseType,
          primaryMuscleGroups: data.primaryMuscleGroups?.length ? data.primaryMuscleGroups : undefined,
          equipment: data.equipment?.length ? data.equipment : undefined,
          videoUrl: data.videoUrl || undefined,
        }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["exercises"] }); closeDialog(); },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/exercises/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });

  const importMutation = useMutation({
    mutationFn: () => importExerciseLibrary({ credentials: "include" }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      setImportError(null);
      setImportMessage(
        result.imported > 0
          ? `Imported ${result.imported} global exercises. ${result.alreadyPresent} were already in your library.`
          : `No new exercises to import. ${result.alreadyPresent} are already in your library.`,
      );
    },
    onError: () => {
      setImportMessage(null);
      setImportError("Could not import the exercise library. Please try again.");
    },
  });

  function openCreate() {
    setEditingExercise(null);
    setForm(EMPTY_FORM);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(exercise: Exercise) {
    setEditingExercise(exercise);
    setForm({
      name: exercise.name,
      description: exercise.description ?? "",
      instructions: exercise.instructions ?? "",
      exerciseType: (exercise.exerciseType as ExerciseType) ?? "STRENGTH",
      primaryMuscleGroups: exercise.primaryMuscleGroups ?? [],
      equipment: exercise.equipment ?? [],
      videoUrl: exercise.videoUrl ?? "",
    });
    setError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingExercise(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Exercise name is required"); return; }
    if (editingExercise) {
      updateMutation.mutate({ id: editingExercise.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const typeFields = TYPE_FIELDS[form.exerciseType];

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="flex items-center gap-2">
          <Dumbbell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Exercise Library</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canImport && (
            <Button
              variant="outline"
              disabled={importMutation.isPending}
              onClick={() => {
                setImportMessage(null);
                setImportError(null);
                importMutation.mutate();
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {importMutation.isPending ? "Importing..." : "Import global library"}
            </Button>
          )}
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Exercise</Button>
        </div>
      </div>

      {importMessage && (
        <p role="status" className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          {importMessage}
        </p>
      )}
      {importError && (
        <p role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {importError}
        </p>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            {EXERCISE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Exercise Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : exercises.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No exercises found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {exercises.map((ex) => (
            <Card key={ex.id} className="relative group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-tight">{ex.name}</CardTitle>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 border-0 ${TYPE_COLORS[ex.exerciseType] ?? ""}`}
                  >
                    {ex.exerciseType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {ex.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{ex.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mb-1">
                  {(ex.primaryMuscleGroups ?? []).map((m) => (
                    <span key={m} className="text-xs bg-muted rounded px-1.5 py-0.5">{m}</span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(ex.equipment ?? []).map((e) => (
                    <span key={e} className="text-xs border rounded px-1.5 py-0.5 text-muted-foreground">{e}</span>
                  ))}
                </div>
                {ex.videoUrl && (
                  <a
                    href={ex.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Watch demo
                  </a>
                )}
                {ex.organisationId && (
                  <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(ex)}>
                      <Pencil className="w-3 h-3 mr-1" />Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => archiveMutation.mutate(ex.id)}
                      disabled={archiveMutation.isPending}
                    >
                      <Archive className="w-3 h-3 mr-1" />Archive
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExercise ? "Edit Exercise" : "Add Exercise"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name + Type row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Back Squat"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select
                  value={form.exerciseType}
                  onValueChange={(v) => setForm((f) => ({ ...f, exerciseType: v as ExerciseType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXERCISE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Muscles + Equipment */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Primary Muscles</label>
                <MultiSelect
                  options={MUSCLE_GROUPS}
                  value={form.primaryMuscleGroups}
                  onChange={(v) => setForm((f) => ({ ...f, primaryMuscleGroups: v }))}
                  placeholder="Select muscles..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Equipment</label>
                <MultiSelect
                  options={EQUIPMENT_OPTIONS}
                  value={form.equipment}
                  onChange={(v) => setForm((f) => ({ ...f, equipment: v }))}
                  placeholder="Select equipment..."
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium mb-1 block">Short Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="One-line summary"
              />
            </div>

            {/* Instructions (Tiptap) */}
            <div>
              <label className="text-sm font-medium mb-1 block">
                Instructions
                <span className="text-xs text-muted-foreground ml-2 font-normal">
                  Supports lists, paragraphs, bold
                </span>
              </label>
              <TiptapEditor
                value={form.instructions}
                onChange={(v) => setForm((f) => ({ ...f, instructions: v }))}
                placeholder="Step-by-step cues, setup notes, common errors..."
                minHeight="140px"
              />
            </div>

            {/* Video URL */}
            <div>
              <label className="text-sm font-medium mb-1 block">Video / Demo URL</label>
              <Input
                value={form.videoUrl}
                onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                placeholder="https://youtube.com/..."
                type="url"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingExercise ? "Save Changes" : "Add Exercise"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
