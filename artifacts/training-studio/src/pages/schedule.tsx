import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Edit2,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/context/auth-context';
import { useMode } from '@/context/mode-context';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionType {
  id: string;
  name: string;
  color: string | null;
  defaultDurationMinutes: number;
  defaultCapacity: number;
}

interface SessionSummary {
  id: string;
  name: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  location: string | null;
  status: string;
  sessionTypeId: string | null;
  sessionTypeName: string | null;
  sessionTypeColor: string | null;
  coachId: string | null;
  coachName: string | null;
  bookedCount: number;
  myBookingStatus: string | null;
  notes: string | null;
  workoutId: string | null;
  recurringGroupId: string | null;
}

interface BookingRow {
  id: string;
  memberId: string;
  memberName: string;
  memberEmail: string;
  status: string;
  bookedAt: string;
  cancelledAt: string | null;
  feeAmountCents: number | null;
  feeReason: string | null;
}

interface SessionDetail extends SessionSummary {
  bookings: BookingRow[];
  workout: { id: string; name: string } | null;
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T = void>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  // Use local date components to avoid UTC offset shifting the date in BST/IST
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); // Monday-based
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatSessionTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')}${suffix}`;
}

function getEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDayHeader(ymd: string): { day: string; date: string; isToday: boolean } {
  const d = new Date(ymd + 'T12:00:00');
  return {
    day: d.toLocaleDateString('en-IE', { weekday: 'short' }),
    date: String(d.getDate()),
    isToday: ymd === toYMD(new Date()),
  };
}

function formatWeekLabel(start: Date): string {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}`;
}

// ─── Time grid constants ──────────────────────────────────────────────────────

const PX_PER_HOUR = 56;
const PX_PER_MIN = PX_PER_HOUR / 60;
const GRID_START_HOUR = 5;
const GRID_END_HOUR = 22;
const GRID_HEIGHT = (GRID_END_HOUR - GRID_START_HOUR) * PX_PER_HOUR;
const GRID_HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR + 1 },
  (_, i) => GRID_START_HOUR + i,
);

function timeToPixels(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return ((h - GRID_START_HOUR) * 60 + m) * PX_PER_MIN;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatHourLabel(h: number): string {
  if (h === 12) return '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  BOOKED: 'Booked',
  ATTENDED: 'Attended',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
  LATE_CANCEL: 'Late cancel',
};

const STATUS_COLORS: Record<string, string> = {
  BOOKED: 'bg-primary/15 text-foreground',
  ATTENDED: 'bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]',
  NO_SHOW: 'bg-destructive/10 text-destructive',
  CANCELLED: 'bg-muted text-muted-foreground',
  LATE_CANCEL: 'bg-orange-500/10 text-orange-600',
};

// ─── cx ───────────────────────────────────────────────────────────────────────

const cx = (...parts: Array<string | false | undefined | null>) => parts.filter(Boolean).join(' ');

// ─── SessionCard (week grid) ──────────────────────────────────────────────────

function SessionCard({
  session,
  onClick,
  compact = false,
}: {
  session: SessionSummary;
  onClick: () => void;
  compact?: boolean;
}) {
  const color = session.sessionTypeColor ?? '#6366f1';
  const isFull = session.bookedCount >= session.capacity;

  return (
    <button
      onClick={onClick}
      className="w-full h-full overflow-hidden text-left rounded-md border border-transparent px-1.5 py-1 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      style={{
        borderLeftColor: color,
        borderLeftWidth: 3,
        backgroundColor: hexToRgba(color, 0.12),
      }}
      data-testid={`card-session-${session.id}`}
    >
      {compact ? (
        <p className="truncate text-[9px] font-bold leading-tight" style={{ color }}>
          {session.name}
        </p>
      ) : (
        <>
          <p className="truncate text-[10px] font-bold leading-tight" style={{ color }}>
            {session.name}
          </p>
          <p className="mt-0.5 text-[9px] leading-tight text-muted-foreground">
            {formatSessionTime(session.startTime)} · {session.durationMinutes}m
          </p>
          <div className="mt-0.5 flex items-center gap-0.5">
            <Users size={8} className={isFull ? 'text-destructive' : 'text-muted-foreground'} />
            <span className={cx('text-[8px] font-semibold', isFull ? 'text-destructive' : 'text-muted-foreground')}>
              {session.bookedCount}/{session.capacity}
            </span>
            {session.myBookingStatus === 'BOOKED' && (
              <span className="ml-0.5 text-[8px] font-bold text-primary">✓</span>
            )}
            {session.myBookingStatus === 'ATTENDED' && (
              <span className="ml-0.5 text-[8px] font-bold text-[hsl(162_39%_37%)]">✓</span>
            )}
          </div>
        </>
      )}
    </button>
  );
}

// ─── Session Detail Drawer ────────────────────────────────────────────────────

interface DrawerProps {
  sessionId: string;
  isCoach: boolean;
  currentUserId: string;
  weekStartStr: string;
  weekEndStr: string;
  onClose: () => void;
  onOpenEdit: (s: SessionDetail) => void;
}

function SessionDetailDrawer({
  sessionId,
  isCoach,
  currentUserId,
  weekStartStr,
  weekEndStr,
  onClose,
  onOpenEdit,
}: DrawerProps) {
  const qc = useQueryClient();

  const { data: session, isLoading, isError, refetch } = useQuery<SessionDetail>({
    queryKey: ['session-detail', sessionId],
    queryFn: () => apiFetch<SessionDetail>(`/api/sessions/${sessionId}`),
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['sessions', weekStartStr, weekEndStr] });
    qc.invalidateQueries({ queryKey: ['session-detail', sessionId] });
  }, [qc, weekStartStr, weekEndStr, sessionId]);

  const bookMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/sessions/${sessionId}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  });

  const cancelBookingMutation = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch(`/api/sessions/${sessionId}/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  });

  const attendanceMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: string }) =>
      apiFetch(`/api/sessions/${sessionId}/bookings/${bookingId}/attendance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/sessions/${sessionId}/mark-all-attended`, { method: 'POST' }),
    onSuccess: invalidate,
  });

  const cancelSessionMutation = useMutation({
    mutationFn: () => apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const myBooking = session?.bookings.find(
    (b) => b.memberId === currentUserId && (b.status === 'BOOKED' || b.status === 'ATTENDED'),
  );
  const hasBooked = !!myBooking;
  const isFull = session ? session.bookedCount >= session.capacity : false;
  const hasActiveBookings = session?.bookings.some((b) => b.status === 'BOOKED') ?? false;

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-6 w-48 rounded" />
                <div className="skeleton h-4 w-32 rounded" />
              </div>
            ) : session ? (
              <>
                <div
                  className="mb-1.5 h-1 w-10 rounded-full"
                  style={{ backgroundColor: session.sessionTypeColor ?? '#6366f1' }}
                />
                <h2 className="text-xl font-bold tracking-tight">{session.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(session.date + 'T12:00:00').toLocaleDateString('en-IE', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                  {' · '}
                  {formatSessionTime(session.startTime)}–{formatSessionTime(getEndTime(session.startTime, session.durationMinutes))}
                </p>
                {session.location && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin size={12} /> {session.location}
                  </p>
                )}
                {session.coachName && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users size={12} /> {session.coachName}
                  </p>
                )}
                {session.sessionTypeName && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={12} /> {session.sessionTypeName}
                  </p>
                )}
              </>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            data-testid="button-close-drawer"
          >
            <X size={18} />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="px-6 py-10 text-center">
            <AlertCircle size={20} className="mx-auto mb-2 text-destructive" />
            <p className="text-sm font-semibold text-destructive">Failed to load session</p>
            <button onClick={() => refetch()} className="mt-3 text-xs font-bold underline underline-offset-4">
              Retry
            </button>
          </div>
        )}

        {session && (
          <div className="flex-1 space-y-5 px-6 py-5">
            {/* Capacity bar */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span>Capacity</span>
                <span className={cx(isFull ? 'text-destructive' : 'text-foreground')}>
                  {session.bookedCount} / {session.capacity}
                  {isFull && ' — Full'}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cx('h-full rounded-full transition-all', isFull ? 'bg-destructive' : 'bg-primary')}
                  style={{ width: `${Math.min(100, (session.bookedCount / session.capacity) * 100)}%` }}
                />
              </div>
            </div>

            {/* Member: book / cancel */}
            {!isCoach && session.status !== 'CANCELLED' && (
              <div>
                {hasBooked ? (
                  <button
                    onClick={() => cancelBookingMutation.mutate(myBooking!.id)}
                    disabled={cancelBookingMutation.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                    data-testid="button-cancel-booking"
                  >
                    {cancelBookingMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {cancelBookingMutation.isPending ? 'Cancelling…' : 'Booked — tap to cancel'}
                  </button>
                ) : (
                  <button
                    onClick={() => bookMutation.mutate()}
                    disabled={bookMutation.isPending || isFull}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50 disabled:translate-y-0"
                    data-testid="button-book-session"
                  >
                    {bookMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {bookMutation.isPending ? 'Booking…' : isFull ? 'Session full' : 'Book place'}
                  </button>
                )}
                {(bookMutation.isError || cancelBookingMutation.isError) && (
                  <p className="mt-2 text-center text-xs text-destructive">
                    {(bookMutation.error as Error | null)?.message ??
                      (cancelBookingMutation.error as Error | null)?.message ??
                      'Something went wrong'}
                  </p>
                )}
              </div>
            )}

            {/* Cancelled banner */}
            {session.status === 'CANCELLED' && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm font-semibold text-destructive">
                This session has been cancelled
              </div>
            )}

            {/* Linked workout — tappable link for coaches */}
            {session.workout && (
              <Link
                href={`/workouts/${session.workout.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 transition hover:border-primary/40 hover:bg-muted/60"
                data-testid="link-open-workout"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Today's workout
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                    <Dumbbell size={13} className="shrink-0 text-muted-foreground" />
                    {session.workout.name}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </Link>
            )}

            {/* Notes */}
            {session.notes && (
              <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Notes</p>
                <p className="mt-1 text-sm text-muted-foreground">{session.notes}</p>
              </div>
            )}

            {/* Bookings list — coach */}
            {isCoach && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Bookings ({session.bookedCount}/{session.capacity})
                  </h3>
                  {hasActiveBookings && (
                    <button
                      onClick={() => markAllMutation.mutate()}
                      disabled={markAllMutation.isPending}
                      className="text-[11px] font-bold text-primary hover:underline underline-offset-2 disabled:opacity-50"
                      data-testid="button-mark-all-attended"
                    >
                      {markAllMutation.isPending ? 'Saving…' : 'Mark all attended'}
                    </button>
                  )}
                </div>

                {session.bookings.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No bookings yet</p>
                ) : (
                  <div className="space-y-2">
                    {session.bookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5"
                        data-testid={`row-booking-${booking.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{booking.memberName}</p>
                          <p className="truncate text-xs text-muted-foreground">{booking.memberEmail}</p>
                          {booking.feeAmountCents != null && (
                            <p className="mt-0.5 text-[10px] text-orange-600 font-semibold">
                              Fee: €{(booking.feeAmountCents / 100).toFixed(2)}
                            </p>
                          )}
                        </div>
                        <span
                          className={cx(
                            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            STATUS_COLORS[booking.status] ?? 'bg-muted text-muted-foreground',
                          )}
                        >
                          {STATUS_LABELS[booking.status] ?? booking.status}
                        </span>
                        {booking.status === 'BOOKED' && (
                          <div className="flex shrink-0 gap-1">
                            <button
                              onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: 'ATTENDED' })}
                              disabled={attendanceMutation.isPending}
                              className="rounded-lg px-2 py-1 text-[11px] font-bold text-[hsl(162_39%_37%)] hover:bg-[hsl(162_39%_44%/0.12)] disabled:opacity-50"
                              title="Mark attended"
                              data-testid={`button-attended-${booking.id}`}
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: 'NO_SHOW' })}
                              disabled={attendanceMutation.isPending}
                              className="rounded-lg px-2 py-1 text-[11px] font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              title="Mark no-show"
                              data-testid={`button-noshow-${booking.id}`}
                            >
                              ✗
                            </button>
                            <button
                              onClick={() => cancelBookingMutation.mutate(booking.id)}
                              disabled={cancelBookingMutation.isPending}
                              className="rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                              title="Cancel booking"
                              data-testid={`button-cancel-booking-${booking.id}`}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {(booking.status === 'ATTENDED' || booking.status === 'NO_SHOW') && (
                          <button
                            onClick={() => attendanceMutation.mutate({ bookingId: booking.id, status: 'BOOKED' })}
                            disabled={attendanceMutation.isPending}
                            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            title="Revert to booked"
                            data-testid={`button-revert-${booking.id}`}
                          >
                            ↩
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Coach session actions */}
            {isCoach && session.status !== 'CANCELLED' && (
              <div className="flex gap-2 border-t border-border pt-4">
                <button
                  onClick={() => onOpenEdit(session)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-sm font-bold text-foreground transition hover:bg-muted"
                  data-testid="button-edit-session"
                >
                  <Edit2 size={14} /> Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Cancel "${session.name}"? This cannot be undone.`)) {
                      cancelSessionMutation.mutate();
                    }
                  }}
                  disabled={cancelSessionMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-destructive/40 py-2 text-sm font-bold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                  data-testid="button-cancel-session"
                >
                  {cancelSessionMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Trash2 size={14} />
                  )}
                  Cancel session
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Create / Edit Session Modal ──────────────────────────────────────────────

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Display index → JS getDay() value (Mon=1 ... Sun=0)
const DISPLAY_TO_JS_DAY = [1, 2, 3, 4, 5, 6, 0];

// 15-minute interval time slots 05:00–22:00
const TIME_SLOTS: string[] = [];
for (let h = 5; h <= 22; h++) {
  for (const m of [0, 15, 30, 45]) {
    if (h === 22 && m > 0) break;
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

interface CreateModalProps {
  sessionTypes: SessionType[];
  sessionTypesLoading: boolean;
  sessionTypesError: boolean;
  defaultDate: string;
  editSession: SessionDetail | null;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateSessionModal({
  sessionTypes,
  sessionTypesLoading,
  sessionTypesError,
  defaultDate,
  editSession,
  onClose,
  onSuccess,
}: CreateModalProps) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    sessionTypeId: editSession?.sessionTypeId ?? sessionTypes[0]?.id ?? '',
    name: editSession?.name ?? '',
    date: editSession?.date ?? defaultDate,
    startTime: editSession?.startTime ?? '06:00',
    durationMinutes: editSession?.durationMinutes ?? 60,
    capacity: editSession?.capacity ?? 12,
    location: editSession?.location ?? '',
    notes: editSession?.notes ?? '',
  });
  const [recurring, setRecurring] = useState(false);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [openEndDate, setOpenEndDate] = useState(false);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(defaultDate + 'T12:00:00');
    d.setDate(d.getDate() + 27);
    return toYMD(d);
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        sessionTypeId: form.sessionTypeId || undefined,
        name: form.name,
        startTime: form.startTime,
        durationMinutes: form.durationMinutes,
        capacity: form.capacity,
        location: form.location || undefined,
        notes: form.notes || undefined,
      };

      if (editSession) {
        return apiFetch(`/api/sessions/${editSession.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, date: form.date }),
        });
      }

      if (recurring) {
        return apiFetch('/api/sessions/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...body,
            daysOfWeek,
            startDate: form.date,
            ...(openEndDate ? {} : { endDate }),
          }),
        });
      }

      return apiFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, date: form.date }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] });
      if (editSession) {
        qc.invalidateQueries({ queryKey: ['session-detail', editSession.id] });
      }
      onSuccess();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleTypeChange(id: string) {
    const st = sessionTypes.find((t) => t.id === id);
    setForm((f) => ({
      ...f,
      sessionTypeId: id,
      name: f.name || st?.name || f.name,
      durationMinutes: st?.defaultDurationMinutes ?? f.durationMinutes,
      capacity: st?.defaultCapacity ?? f.capacity,
    }));
  }

  function toggleDay(displayIdx: number) {
    const jsDay = DISPLAY_TO_JS_DAY[displayIdx];
    setDaysOfWeek((prev) =>
      prev.includes(jsDay) ? prev.filter((d) => d !== jsDay) : [...prev, jsDay],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (recurring && !editSession && daysOfWeek.length === 0) {
      setError('Select at least one day of the week');
      return;
    }
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl" style={{ maxHeight: '90dvh' }}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-bold">{editSession ? 'Edit Session' : 'New Session'}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {/* Session type */}
          <label className="block text-xs font-semibold">
            Session type
            <select
              value={form.sessionTypeId}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={sessionTypesLoading || sessionTypesError}
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              data-testid="select-session-type"
            >
              {sessionTypesLoading && <option value="">Loading…</option>}
              {sessionTypesError && <option value="">⚠ Could not load session types</option>}
              {!sessionTypesLoading && !sessionTypesError && (
                <>
                  <option value="">— None —</option>
                  {sessionTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </>
              )}
            </select>
            {!sessionTypesLoading && !sessionTypesError && sessionTypes.length === 0 && (
              <p className="mt-1.5 text-[11px] text-amber-600 font-medium">
                No session types found. Run the seed script on Replit to add SGPT, Hyrox etc.
              </p>
            )}
          </label>

          {/* Name */}
          <label className="block text-xs font-semibold">
            Name *
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. SGPT — Morning"
              required
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60"
              data-testid="input-session-name"
            />
          </label>

          {/* Recurring toggle (create only) */}
          {!editSession && (
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="rounded"
                data-testid="toggle-recurring"
              />
              Recurring schedule
            </label>
          )}

          {/* Date — single or start date */}
          <label className="block text-xs font-semibold">
            {recurring && !editSession ? 'Start date *' : 'Date *'}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
              className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              data-testid="input-session-date"
            />
          </label>

          {/* Recurring: days of week + end date */}
          {recurring && !editSession && (
            <>
              <div>
                <p className="mb-1.5 text-xs font-semibold">Days of week *</p>
                <div className="flex gap-1">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={cx(
                        'flex-1 rounded-lg py-1.5 text-[11px] font-bold transition',
                        daysOfWeek.includes(DISPLAY_TO_JS_DAY[i])
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                      data-testid={`toggle-day-${label.toLowerCase()}`}
                    >
                      {label[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-semibold">End date</p>
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={openEndDate}
                      onChange={(e) => setOpenEndDate(e.target.checked)}
                      className="rounded"
                      data-testid="toggle-open-end-date"
                    />
                    No end date
                  </label>
                </div>
                {openEndDate ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Runs for 1 year from start date
                  </div>
                ) : (
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={form.date}
                    required={!openEndDate}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    data-testid="input-end-date"
                  />
                )}
              </div>
            </>
          )}

          {/* Start time + duration */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">
              Start time *
              <select
                value={TIME_SLOTS.includes(form.startTime) ? form.startTime : TIME_SLOTS[4]}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                data-testid="input-start-time"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{formatSessionTime(t)}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Duration (min) *
              <input
                type="number"
                value={form.durationMinutes}
                min={5}
                onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))}
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                data-testid="input-duration"
              />
            </label>
          </div>

          {/* Capacity + location */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold">
              Capacity *
              <input
                type="number"
                value={form.capacity}
                min={1}
                onChange={(e) => setForm((f) => ({ ...f, capacity: Number(e.target.value) }))}
                required
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                data-testid="input-capacity"
              />
            </label>
            <label className="block text-xs font-semibold">
              Location
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Main floor"
                className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60"
                data-testid="input-location"
              />
            </label>
          </div>

          {/* Notes */}
          <label className="block text-xs font-semibold">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes for members…"
              className="mt-1.5 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60"
              data-testid="input-notes"
            />
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-foreground transition hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-55 disabled:translate-y-0"
              data-testid="button-submit-session"
            >
              {mutation.isPending ? (
                <><Loader2 size={14} className="animate-spin" /> Saving…</>
              ) : editSession ? (
                'Save changes'
              ) : recurring ? (
                `Create sessions`
              ) : (
                'Create session'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SchedulePage ─────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user } = useAuth();
  const { mode } = useMode();
  const isCoach =
    (user?.role === 'COACH' || user?.role === 'OWNER' || user?.role === 'ADMIN') &&
    mode !== 'MEMBER_PREVIEW';

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [selectedDay, setSelectedDay] = useState(() => toYMD(new Date()));
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionDetail | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toYMD(addDays(weekStart, i))),
    [weekStart],
  );
  const weekStartStr = weekDates[0];
  const weekEndStr = weekDates[6];
  const today = toYMD(new Date());

  const sessionsQuery = useQuery<SessionSummary[]>({
    queryKey: ['sessions', weekStartStr, weekEndStr],
    queryFn: () => apiFetch<SessionSummary[]>(`/api/sessions?start=${weekStartStr}&end=${weekEndStr}`),
  });

  const sessionTypesQuery = useQuery<SessionType[]>({
    queryKey: ['session-types'],
    queryFn: () => apiFetch<SessionType[]>('/api/session-types'),
    enabled: isCoach,
  });

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionSummary[]>();
    for (const s of sessionsQuery.data ?? []) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessionsQuery.data]);

  function openCreate() {
    setEditSession(null);
    setCreateOpen(true);
  }

  function openEdit(s: SessionDetail) {
    setSelectedSessionId(null);
    setEditSession(s);
    setCreateOpen(true);
  }

  const daySessions = viewMode === 'day' ? (sessionsByDate.get(selectedDay) ?? []) : [];

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="studio-label">{isCoach ? 'Coach tools' : 'Your training'}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-.04em]">Schedule</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Week nav */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1">
            <button
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              data-testid="button-prev-week"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="studio-mono px-2 text-[11px] text-foreground select-none">
              {formatWeekLabel(weekStart)}
            </span>
            <button
              onClick={() => setWeekStart((d) => addDays(d, 7))}
              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              data-testid="button-next-week"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            onClick={() => {
              setWeekStart(getWeekStart(new Date()));
              setSelectedDay(today);
            }}
            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"
            data-testid="button-today"
          >
            Today
          </button>

          {/* Week / Day toggle */}
          <div className="flex rounded-xl border border-border bg-card p-1">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setViewMode(v);
                  if (v === 'day') setSelectedDay(today);
                }}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition',
                  viewMode === v
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                data-testid={`button-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>

          {isCoach && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"
              data-testid="button-new-session"
            >
              <Plus size={15} /> New session
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {sessionsQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {sessionsQuery.isError && (
        <div className="studio-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <AlertCircle size={20} className="text-destructive" />
          <p className="text-sm font-semibold">Couldn't load sessions</p>
          <button
            onClick={() => sessionsQuery.refetch()}
            className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <RotateCcw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Week view */}
      {!sessionsQuery.isLoading && !sessionsQuery.isError && viewMode === 'week' && (
        <div className="overflow-x-auto -mx-5 px-5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          <div className="min-w-[600px] pb-4">
            {/* Day header row */}
            <div className="flex pb-2">
              <div className="w-12 shrink-0" />
              <div className="grid flex-1 grid-cols-7 gap-px">
                {weekDates.map((date) => {
                  const { day, date: dateNum, isToday } = formatDayHeader(date);
                  return (
                    <div
                      key={date}
                      className={cx(
                        'flex flex-col items-center rounded-xl py-2',
                        isToday ? 'bg-primary/15' : 'bg-muted/40',
                      )}
                    >
                      <span
                        className={cx(
                          'studio-mono text-[10px] uppercase tracking-wide',
                          isToday ? 'font-bold text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {day}
                      </span>
                      <span
                        className={cx(
                          'mt-0.5 text-lg font-bold leading-none',
                          isToday ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {dateNum}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Time grid */}
            <div className="flex">
              {/* Hour labels */}
              <div className="relative w-12 shrink-0" style={{ height: GRID_HEIGHT }}>
                {GRID_HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2"
                    style={{ top: (h - GRID_START_HOUR) * PX_PER_HOUR - 6 }}
                  >
                    <span className="studio-mono text-[9px] leading-none text-muted-foreground/50">
                      {formatHourLabel(h)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grid body: hour lines + day columns */}
              <div
                className="relative flex-1 border-l border-border/30"
                style={{ height: GRID_HEIGHT }}
              >
                {/* Hour lines */}
                {GRID_HOURS.map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute left-0 right-0 border-t border-border/30"
                    style={{ top: (h - GRID_START_HOUR) * PX_PER_HOUR }}
                  />
                ))}

                {/* Day columns */}
                <div className="absolute inset-0 grid grid-cols-7">
                  {weekDates.map((date) => (
                    <div
                      key={date}
                      className="relative border-r border-border/20"
                      data-testid={`col-day-${date}`}
                    >
                      {(sessionsByDate.get(date) ?? []).map((s) => {
                        const top = timeToPixels(s.startTime);
                        const height = Math.max(s.durationMinutes * PX_PER_MIN, 28);
                        return (
                          <div
                            key={s.id}
                            className="absolute inset-x-0.5"
                            style={{ top, height }}
                          >
                            <SessionCard
                              session={s}
                              onClick={() => setSelectedSessionId(s.id)}
                              compact={height < 44}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day view */}
      {!sessionsQuery.isLoading && !sessionsQuery.isError && viewMode === 'day' && (
        <div>
          {/* Day picker */}
          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
            {weekDates.map((date) => {
              const { day, date: dateNum, isToday } = formatDayHeader(date);
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDay(date)}
                  className={cx(
                    'flex shrink-0 flex-col items-center rounded-xl px-4 py-2.5 text-center transition',
                    selectedDay === date
                      ? 'bg-primary text-primary-foreground'
                      : isToday
                      ? 'bg-muted font-bold text-foreground'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted',
                  )}
                  data-testid={`button-day-${date}`}
                >
                  <span className="text-[10px] uppercase tracking-wide">{day}</span>
                  <span className="text-lg font-bold leading-none">{dateNum}</span>
                </button>
              );
            })}
          </div>

          {daySessions.length === 0 ? (
            <div className="studio-card flex flex-col items-center justify-center px-6 py-16 text-center">
              <Sparkles size={20} className="mb-3 text-muted-foreground" />
              <p className="text-sm font-semibold">No sessions today</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isCoach ? 'Create one to get started.' : 'Check another day or come back later.'}
              </p>
              {isCoach && (
                <button
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5"
                >
                  <Plus size={14} /> Add session
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {daySessions.map((s) => {
                const isFull = s.bookedCount >= s.capacity;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className="studio-card studio-card-hover w-full p-4 text-left flex items-start gap-4"
                    style={{ borderLeftColor: s.sessionTypeColor ?? '#6366f1', borderLeftWidth: 3 }}
                    data-testid={`card-session-day-${s.id}`}
                  >
                    <div className="shrink-0 min-w-[52px] text-center">
                      <p className="studio-mono text-sm font-bold">{formatSessionTime(s.startTime)}</p>
                      <p className="studio-mono text-[10px] text-muted-foreground">
                        <Clock3 size={9} className="inline mr-0.5" />{s.durationMinutes}m
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{s.name}</p>
                      {s.coachName && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{s.coachName}</p>
                      )}
                      {s.location && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin size={11} /> {s.location}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={cx('flex items-center gap-1 text-xs font-semibold', isFull ? 'text-destructive' : 'text-muted-foreground')}>
                        <Users size={13} /> {s.bookedCount}/{s.capacity}
                      </span>
                      {s.myBookingStatus === 'BOOKED' && (
                        <p className="mt-1 text-[10px] font-bold text-primary">✓ Booked</p>
                      )}
                      {s.myBookingStatus === 'ATTENDED' && (
                        <p className="mt-1 text-[10px] font-bold text-[hsl(162_39%_37%)]">✓ Attended</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Session detail drawer */}
      {selectedSessionId && (
        <SessionDetailDrawer
          sessionId={selectedSessionId}
          isCoach={isCoach}
          currentUserId={user?.id ?? ''}
          weekStartStr={weekStartStr}
          weekEndStr={weekEndStr}
          onClose={() => setSelectedSessionId(null)}
          onOpenEdit={openEdit}
        />
      )}

      {/* Create / Edit modal */}
      {createOpen && (
        <CreateSessionModal
          sessionTypes={sessionTypesQuery.data ?? []}
          sessionTypesLoading={sessionTypesQuery.isLoading}
          sessionTypesError={sessionTypesQuery.isError}
          defaultDate={viewMode === 'day' ? selectedDay : weekStartStr}
          editSession={editSession}
          onClose={() => { setCreateOpen(false); setEditSession(null); }}
          onSuccess={() => { setCreateOpen(false); setEditSession(null); }}
        />
      )}
    </div>
  );
}
