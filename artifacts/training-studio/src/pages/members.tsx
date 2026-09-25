import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, ChevronRight, CalendarDays, Dumbbell } from "lucide-react";

interface MemberRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  status: "ACTIVE" | "INACTIVE";
  membershipPlan: string | null;
  joinedAt: string | null;
  programmeName: string | null;
  attendanceRate: number | null;
  attendanceAttended: number;
  attendanceDenominator: number;
  lastSessionDate: string | null;
  nextBookingDate: string | null;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function AttendancePill({ attended, denominator, rate }: { attended: number; denominator: number; rate: number | null }) {
  if (denominator === 0) return <span className="text-xs text-muted-foreground">No data</span>;
  const colour = rate === null ? "" : rate >= 80 ? "text-[hsl(162_39%_37%)]" : rate >= 60 ? "text-amber-600" : "text-destructive";
  return (
    <div>
      <span className={`text-sm font-bold ${colour}`}>{rate}%</span>
      <span className="ml-1 text-xs text-muted-foreground">({attended}/{denominator})</span>
    </div>
  );
}

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  const { data: members = [], isLoading, isError, refetch } = useQuery<MemberRow[]>({
    queryKey: ["members"],
    queryFn: () => apiFetch("/members"),
  });

  const filtered = members.filter((m) => {
    const matchesSearch =
      !search ||
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* Page header */}
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="studio-label">Coach view</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-[2.6rem]">Members</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Who's showing up, what they're on, and where a nudge might help.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-[hsl(162_39%_44%/0.12)] px-3 py-2 text-xs font-bold text-[hsl(162_39%_32%)]">
          <span className="h-2 w-2 rounded-full bg-[hsl(162_39%_44%)]" />
          {isLoading ? "Loading…" : `${members.filter((m) => m.status === "ACTIVE").length} active`}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-border overflow-hidden text-xs font-semibold">
          {(["ALL", "ACTIVE", "INACTIVE"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 transition ${statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-border/40 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-sm text-muted-foreground">Failed to load members.</p>
          <button onClick={() => refetch()} className="mt-3 text-xs font-bold text-primary underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <Users className="w-10 h-10 mb-3 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== "ALL" ? "No members match your filters." : "No members yet."}
          </p>
        </div>
      ) : (
        <div className="studio-card overflow-hidden">
          {/* Column headers — desktop */}
          <div className="hidden grid-cols-[1.6fr_1fr_1.1fr_1.1fr_1fr_1fr_32px] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground md:grid">
            <span>Member</span>
            <span>Status / Plan</span>
            <span>Programme</span>
            <span>Attendance</span>
            <span>Last session</span>
            <span>Next booking</span>
            <span />
          </div>
          <div className="divide-y divide-border/60">
            {filtered.map((m) => (
              <Link key={m.id} href={`/members/${m.id}`}>
                <div className="grid cursor-pointer gap-3 px-5 py-4 transition hover:bg-muted/30 md:grid-cols-[1.6fr_1fr_1.1fr_1.1fr_1fr_1fr_32px] md:items-center" data-testid={`row-member-${m.id}`}>
                  {/* Name */}
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                      {initials(m.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                    </div>
                  </div>

                  {/* Status / plan */}
                  <div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] ${m.status === "ACTIVE" ? "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]" : "bg-muted text-muted-foreground"}`}>
                      {m.status}
                    </span>
                    {m.membershipPlan && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.membershipPlan}</p>
                    )}
                  </div>

                  {/* Programme */}
                  <div className="flex items-center gap-1.5 text-sm">
                    {m.programmeName ? (
                      <>
                        <Dumbbell className="w-3.5 h-3.5 shrink-0 text-primary" />
                        <span className="truncate text-xs">{m.programmeName}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Attendance */}
                  <AttendancePill
                    attended={m.attendanceAttended}
                    denominator={m.attendanceDenominator}
                    rate={m.attendanceRate}
                  />

                  {/* Last session */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                    {formatDate(m.lastSessionDate)}
                  </div>

                  {/* Next booking */}
                  <div className="flex items-center gap-1.5 text-xs">
                    {m.nextBookingDate ? (
                      <span className="font-medium text-foreground">{formatDate(m.nextBookingDate)}</span>
                    ) : (
                      <span className="text-muted-foreground">None booked</span>
                    )}
                  </div>

                  <ChevronRight className="hidden w-4 h-4 text-muted-foreground/50 md:block" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
