import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  Pencil,
  X,
  Check,
  CalendarDays,
  Dumbbell,
  MessageSquare,
  Clock,
  Activity,
  TrendingUp,
  Mail,
  Phone,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoachNote {
  id: string;
  body: string;
  createdAt: string;
  coachId: string | null;
  coachName: string | null;
}

interface BookingRow {
  id: string;
  status: string;
  bookedAt: string;
  cancelledAt: string | null;
  feeAmountCents: number | null;
  feeReason: string | null;
  sessionId: string;
  sessionName: string;
  sessionDate: string;
  sessionStartTime: string;
}

interface ActiveAssignment {
  id: string;
  status: string;
  startDate: string;
  programmeName: string;
  programmeId: string;
}

interface WorkoutRow {
  id: string;
  status: string;
  completedAt: string | null;
  durationSeconds: number | null;
  sessionRpe: number | null;
  workoutName: string;
}

interface MemberProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  role: string;
  status: "ACTIVE" | "INACTIVE";
  membershipPlan: string | null;
  membershipStartDate: string | null;
  joinedAt: string | null;
  attendanceRate: number | null;
  attendanceAttended: number;
  attendanceDenominator: number;
  bookings: BookingRow[];
  activeAssignment: ActiveAssignment | null;
  recentWorkouts: WorkoutRow[];
  coachNotes: CoachNote[];
}

type Tab = "overview" | "training" | "attendance" | "notes" | "membership" | "progress" | "checkins";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const dateStr = iso.length === 10 ? iso : iso.slice(0, 10);
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatSessionTime(timeStr: string | null | undefined) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s > 0 ? ` ${s}s` : ""}`;
}

function relativeTime(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

function rateColour(rate: number | null) {
  if (rate === null) return "text-foreground";
  if (rate >= 80) return "text-[hsl(162_39%_37%)]";
  if (rate >= 60) return "text-amber-600";
  return "text-destructive";
}

const STATUS_COLOURS: Record<string, string> = {
  ATTENDED: "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]",
  BOOKED: "bg-primary/15 text-primary",
  NO_SHOW: "bg-destructive/10 text-destructive",
  LATE_CANCEL: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// AttendanceBar
// ---------------------------------------------------------------------------

function AttendanceBar({ attended, denominator, rate }: { attended: number; denominator: number; rate: number | null }) {
  const colour = rate === null ? "bg-border" : rate >= 80 ? "bg-[hsl(162_39%_44%)]" : rate >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between">
        <div>
          <span className={`text-3xl font-bold tracking-tight ${rateColour(rate)}`}>
            {rate !== null ? `${rate}%` : "—"}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            {denominator > 0 ? `${attended} attended / ${denominator} counted` : "No sessions yet"}
          </span>
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${rate ?? 0}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Attendance = sessions attended ÷ (attended + no-shows + late cancels). Regular cancels are excluded.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BreakdownPills — reused in Overview and Attendance
// ---------------------------------------------------------------------------

function BreakdownPills({ attended, noShows, lateCancels, cancellations }: {
  attended: number;
  noShows: number;
  lateCancels: number;
  cancellations: number;
}) {
  const total = attended + noShows + lateCancels + cancellations;
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="inline-flex items-center rounded-full bg-[hsl(162_39%_44%/0.12)] px-2.5 py-1 font-semibold text-[hsl(162_39%_32%)]">
        {attended} attended
      </span>
      {noShows > 0 && (
        <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive">
          {noShows} no-show{noShows > 1 ? "s" : ""}
        </span>
      )}
      {lateCancels > 0 && (
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-700 dark:text-amber-400">
          {lateCancels} late cancel{lateCancels > 1 ? "s" : ""}
        </span>
      )}
      {cancellations > 0 && (
        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground">
          {cancellations} cancelled
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditModal
// ---------------------------------------------------------------------------

interface EditModalProps {
  member: MemberProfile;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ member, onClose, onSaved }: EditModalProps) {
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [phone, setPhone] = useState(member.phone ?? "");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">(member.status);
  const [plan, setPlan] = useState(member.membershipPlan ?? "");
  const [startDate, setStartDate] = useState(
    member.membershipStartDate
      ? new Date(member.membershipStartDate).toISOString().slice(0, 10)
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || null,
          status,
          membershipPlan: plan.trim() || null,
          membershipStartDate: startDate ? new Date(startDate + "T00:00:00.000Z").toISOString() : null,
        }),
      });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-bold">Edit member</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-4">
          <div className="pb-3 border-b border-border/60">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Contact</p>
            <div className="space-y-3">
              <label className="block text-xs font-semibold">
                Name
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold">
                Email
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold">
                Phone
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="+353 86…" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </div>
          </div>
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Membership</p>
            <div className="space-y-3">
              <label className="block text-xs font-semibold">
                Status
                <select className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Plan
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Monthly SGPT" value={plan} onChange={(e) => setPlan(e.target.value)} />
              </label>
              <label className="block text-xs font-semibold">
                Start date
                <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted transition">Cancel</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-60">
            <Check className="w-4 h-4" />{saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddNote
// ---------------------------------------------------------------------------

function AddNote({ memberId, onAdded }: { memberId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch(`/members/${memberId}/notes`, { method: "POST", body: JSON.stringify({ body: text }) }),
    onSuccess: () => {
      setBody("");
      setOpen(false);
      setError(null);
      onAdded();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition"
      >
        <MessageSquare className="w-4 h-4" /> Add note
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <textarea
        rows={3}
        autoFocus
        placeholder="Write a note about this member…"
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{body.length}/2000</span>
        <div className="flex gap-2">
          <button onClick={() => { setOpen(false); setBody(""); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate(body)}
            disabled={!body.trim() || mutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition disabled:opacity-60"
          >
            <Check className="w-3 h-3" />{mutation.isPending ? "Saving…" : "Save note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "training", label: "Training" },
  { id: "attendance", label: "Attendance" },
  { id: "notes", label: "Coach Notes" },
  { id: "membership", label: "Membership" },
  { id: "progress", label: "Progress" },
  { id: "checkins", label: "Check-ins" },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: member, isLoading, isError } = useQuery<MemberProfile>({
    queryKey: ["member", id],
    queryFn: () => apiFetch(`/members/${id}`),
    enabled: !!id,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["member", id] });
    queryClient.invalidateQueries({ queryKey: ["members"] });
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">Member not found or you don't have access.</p>
        <Link href="/members" className="mt-4 text-xs font-bold text-primary underline underline-offset-4">
          Back to members
        </Link>
      </div>
    );
  }

  // Derived from bookings — no extra API calls
  const today = new Date().toISOString().slice(0, 10);
  const nextBooking = member.bookings
    .filter((b) => b.status === "BOOKED" && b.sessionDate >= today)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))[0] ?? null;
  const lastAttended = member.bookings
    .filter((b) => b.status === "ATTENDED")
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0] ?? null;
  const noShows = member.bookings.filter((b) => b.status === "NO_SHOW").length;
  const lateCancels = member.bookings.filter((b) => b.status === "LATE_CANCEL").length;
  const cancellations = member.bookings.filter((b) => b.status === "CANCELLED").length;

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <Link href="/members" className="mb-5 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" /> Members
      </Link>

      {/* Header — WHO IS THIS */}
      <div className="studio-card mb-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-bold text-primary">
              {initials(member.name)}
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{member.name}</h1>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              {member.phone && <p className="mt-0.5 text-xs text-muted-foreground">{member.phone}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${member.status === "ACTIVE" ? "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]" : "bg-muted text-muted-foreground"}`}>
              {member.status}
            </span>
            {member.membershipPlan && (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
                {member.membershipPlan}
              </span>
            )}
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/30 p-1">
        {TABS.map(({ id: tabId, label }) => (
          <button
            key={tabId}
            onClick={() => setActiveTab(tabId)}
            className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === tabId ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-4">

        {/* ---------------------------------------------------------------- */}
        {/* OVERVIEW                                                         */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* At a glance — WHEN / HOW OFTEN */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="studio-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Next session</p>
                {nextBooking ? (
                  <>
                    <p className="mt-2 text-sm font-bold">{formatShortDate(nextBooking.sessionDate)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{nextBooking.sessionName}</p>
                    {nextBooking.sessionStartTime && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatSessionTime(nextBooking.sessionStartTime)}</p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">None booked</p>
                )}
              </div>

              <div className="studio-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Last attended</p>
                {lastAttended ? (
                  <>
                    <p className="mt-2 text-sm font-bold">{formatShortDate(lastAttended.sessionDate)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{lastAttended.sessionName}</p>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No sessions yet</p>
                )}
              </div>

              <div className="studio-card p-4">
                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Attendance</p>
                <p className={`mt-2 text-2xl font-bold tracking-tight ${rateColour(member.attendanceRate)}`}>
                  {member.attendanceRate !== null ? `${member.attendanceRate}%` : "—"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {member.attendanceDenominator > 0
                    ? `${member.attendanceAttended}/${member.attendanceDenominator} counted`
                    : "No data yet"}
                </p>
              </div>
            </div>

            {/* Breakdown chips — HOW OFTEN in detail */}
            <BreakdownPills
              attended={member.attendanceAttended}
              noShows={noShows}
              lateCancels={lateCancels}
              cancellations={cancellations}
            />

            {/* Current programme — WHAT ARE THEY DOING */}
            {member.activeAssignment ? (
              <div className="studio-card flex items-center gap-4 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <Dumbbell className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Current programme</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{member.activeAssignment.programmeName}</p>
                  <p className="text-xs text-muted-foreground">Started {formatDate(member.activeAssignment.startDate)}</p>
                </div>
                <Link href={`/programmes/${member.activeAssignment.programmeId}`} className="shrink-0 text-xs font-bold text-primary hover:underline underline-offset-4">
                  View →
                </Link>
              </div>
            ) : (
              <div className="studio-card flex items-center gap-4 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Dumbbell className="w-4 h-4 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Current programme</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">No active programme</p>
                </div>
              </div>
            )}

            {/* Latest coach note — ANYTHING I NEED TO KNOW */}
            {member.coachNotes.length > 0 && (
              <div className="studio-card border-l-2 border-l-amber-500/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-muted-foreground">Latest note</p>
                  <button
                    onClick={() => setActiveTab("notes")}
                    className="text-[10px] font-bold text-primary hover:underline underline-offset-4"
                  >
                    All notes →
                  </button>
                </div>
                <p className="text-sm leading-relaxed">{member.coachNotes[0].body}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {relativeTime(member.coachNotes[0].createdAt)} · {member.coachNotes[0].coachName ?? "Coach"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* TRAINING                                                         */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "training" && (
          <div className="space-y-4">
            {member.activeAssignment ? (
              <div className="studio-card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Active programme</p>
                  <Link href={`/programmes/${member.activeAssignment.programmeId}`} className="text-xs font-bold text-primary hover:underline underline-offset-4">
                    Open →
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <Dumbbell className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{member.activeAssignment.programmeName}</p>
                    <p className="text-xs text-muted-foreground">Started {formatDate(member.activeAssignment.startDate)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="studio-card flex flex-col items-center py-12 text-center p-5">
                <Dumbbell className="mb-3 w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm font-semibold">No active programme</p>
                <p className="mt-1 text-xs text-muted-foreground">Assign a programme to this member from the Programmes page.</p>
              </div>
            )}

            {member.recentWorkouts.length > 0 ? (
              <div className="studio-card overflow-hidden">
                <div className="border-b border-border bg-muted/40 px-5 py-3">
                  <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Recent workouts</p>
                </div>
                <div className="divide-y divide-border/60">
                  {member.recentWorkouts.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`h-2 w-2 shrink-0 rounded-full ${w.status === "COMPLETED" ? "bg-[hsl(162_39%_44%)]" : w.status === "IN_PROGRESS" ? "bg-amber-500" : "bg-border"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{w.workoutName}</p>
                        {w.completedAt && <p className="text-xs text-muted-foreground">{formatDate(w.completedAt)}</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        {w.sessionRpe != null && <p className="text-xs font-semibold">RPE {w.sessionRpe}</p>}
                        {w.durationSeconds && <p className="text-xs text-muted-foreground">{formatDuration(w.durationSeconds)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="studio-card flex flex-col items-center py-10 text-center p-5">
                <p className="text-sm text-muted-foreground">No workout logs yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* ATTENDANCE                                                       */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "attendance" && (
          <div className="space-y-4">
            <div className="studio-card p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Attendance rate</p>
              <AttendanceBar
                attended={member.attendanceAttended}
                denominator={member.attendanceDenominator}
                rate={member.attendanceRate}
              />
            </div>

            <BreakdownPills
              attended={member.attendanceAttended}
              noShows={noShows}
              lateCancels={lateCancels}
              cancellations={cancellations}
            />

            {member.bookings.length > 0 ? (
              <div className="studio-card overflow-hidden">
                <div className="hidden grid-cols-[1.4fr_110px_100px_80px] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground sm:grid">
                  <span>Session</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span>Fee</span>
                </div>
                <div className="divide-y divide-border/60">
                  {member.bookings.map((b) => (
                    <div key={b.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[1.4fr_110px_100px_80px] sm:items-center">
                      <span className="truncate font-medium">{b.sessionName}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatShortDate(b.sessionDate)}
                      </span>
                      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] ${STATUS_COLOURS[b.status] ?? "bg-muted text-muted-foreground"}`}>
                        {b.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {b.feeAmountCents ? `€${(b.feeAmountCents / 100).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="studio-card flex flex-col items-center py-12 text-center p-5">
                <CalendarDays className="mb-3 w-8 h-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No booking history yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* COACH NOTES                                                      */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "notes" && (
          <div className="space-y-4">
            <div className="studio-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Coach notes</p>
                <AddNote memberId={member.id} onAdded={invalidate} />
              </div>

              {member.coachNotes.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <MessageSquare className="mb-3 w-7 h-7 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No notes yet. Add one above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {member.coachNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                      <p className="text-sm leading-relaxed">{note.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {relativeTime(note.createdAt)} · {note.coachName ?? "Coach"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* MEMBERSHIP                                                       */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "membership" && (
          <div className="space-y-4">
            <div className="studio-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Contact details</p>
                <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-4">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
              </div>
              <dl className="space-y-3">
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-1 items-center justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">Email</dt>
                    <dd className="text-sm font-semibold">{member.email}</dd>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-1 items-center justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">Phone</dt>
                    <dd className="text-sm font-semibold">{member.phone ?? "—"}</dd>
                  </div>
                </div>
              </dl>
            </div>

            <div className="studio-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Membership</p>
              </div>
              <dl className="space-y-3">
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Status</dt>
                  <dd>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${member.status === "ACTIVE" ? "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]" : "bg-muted text-muted-foreground"}`}>
                      {member.status}
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Plan</dt>
                  <dd className="text-sm font-semibold">{member.membershipPlan ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Start date</dt>
                  <dd className="text-sm font-semibold">{formatDate(member.membershipStartDate)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-sm text-muted-foreground">Member since</dt>
                  <dd className="text-sm font-semibold">{formatDate(member.joinedAt)}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PROGRESS — placeholder                                           */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "progress" && (
          <div className="studio-card flex flex-col items-center py-16 text-center p-5">
            <TrendingUp className="mb-3 w-10 h-10 text-muted-foreground/30" />
            <p className="font-semibold">Progress — Coming Soon</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              InBody scan history and personal bests will appear here once scan data is connected.
            </p>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CHECK-INS — placeholder                                          */}
        {/* ---------------------------------------------------------------- */}
        {activeTab === "checkins" && (
          <div className="studio-card flex flex-col items-center py-16 text-center p-5">
            <Clock className="mb-3 w-10 h-10 text-muted-foreground/30" />
            <p className="font-semibold">Check-ins — Coming Soon</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              NFC and manual check-in history will appear here once the check-in system is active.
            </p>
          </div>
        )}

      </div>

      {/* Edit modal */}
      {editOpen && (
        <EditModal
          member={member}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); invalidate(); }}
        />
      )}
    </div>
  );
}
