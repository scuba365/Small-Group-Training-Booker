import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Dumbbell, ChevronRight, Play, Calendar, AlertCircle } from "lucide-react";

interface Workout {
  id: string;
  name: string;
  description?: string | null;
}

interface Day {
  id: string;
  dayNumber: number;
  label?: string | null;
  workouts: Workout[];
}

interface ProgrammeContext {
  assignment: {
    id: string;
    programmeId: string;
    startDate: string;
    endDate?: string | null;
    status: string;
    notes?: string | null;
  };
  programme: { id: string; name: string; description?: string | null };
  overallWeek: number;
  currentPhase: { id: string; name: string; orderIndex: number } | null;
  currentWeek: { id: string; weekNumber: number; label?: string | null } | null;
  days: Day[];
}

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

function PrescriptionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export default function MyProgramme() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<ProgrammeContext>({
    queryKey: ["me-programme"],
    queryFn: () => apiFetch("/me/programme"),
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: ({ assignmentId, workoutId }: { assignmentId: string; workoutId: string }) =>
      apiFetch<{ id: string }>("/workout-instances", {
        method: "POST",
        body: JSON.stringify({ assignmentId, workoutId }),
      }),
    onSuccess: (result) => {
      navigate(`/workout/${result.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-7 w-40" />
        </div>
        <Skeleton className="h-28 w-full rounded-2xl mb-6" />
        <PrescriptionSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground p-5 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">My Programme</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mb-4 opacity-40" />
          <p className="text-muted-foreground text-sm">
            {error instanceof Error && error.message === "No active programme assignment"
              ? "You don't have an active programme yet. Ask your coach to assign one."
              : "Something went wrong loading your programme."}
          </p>
        </div>
      </div>
    );
  }

  const { assignment, programme, overallWeek, currentPhase, currentWeek, days } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border/40 px-5 py-4 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              My Programme
            </p>
            <h1 className="text-lg font-bold truncate">{programme.name}</h1>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Current context card */}
          <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                Where you are
              </span>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-2xl font-bold tracking-tight">
                Week {overallWeek}
              </p>
              {currentPhase && (
                <p className="text-sm text-muted-foreground">
                  {currentPhase.name}
                  {currentWeek?.label ? ` · ${currentWeek.label}` : ""}
                </p>
              )}
              {assignment.startDate && (
                <p className="text-xs text-muted-foreground mt-2">
                  Started{" "}
                  {new Date(`${assignment.startDate}T00:00:00`).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Training days */}
          {days.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Dumbbell className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No training days scheduled for this week.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                This week's training
              </h2>
              {days.map((day) => (
                <div key={day.id} className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">
                    Day {day.dayNumber}
                    {day.label ? ` — ${day.label}` : ""}
                  </p>
                  {day.workouts.map((workout) => (
                    <Card
                      key={workout.id}
                      className="border-border/60 bg-card hover:bg-card/80 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Dumbbell className="w-4 h-4 text-primary shrink-0" />
                              <p className="font-semibold truncate">{workout.name}</p>
                            </div>
                            {workout.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {workout.description}
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="shrink-0 gap-1.5"
                            disabled={startMutation.isPending}
                            onClick={() =>
                              startMutation.mutate({
                                assignmentId: assignment.id,
                                workoutId: workout.id,
                              })
                            }
                          >
                            <Play className="w-3.5 h-3.5" />
                            Start
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Programme notes */}
          {assignment.notes && (
            <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wider">
                Coach note
              </p>
              <p>{assignment.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
