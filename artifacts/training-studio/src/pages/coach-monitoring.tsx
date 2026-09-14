import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Users, Search, CheckCircle2, Clock3, Circle } from "lucide-react";

interface WorkoutInstanceRow {
  instance: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    durationSeconds: number | null;
    sessionRpe: number | null;
    notes: string | null;
  };
  member: { id: string; name: string; email: string };
  workout: { id: string; name: string };
  programme: { id: string; name: string };
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
  return res.json();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const STATUS_CONFIG = {
  COMPLETED: {
    label: "Done",
    icon: CheckCircle2,
    className: "bg-green-500/20 text-green-400 border-green-500/30",
  },
  IN_PROGRESS: {
    label: "In progress",
    icon: Clock3,
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  },
  NOT_STARTED: {
    label: "Not started",
    icon: Circle,
    className: "bg-muted text-muted-foreground",
  },
};

export default function CoachMonitoring() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const { data: instances = [], isLoading } = useQuery<WorkoutInstanceRow[]>({
    queryKey: ["coach-workout-instances"],
    queryFn: () => apiFetch("/coach/workout-instances"),
  });

  const filtered = instances.filter((row) => {
    const matchesSearch =
      !search ||
      row.member.name.toLowerCase().includes(search.toLowerCase()) ||
      row.workout.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || row.instance.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-background text-foreground p-5">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Member Workouts</h1>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search member or workout…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="COMPLETED">Done</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="NOT_STARTED">Not started</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats row */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(["COMPLETED", "IN_PROGRESS", "NOT_STARTED"] as const).map((status) => {
              const count = instances.filter((r) => r.instance.status === status).length;
              const cfg = STATUS_CONFIG[status];
              const Icon = cfg.icon;
              return (
                <div
                  key={status}
                  className={`rounded-xl border p-3 flex items-center gap-2 ${cfg.className}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div>
                    <p className="text-lg font-bold leading-none">{count}</p>
                    <p className="text-xs mt-0.5">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No workout sessions found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => {
              const cfg = STATUS_CONFIG[row.instance.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.NOT_STARTED;
              const Icon = cfg.icon;

              return (
                <Link key={row.instance.id} href={`/coach/workout/${row.instance.id}`}>
                  <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-card hover:bg-card/80 transition-colors p-4 cursor-pointer">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">
                        {row.member.name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{row.member.name}</p>
                        <Badge variant="outline" className={`text-[10px] border shrink-0 ${cfg.className}`}>
                          <Icon className="w-2.5 h-2.5 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {row.workout.name} · {row.programme.name}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      {row.instance.status === "COMPLETED" ? (
                        <div>
                          {row.instance.sessionRpe && (
                            <p className="text-sm font-semibold">RPE {row.instance.sessionRpe}</p>
                          )}
                          {row.instance.durationSeconds && (
                            <p className="text-xs text-muted-foreground">
                              {formatDuration(row.instance.durationSeconds)}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground">
                            {relativeTime(row.instance.completedAt)}
                          </p>
                        </div>
                      ) : row.instance.status === "IN_PROGRESS" ? (
                        <p className="text-xs text-muted-foreground">
                          {relativeTime(row.instance.startedAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
