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

type Tab = "overview" | "training" | "attendance" | "progress" | "checkins" | "membership" | "activity";

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

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s > 0 ? `${s}s` : ""}`.trim();
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

const STATUS_COLOURS: Record<string, string> = {
  ATTENDED: "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]",
  BOOKED: "bg-primary/15 text-primary",
  NO_SHOW: "bg-destructive/10 text-destructive",
  LATE_CANCEL: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  CANCELLED: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AttendanceBar({ attended, denominator, rate }: { attended: number; denominator: number; rate: number | null }) {
  const colour = rate === null ? "bg-border" : rate >= 80 ? "bg-[hsl(162_39%_44%)]" : rate >= 60 ? "bg-amber-500" : "bg-destructive";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between">
        <div>
          <span className="text-3xl font-bold tracking-tight">{rate !== null ? `${rate}%` : "—"}</span>
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
// Edit modal
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
          <label className="block text-xs font-semibold">
            Status
            <select className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "ACTIVE" | "INACTIVE")}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Membership plan
            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="e.g. Monthly SGPT" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </label>
        </div>
        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2 justify-end">
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
// Add note
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
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition">
        <MessageSquare className="w-4 h-4" /> Add coach note
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
          <button onClick={() => { setOpen(false); setBody(""); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition">Cancel</button>
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
// Main page
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "training", label: "Training" },
  { id: "attendance", label: "Attendance" },
  { id: "progress", label: "Progress" },
  { id: "checkins", label: "Check-ins" },
  { id: "membership", label: "Membership" },
  { id: "activity", label: "Activity" },
];

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: member, isLoading, isError, refetch } = useQuery<MemberProfile>({
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
      <div className="min-h-screen bg-background p-5">
        <div className="max-w-3xl mx-auto space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">Member not found or you don't have access.</p>
        <Link href="/members" className="mt-4 text-xs font-bold text-primary underline underline-offset-4">Back to members</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <Link href="/members" className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="w-4 h-4" /> Members
      </Link>

      {/* Header card */}
      <div className="studio-card mb-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-lg font-bold text-primary">
              {initials(member.name)}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{member.name}</h1>
              <p className="text-sm text-muted-foreground">{member.email}</p>
              {member.phone && <p className="text-xs text-muted-foreground">{member.phone}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${member.status === "ACTIVE" ? "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]" : "bg-muted text-muted-foreground"}`}>
              {member.status}
            </span>
            <button
              onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Attendance</p>
            <p className="mt-1 text-lg font-bold">
              {member.attendanceRate !== null ? `${member.attendanceRate}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{member.attendanceAttended}/{member.attendanceDenominator} sessions</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Programme</p>
            <p className="mt-1 text-sm font-bold truncate">{member.activeAssignment?.programmeName ?? "None"}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Role</p>
            <p className="mt-1 text-sm font-bold">{member.role}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Member since</p>
            <p className="mt-1 text-sm font-bold">{formatDate(member.joinedAt)}</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/30 p-1">
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
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="studio-card p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Attendance summary</p>
              <AttendanceBar
                attended={member.attendanceAttended}
                denominator={member.attendanceDenominator}
                rate={member.attendanceRate}
              />
            </div>
            {member.activeAssignment && (
              <div className="studio-card p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Current programme</p>
                <div className="flex items-center gap-3">
                  <Dumbbell className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold">{member.activeAssignment.programmeName}</p>
                    <p className="text-xs text-muted-foreground">Started {formatDate(member.activeAssignment.startDate)}</p>
                  </div>
                  <Link href={`/programmes/${member.activeAssignment.programmeId}`} className="ml-auto text-xs font-bold text-primary hover:underline underline-offset-4">
                    View →
                  </Link>
                </div>
              </div>
            )}
            {member.coachNotes.length > 0 && (
              <div className="studio-card p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Latest coach note</p>
                <p className="text-sm">{member.coachNotes[0].body}</p>
                <p className="mt-2 text-xs text-muted-foreground">{relativeTime(member.coachNotes[0].createdAt)} · {member.coachNotes[0].coachName ?? "Coach"}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "training" && (
          <div className="space-y-4">
            {member.activeAssignment ? (
              <div className="studio-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Active programme</p>
                  <Link href={`/programmes/${member.activeAssignment.programmeId}`} className="text-xs font-bold text-primary hover:underline underline-offset-4">
                    Open →
                  </Link>
                </div>
                <p className="font-semibold">{member.activeAssignment.programmeName}</p>
                <p className="text-xs text-muted-foreground mt-1">Started {formatDate(member.activeAssignment.startDate)}</p>
              </div>
            ) : (
              <div className="studio-card flex flex-col items-center py-12 text-center p-5">
                <Dumbbell className="w-8 h-8 mb-3 text-muted-foreground/30" />
                <p className="text-sm font-semibold">No active programme</p>
                <p className="mt-1 text-xs text-muted-foreground">Assign a programme to this member from the Programmes page.</p>
              </div>
            )}
            {member.recentWorkouts.length > 0 && (
              <div className="studio-card p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Recent workouts</p>
                <div className="space-y-2">
                  {member.recentWorkouts.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 rounded-xl border border-border/50 p-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${w.status === "COMPLETED" ? "bg-[hsl(162_39%_44%)]" : w.status === "IN_PROGRESS" ? "bg-amber-500" : "bg-border"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{w.workoutName}</p>
                        {w.completedAt && <p className="text-xs text-muted-foreground">{formatDate(w.completedAt)}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {w.sessionRpe && <p className="text-xs font-semibold">RPE {w.sessionRpe}</p>}
                        {w.durationSeconds && <p className="text-xs text-muted-foreground">{formatDuration(w.durationSeconds)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            {member.bookings.length > 0 ? (
              <div className="studio-card overflow-hidden">
                <div className="hidden grid-cols-[1.4fr_100px_90px_90px] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground sm:grid">
                  <span>Session</span>
                  <span>Date</span>
                  <span>Status</span>
                  <span>Fee</span>
                </div>
                <div className="divide-y divide-border/60">
                  {member.bookings.map((b) => (
                    <div key={b.id} className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[1.4fr_100px_90px_90px] sm:items-center">
                      <span className="font-medium truncate">{b.sessionName}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(b.sessionDate)}</span>
                      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] ${STATUS_COLOURS[b.status] ?? "bg-muted text-muted-foreground"}`}>
                        {b.status.replace("_", " ")}
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
                <CalendarDays className="w-8 h-8 mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No booking history yet.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "progress" && (
          <div className="studio-card flex flex-col items-center py-16 text-center p-5">
            <Activity className="w-10 h-10 mb-3 text-muted-foreground/30" />
            <p className="font-semibold">Progress — Coming Soon</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              InBody scan history and personal bests will appear here once scan data is connected.
              Key lift PRs from training logs are planned for a future sprint.
            </p>
          </div>
        )}

        {activeTab === "checkins" && (
          <div className="studio-card flex flex-col items-center py-16 text-center p-5">
            <Clock className="w-10 h-10 mb-3 text-muted-foreground/30" />
            <p className="font-semibold">Check-ins — Coming Soon</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              NFC and manual check-in history will appear here once the check-in system is active.
            </p>
          </div>
        )}

        {activeTab === "membership" && (
          <div className="studio-card p-5 space-y-4">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Membership details</p>
            <dl className="space-y-3">
              <div className="flex items-start justify-between">
                <dt className="text-sm text-muted-foreground">Plan</dt>
                <dd className="text-sm font-semibold">{member.membershipPlan ?? "—"}</dd>
              </div>
              <div className="flex items-start justify-between">
                <dt className="text-sm text-muted-foreground">Start date</dt>
                <dd className="text-sm font-semibold">{formatDate(member.membershipStartDate)}</dd>
              </div>
              <div className="flex items-start justify-between">
                <dt className="text-sm text-muted-foreground">Status</dt>
                <dd>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.1em] ${member.status === "ACTIVE" ? "bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]" : "bg-muted text-muted-foreground"}`}>
                    {member.status}
                  </span>
                </dd>
              </div>
              <div className="flex items-start justify-between">
                <dt className="text-sm text-muted-foreground">Joined</dt>
                <dd className="text-sm font-semibold">{formatDate(member.joinedAt)}</dd>
              </div>
            </dl>
            <div className="pt-2 border-t border-border/60">
              <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-4">
                <Pencil className="w-3 h-3" /> Edit membership details
              </button>
            </div>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="space-y-3">
            {/* Coach notes */}
            <div className="studio-card p-5">
              <p className="mb-4 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Coach notes</p>
              <div className="mb-4">
                <AddNote memberId={member.id} onAdded={invalidate} />
              </div>
              {member.coachNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
              ) : (
                <div className="space-y-3">
                  {member.coachNotes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-border/50 bg-muted/20 p-4">
                      <p className="text-sm leading-6">{note.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {relativeTime(note.createdAt)} · {note.coachName ?? "Coach"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent sessions timeline */}
            {member.bookings.length > 0 && (
              <div className="studio-card p-5">
                <p className="mb-3 text-xs font-bold uppercase tracking-[.1em] text-muted-foreground">Session history</p>
                <div className="space-y-2">
                  {member.bookings.slice(0, 12).map((b) => (
                    <div key={b.id} className="flex items-center gap-3 text-sm">
                      <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] ${STATUS_COLOURS[b.status] ?? "bg-muted text-muted-foreground"}`}>
                        {b.status.replace("_", " ")}
                      </span>
                      <span className="flex-1 truncate text-xs">{b.sessionName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(b.sessionDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
