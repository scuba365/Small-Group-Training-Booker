import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/auth-context";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Plus, Search, Pencil, Archive, ChevronLeft } from "lucide-react";

const EXERCISE_TYPES = ["STRENGTH", "CARDIO", "CONDITIONING", "HYROX"] as const;
type ExerciseType = (typeof EXERCISE_TYPES)[number];

interface Exercise {
  id: string;
  name: string;
  description?: string | null;
  exerciseType: string;
  primaryMuscleGroups?: string | null;
  equipment?: string | null;
  organisationId?: string | null;
  isArchived: boolean;
}

interface ExerciseFormData {
  name: string;
  description: string;
  exerciseType: ExerciseType;
  primaryMuscleGroups: string;
  equipment: string;
}

const TYPE_COLORS: Record<string, string> = {
  STRENGTH: "bg-blue-500/20 text-blue-400",
  CARDIO: "bg-green-500/20 text-green-400",
  CONDITIONING: "bg-orange-500/20 text-orange-400",
  HYROX: "bg-purple-500/20 text-purple-400",
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

function useExercises(search: string, type: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (type && type !== "ALL") params.set("exerciseType", type);
  return useQuery<Exercise[]>({
    queryKey: ["exercises", search, type],
    queryFn: () => apiFetch(`/exercises?${params}`),
  });
}

const EMPTY_FORM: ExerciseFormData = {
  name: "",
  description: "",
  exerciseType: "STRENGTH",
  primaryMuscleGroups: "",
  equipment: "",
};

export default function ExerciseLibrary() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [form, setForm] = useState<ExerciseFormData>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: exercises = [], isLoading } = useExercises(search, typeFilter);

  const createMutation = useMutation({
    mutationFn: (data: ExerciseFormData) =>
      apiFetch<Exercise>("/exercises", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          primaryMuscleGroups: data.primaryMuscleGroups || undefined,
          equipment: data.equipment || undefined,
          description: data.description || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      closeDialog();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ExerciseFormData> }) =>
      apiFetch<Exercise>(`/exercises/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...data,
          description: data.description || undefined,
          primaryMuscleGroups: data.primaryMuscleGroups || undefined,
          equipment: data.equipment || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exercises"] });
      closeDialog();
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/exercises/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
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
      exerciseType: (exercise.exerciseType as ExerciseType) ?? "STRENGTH",
      primaryMuscleGroups: exercise.primaryMuscleGroups ?? "",
      equipment: exercise.equipment ?? "",
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
    if (!form.name.trim()) {
      setError("Exercise name is required");
      return;
    }
    if (editingExercise) {
      updateMutation.mutate({ id: editingExercise.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const filteredBySource = exercises.filter((ex) =>
    typeFilter === "ALL" || ex.exerciseType === typeFilter
  );

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Dumbbell className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Exercise Library</h1>
        </div>
        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Exercise
          </Button>
        </div>
      </div>

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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : filteredBySource.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No exercises found. Add your first exercise to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBySource.map((ex) => (
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
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {ex.description}
                  </p>
                )}
                {ex.primaryMuscleGroups && (
                  <p className="text-xs text-muted-foreground">
                    {ex.primaryMuscleGroups}
                  </p>
                )}
                {/* Only show edit/archive for org-owned exercises */}
                {ex.organisationId && (
                  <div className="flex gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(ex)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => archiveMutation.mutate(ex.id)}
                      disabled={archiveMutation.isPending}
                    >
                      <Archive className="w-3 h-3 mr-1" />
                      Archive
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExercise ? "Edit Exercise" : "Add Exercise"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, exerciseType: v as ExerciseType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional cues or notes"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Primary Muscles</label>
              <Input
                value={form.primaryMuscleGroups}
                onChange={(e) =>
                  setForm((f) => ({ ...f, primaryMuscleGroups: e.target.value }))
                }
                placeholder="e.g. Quads, Glutes, Core"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Equipment</label>
              <Input
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                placeholder="e.g. Barbell, Rack"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editingExercise ? "Save" : "Add Exercise"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
