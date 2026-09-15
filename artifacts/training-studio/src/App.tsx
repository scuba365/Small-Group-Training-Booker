import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Dumbbell,
  Flame,
  Gauge,
  Home,
  MapPin,
  Menu,
  Minus,
  MoveRight,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey,
  getGetWorkoutQueryKey,
  getListSessionsQueryKey,
  useBookSession,
  useCancelSessionBooking,
  useCompleteWorkout,
  useGetDashboard,
  useGetWorkout,
  useListMembers,
  useListSessions,
  useListWorkouts,
} from '@workspace/api-client-react';
import type {
  Dashboard,
  Member,
  ProgressMetric,
  TrainingSession,
  Workout,
  WorkoutLog,
} from '@workspace/api-client-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { ModeProvider, useMode } from '@/context/mode-context';
import Login from '@/pages/login';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import ExerciseLibrary from '@/pages/exercise-library';
import ProgrammeBuilder, { ProgrammeList } from '@/pages/programme-builder';
import MyProgramme from '@/pages/my-programme';
import WorkoutSession from '@/pages/workout-session';
import CoachMonitoring from '@/pages/coach-monitoring';
import CoachWorkoutDetail from '@/pages/coach-workout-detail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingPage />;
  if (!user) return <Redirect to="/login" />;
  return <Component />;
}

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' ');

function dateValue(value: string) {
  return new Date(value);
}

function formatTime(value: string) {
  return dateValue(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(value: string) {
  return dateValue(value).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function relativeDate(value: string) {
  const date = dateValue(value);
  const day = new Date();
  const diff = Math.round((day.getTime() - date.getTime()) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return formatDay(value);
}

function LoadingPage({ label = 'Loading your studio' }: { label?: string }) {
  return (
    <div className="space-y-5" data-testid="status-loading">
      <div className="space-y-2">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-10 w-64 rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
      <div className="skeleton h-64 rounded-2xl" />
      <p className="studio-label">{label}</p>
    </div>
  );
}

function ErrorState({ onRetry, label = 'We hit a snag loading this view.' }: { onRetry: () => void; label?: string }) {
  return (
    <div className="studio-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center" data-testid="status-error">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive"><CircleAlert size={21} /></div>
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">Give it another try. Your training history is safe.</p>
      <button className="mt-2 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground transition hover:opacity-85" onClick={onRetry} data-testid="button-retry">
        <RotateCcw size={15} /> Try again
      </button>
    </div>
  );
}

function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="studio-card flex flex-col items-center justify-center px-6 py-16 text-center" data-testid="status-empty">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-foreground"><Sparkles size={21} /></div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{detail}</p>
      {action}
    </div>
  );
}

function Avatar({ initials, color, size = 'md' }: { initials: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dimensions = size === 'lg' ? 'h-14 w-14 text-base' : size === 'sm' ? 'h-8 w-8 text-[10px]' : 'h-10 w-10 text-xs';
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-xl font-bold text-foreground', dimensions)} style={{ backgroundColor: color || 'hsl(var(--primary))' }} data-testid={`avatar-${initials}`}>
      {initials}
    </div>
  );
}

function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warm' | 'teal' | 'coral' }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground',
    warm: 'bg-primary/25 text-foreground',
    teal: 'bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]',
    coral: 'bg-accent/15 text-[hsl(12_58%_42%)]',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em]', tones[tone])}>{children}</span>;
}

interface OrgMember { id: string; name: string; email: string; role: string; }

function ModeBar() {
  const { user } = useAuth();
  const { mode, previewMember, setMode, setPreviewMember, exitPreview } = useMode();
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);

  const isCoach = user?.role === 'COACH' || user?.role === 'OWNER';
  if (!isCoach) return null;

  async function openPicker() {
    try {
      const res = await fetch('/api/coach/members', { credentials: 'include' });
      if (res.ok) setMembers(await res.json());
    } catch {}
    setMemberPickerOpen(true);
  }

  function selectMember(m: OrgMember) {
    setPreviewMember(m);
    setMode('MEMBER_PREVIEW');
    setMemberPickerOpen(false);
  }

  if (mode === 'MEMBER_PREVIEW') {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        MEMBER PREVIEW — {previewMember?.name ?? 'Unknown'}
        <button
          onClick={exitPreview}
          className="ml-2 rounded px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/40 transition text-xs"
        >
          Exit
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-semibold">
        <span className="px-3 py-1.5 bg-primary text-primary-foreground">COACH</span>
        <button
          onClick={openPicker}
          className="px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition"
        >
          MEMBER PREVIEW
        </button>
      </div>
      {memberPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMemberPickerOpen(false)}>
          <div className="bg-card rounded-2xl border border-border shadow-xl w-80 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">Preview as member</h3>
              <button onClick={() => setMemberPickerOpen(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => selectMember(m)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted transition"
                  >
                    <Avatar initials={m.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const { user, logout } = useAuth();
  const { mode, previewMember } = useMode();

  const isCoach = user?.role === 'COACH' || user?.role === 'OWNER';
  const links = isCoach ? [
    { href: '/', label: 'Overview', icon: Home },
    { href: '/schedule', label: 'Schedule', icon: CalendarDays },
    { href: '/exercises', label: 'Exercises', icon: Dumbbell },
    { href: '/programmes', label: 'Programmes', icon: BarChart3 },
    { href: '/members', label: 'Roster', icon: Users },
    { href: '/coach/monitoring', label: 'Monitoring', icon: TrendingUp },
  ] : [
    { href: '/', label: 'Overview', icon: Home },
    { href: '/my-programme', label: 'My Programme', icon: BarChart3 },
    { href: '/workouts', label: 'Workouts', icon: Dumbbell },
  ];

  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground lg:flex">
        <Link href="/" className="mb-12 flex items-center gap-3 px-2" data-testid="link-brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Dumbbell size={19} strokeWidth={2.5} /></span>
          <span><span className="block text-[15px] font-bold tracking-tight">Barracks</span><span className="block text-[15px] font-bold tracking-tight text-sidebar-primary">OS</span></span>
        </Link>
        <p className="studio-label px-3 text-sidebar-foreground/45">{isCoach ? 'Coach tools' : 'Your training'}</p>
        <nav className="mt-3 space-y-1" aria-label="Primary navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={cx('group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition', active(href) ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')} data-testid={`link-nav-${label.toLowerCase()}`}>
              <Icon size={18} className={active(href) ? 'text-sidebar-primary' : ''} />
              {label}
              {active(href) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <Avatar initials={initials} color="hsl(12 76% 65%)" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name ?? 'User'}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user?.email}</p>
            </div>
            <button
              onClick={() => logout()}
              className="rounded-lg p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground text-xs"
              title="Sign out"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur lg:ml-[248px] lg:px-10">
        <div className="flex items-center gap-3 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary"><Dumbbell size={17} /></span>
          <span className="font-bold">Barracks OS</span>
        </div>
        <div className="hidden lg:block">
          <span className="studio-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">
            {isCoach ? 'Coach / ' : 'Member / '}
          </span>
          <span className="studio-mono text-[10px] uppercase tracking-[.18em] text-foreground">
            {location === '/' ? 'overview' : location.replace('/', '')}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ModeBar />
          <Avatar initials={initials} color="hsl(12 76% 65%)" size="sm" />
        </div>
      </header>

      {/* Member preview banner */}
      {mode === 'MEMBER_PREVIEW' && (
        <div className="lg:ml-[248px] bg-amber-500/10 border-b border-amber-500/20 px-5 py-2 text-xs text-amber-700 dark:text-amber-400 lg:px-10">
          Viewing as <strong>{previewMember?.name}</strong> — this is a coach preview. Member cannot see this bar.
        </div>
      )}

      {mobileNav && <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setMobileNav(false)}><div className="w-72 bg-sidebar p-5 text-sidebar-foreground" onClick={(event) => event.stopPropagation()}><div className="mb-8 flex items-center justify-between"><span className="font-bold">Menu</span><button onClick={() => setMobileNav(false)} data-testid="button-close-menu"><X size={18} /></button></div>{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileNav(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm" data-testid={`link-mobile-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}</div></div>}
      <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 lg:ml-[248px] lg:px-10 lg:py-10">{children}</main>
      <nav className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-around rounded-2xl border border-border bg-card/95 p-2 shadow-xl backdrop-blur lg:hidden">
        {links.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cx('flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold', active(href) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')} data-testid={`link-bottom-${label.toLowerCase()}`}><Icon size={17} />{label}</Link>)}
      </nav>
    </div>
  );
}

function PageIntro({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end studio-rise"><div><p className="studio-label">{eyebrow}</p><h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-[2.6rem]">{title}</h1>{detail && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function SectionHeading({ label, action }: { label: string; action?: ReactNode }) {
  return <div className="mb-4 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-[.1em] text-muted-foreground">{label}</h2>{action}</div>;
}

function SessionCard({ session, onToggle, busy }: { session: TrainingSession; onToggle: (session: TrainingSession) => void; busy?: boolean }) {
  const spotsLeft = session.spotsTotal - session.spotsTaken;
  return (
    <article className="studio-card studio-card-hover relative overflow-hidden border-l-4 p-4" style={{ borderLeftColor: session.accent || 'hsl(var(--primary))' }} data-testid={`card-session-${session.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><Badge tone="warm">{session.tag}</Badge><Badge>{session.level}</Badge></div><h3 className="mt-3 text-lg font-bold tracking-tight">{session.title}</h3><p className="mt-1 text-sm text-muted-foreground">{session.focus}</p></div>
        <div className="studio-mono text-right text-[11px] leading-5 text-muted-foreground"><p className="font-medium text-foreground">{formatDay(session.startAt)}</p><p>{formatTime(session.startAt)} – {formatTime(session.endAt)}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Users size={14} />{session.coachName}</span><span className="inline-flex items-center gap-1.5"><MapPin size={14} />{session.location}</span></div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
        <div className="flex items-center gap-2"><div className="flex gap-1">{Array.from({ length: session.spotsTotal }).map((_, index) => <span key={index} className={cx('h-1.5 w-4 rounded-full', index < session.spotsTaken ? 'bg-foreground/25' : 'bg-primary')} />)}</div><span className="studio-mono text-[10px] text-muted-foreground">{spotsLeft > 0 ? `${spotsLeft} ${spotsLeft === 1 ? 'place' : 'places'} left` : 'Full'}</span></div>
        <button disabled={busy || (!session.booked && spotsLeft <= 0)} onClick={() => onToggle(session)} className={cx('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-45', session.booked ? 'border border-border bg-transparent text-muted-foreground hover:border-destructive/40 hover:text-destructive' : 'bg-primary text-primary-foreground hover:-translate-y-0.5')} data-testid={`button-${session.booked ? 'cancel' : 'book'}-${session.id}`}>
          {busy ? 'Saving…' : session.booked ? <><Check size={14} /> Booked</> : <><Plus size={14} /> Book place</>}
        </button>
      </div>
    </article>
  );
}

function DashboardPage() {
  const query = useGetDashboard();
  const dashboard = query.data as Dashboard | undefined;
  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !dashboard) return <ErrorState onRetry={() => query.refetch()} />;
  return (
    <div>
      <PageIntro eyebrow={dashboard.weekLabel} title={`Good morning, ${dashboard.memberName.split(' ')[0]}.`} detail="Your next best move is already on the board. Here's the shape of your week." action={<Link href="/schedule" className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-bold text-secondary-foreground transition hover:-translate-y-0.5" data-testid="link-browse-schedule"><CalendarDays size={16} /> Browse schedule</Link>} />
      <div className="grid gap-4 sm:grid-cols-3 studio-rise studio-delay-1">
        <MetricTile icon={<Flame size={18} />} label="Current streak" value={`${dashboard.streak}`} unit="weeks" detail="The habit is holding" accent="warm" />
        <MetricTile icon={<CalendarDays size={18} />} label="Booked this week" value={`${dashboard.sessionsBooked}`} unit="sessions" detail="Keep the rhythm" accent="teal" />
        <MetricTile icon={<Gauge size={18} />} label="Readiness" value={`${dashboard.readinessScore}`} unit="/ 100" detail={dashboard.readinessScore >= 75 ? 'Good to push today' : 'Choose a steady pace'} accent="coral" />
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="studio-card relative overflow-hidden bg-secondary p-6 text-secondary-foreground sm:p-8 studio-rise studio-delay-2" data-testid="section-next-session">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[30px] border-primary/15" /><div className="absolute -bottom-28 right-8 h-52 w-52 rounded-full border-[20px] border-primary/10" />
          <div className="relative flex items-center justify-between"><div><p className="studio-label text-secondary-foreground/55">Next session</p>{dashboard.nextSession ? <><h2 className="mt-3 max-w-md text-2xl font-bold tracking-[-.04em] sm:text-3xl">{dashboard.nextSession.title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-secondary-foreground/70">{dashboard.nextSession.focus}</p></> : <h2 className="mt-3 text-2xl font-bold">Nothing booked yet.</h2>}</div><span className="flex h-11 w-11 items-center justify-center rounded-full border border-secondary-foreground/15 text-primary"><MoveRight size={20} /></span></div>
          {dashboard.nextSession && <div className="relative mt-8 flex flex-wrap items-center gap-5 border-t border-secondary-foreground/10 pt-5 text-xs text-secondary-foreground/70"><span className="inline-flex items-center gap-2"><CalendarDays size={14} className="text-primary" />{formatDay(dashboard.nextSession.startAt)}</span><span className="inline-flex items-center gap-2"><Clock3 size={14} className="text-primary" />{formatTime(dashboard.nextSession.startAt)}</span><span className="inline-flex items-center gap-2"><MapPin size={14} className="text-primary" />{dashboard.nextSession.location}</span></div>}
        </section>
        <section className="studio-card p-6 studio-rise studio-delay-2" data-testid="section-week-snapshot"><SectionHeading label="Week at a glance" action={<span className="studio-mono text-[10px] text-muted-foreground">01 — 07</span>} /><div className="flex items-end justify-between gap-2 pt-3">{Array.from({ length: 7 }).map((_, index) => { const active = index === 3 || index === 5; const today = index === 4; return <div className="flex flex-1 flex-col items-center gap-3" key={index}><div className={cx('flex h-20 w-full max-w-9 items-end rounded-full bg-muted p-1', active && 'bg-primary/20')}><span className={cx('block w-full rounded-full transition-all', active ? 'h-[70%] bg-primary' : today ? 'h-[36%] bg-accent' : 'h-[18%] bg-border')} /></div><span className={cx('studio-mono text-[10px]', today ? 'font-bold text-foreground' : 'text-muted-foreground')}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</span></div> })}</div><div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4"><span className="text-xs text-muted-foreground">Training load</span><span className="studio-mono text-xs font-medium">Moderate <span className="ml-1 text-[hsl(162_39%_37%)]">↗ 8%</span></span></div></section>
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <section className="studio-card p-6 studio-rise studio-delay-3" data-testid="section-upcoming"><SectionHeading label="Upcoming sessions" action={<Link href="/schedule" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-see-all-sessions">See all <ChevronRight size={14} /></Link>} />{dashboard.upcoming.length ? <div className="space-y-2">{dashboard.upcoming.slice(0, 3).map((session) => <div key={session.id} className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition hover:border-border hover:bg-muted/40"><div className="flex w-12 flex-col items-center rounded-lg bg-muted py-2"><span className="studio-mono text-[9px] uppercase text-muted-foreground">{dateValue(session.startAt).toLocaleDateString([], { weekday: 'short' })}</span><span className="text-lg font-bold">{dateValue(session.startAt).getDate()}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{session.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatTime(session.startAt)} · {session.coachName}</p></div><Badge tone={session.booked ? 'teal' : 'muted'}>{session.booked ? 'Booked' : session.tag}</Badge></div>)}</div> : <EmptyState title="The week is open" detail="Pick a coached session to give this week some shape." action={<Link href="/schedule" className="mt-4 text-sm font-bold underline underline-offset-4" data-testid="link-empty-schedule">Find a session</Link>} />}</section>
        <section className="studio-card p-6 studio-rise studio-delay-3" data-testid="section-progress"><SectionHeading label="Progress markers" action={<BarChart3 size={16} className="text-muted-foreground" />} /><div className="space-y-5">{dashboard.progress.slice(0, 3).map((metric) => <ProgressLine key={metric.label} metric={metric} />)}</div></section>
      </div>
      <section className="mt-7 studio-card p-6 studio-rise studio-delay-4" data-testid="section-recent-workouts"><SectionHeading label="Recent training" action={<Link href="/workouts" className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-workout-library">Workout library <ChevronRight size={14} /></Link>} />{dashboard.recentWorkouts.length ? <div className="grid gap-3 md:grid-cols-2">{dashboard.recentWorkouts.slice(0, 4).map((log) => <div className="flex items-center gap-3 rounded-xl bg-muted/55 p-3" key={log.id} data-testid={`row-workout-log-${log.id}`}><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/35"><CheckCircle2 size={17} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{log.title}</p><p className="mt-1 text-xs text-muted-foreground">{relativeDate(log.completedAt)} · {log.volume} total volume</p></div><span className="studio-mono text-sm font-bold">{log.score}<span className="text-[10px] text-muted-foreground">/10</span></span></div>)}</div> : <p className="text-sm text-muted-foreground">Complete your first programmed workout to start the log.</p>}</section>
    </div>
  );
}

function MetricTile({ icon, label, value, unit, detail, accent }: { icon: ReactNode; label: string; value: string; unit: string; detail: string; accent: 'warm' | 'teal' | 'coral' }) {
  return <div className="studio-card flex items-start justify-between p-5" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div><div className={cx('mb-4 flex h-9 w-9 items-center justify-center rounded-xl', accent === 'warm' ? 'bg-primary/30' : accent === 'teal' ? 'bg-[hsl(162_39%_44%/0.14)] text-[hsl(162_39%_32%)]' : 'bg-accent/15 text-[hsl(12_58%_42%)]')}>{icon}</div><p className="studio-label">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight">{value}<span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span></p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><TrendingUp size={16} className="text-muted-foreground" /></div>;
}

function ProgressLine({ metric }: { metric: ProgressMetric }) {
  const TrendIcon = metric.trend === 'up' ? ArrowUpRight : metric.trend === 'down' ? ArrowDownRight : Minus;
  return <div data-testid={`progress-${metric.label.toLowerCase().replaceAll(' ', '-')}`}><div className="mb-2 flex items-end justify-between"><div><p className="text-sm font-semibold">{metric.label}</p><p className="studio-mono mt-1 text-lg">{metric.value}<span className="ml-1 text-[10px] text-muted-foreground">{metric.unit}</span></p></div><span className={cx('inline-flex items-center gap-1 text-xs font-bold', metric.trend === 'down' ? 'text-accent' : metric.trend === 'up' ? 'text-[hsl(162_39%_37%)]' : 'text-muted-foreground')}><TrendIcon size={14} />{metric.change}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-foreground/75" style={{ width: metric.trend === 'flat' ? '58%' : metric.trend === 'down' ? '42%' : '76%' }} /></div></div>;
}

function SchedulePage() {
  const [range, setRange] = useState<'week' | 'month'>('week');
  const sessionsQuery = useListSessions({ range });
  const [busyId, setBusyId] = useState<string | null>(null);
  const book = useBookSession();
  const cancel = useCancelSessionBooking();
  const sessions = sessionsQuery.data as TrainingSession[] | undefined;
  const grouped = useMemo(() => {
    if (!sessions) return [];
    return sessions.reduce<Record<string, TrainingSession[]>>((acc, session) => { const key = formatDay(session.startAt); (acc[key] ||= []).push(session); return acc; }, {});
  }, [sessions]);
  const handleToggle = (session: TrainingSession) => {
    setBusyId(session.id);
    const mutation = session.booked ? cancel : book;
    mutation.mutate({ sessionId: session.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey({ range }) });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setBusyId(null);
      },
      onError: () => setBusyId(null),
    });
  };
  return <div><PageIntro eyebrow="Your calendar" title="Make room for the work." detail="Small-group sessions, coached closely. Capacity is real, so claim your place when it feels right." action={<div className="flex rounded-xl border border-border bg-card p-1">{(['week', 'month'] as const).map((value) => <button key={value} onClick={() => setRange(value)} className={cx('rounded-lg px-3 py-2 text-xs font-bold capitalize transition', range === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')} data-testid={`button-range-${value}`}>{value}</button>)}</div>} />
    {sessionsQuery.isLoading ? <LoadingPage label="Finding sessions" /> : sessionsQuery.isError ? <ErrorState onRetry={() => sessionsQuery.refetch()} /> : !sessions?.length ? <EmptyState title="No sessions in this window" detail="Try another range. Your coach will add the next block soon." /> : <div className="space-y-8">{Object.entries(grouped).map(([day, daySessions], index) => <section key={day} className={cx('studio-rise', `studio-delay-${Math.min(index + 1, 4)}`)} data-testid={`section-day-${day}`}><div className="mb-3 flex items-center gap-3"><span className="studio-mono text-xs font-medium text-foreground">{day}</span><div className="h-px flex-1 bg-border" /><span className="studio-mono text-[10px] text-muted-foreground">{daySessions.length} {daySessions.length === 1 ? 'session' : 'sessions'}</span></div><div className="grid gap-3 lg:grid-cols-2">{daySessions.map((session) => <SessionCard key={session.id} session={session} onToggle={handleToggle} busy={busyId === session.id} />)}</div></section>)}</div>}
  </div>;
}

function WorkoutCard({ workout }: { workout: Workout }) {
  const exerciseCount = workout.exercises?.length ?? 0;
  return <Link href={`/workouts/${workout.id}`} className="studio-card studio-card-hover group flex min-h-[220px] flex-col justify-between p-5" data-testid={`card-workout-${workout.id}`}><div><div className="flex items-center justify-between"><Badge tone={workout.completed ? 'teal' : 'warm'}>{workout.completed ? 'Complete' : workout.category}</Badge><span className="studio-mono text-[10px] text-muted-foreground">{formatDay(workout.scheduledFor)}</span></div><h2 className="mt-7 text-2xl font-bold tracking-[-.04em]">{workout.title}</h2><p className="mt-1 max-w-[260px] text-sm leading-5 text-muted-foreground">{workout.subtitle}</p></div><div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4"><span className="flex items-center gap-2 text-xs text-muted-foreground"><Timer size={14} />{workout.durationMinutes} min <span className="text-border">/</span> {exerciseCount} exercises</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition group-hover:bg-primary"><ChevronRight size={15} /></span></div></Link>;
}

function WorkoutsPage() {
  const query = useListWorkouts();
  const workouts = query.data as Workout[] | undefined;
  return <div><PageIntro eyebrow="Programmed for you" title="Do the next right thing." detail="Your coach has left the session ready. Follow the line, log the result, keep the signal." action={<div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-[hsl(162_39%_44%)]" />Synced with your plan</div>} />{query.isLoading ? <LoadingPage label="Loading your programming" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : !workouts?.length ? <EmptyState title="Your program is taking shape" detail="Your next programmed workout will appear here once your coach assigns it." /> : <><div className="mb-5 flex items-center justify-between"><p className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{workouts.length}</span> sessions in your current block</p><div className="studio-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Block 04 / 06</div></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workouts.map((workout, index) => <div key={workout.id} className={cx('studio-rise', `studio-delay-${Math.min(index + 1, 4)}`)}><WorkoutCard workout={workout} /></div>)}</div></>}</div>;
}

function WorkoutDetailPage() {
  const { workoutId } = useParams<{ workoutId: string }>();
  const query = useGetWorkout(workoutId || '', { query: { enabled: !!workoutId, queryKey: getGetWorkoutQueryKey(workoutId || '') } });
  const workout = query.data as Workout | undefined;
  const complete = useCompleteWorkout();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState('8');
  const [volume, setVolume] = useState('0');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<WorkoutLog | null>(null);
  const exercises = workout?.exercises || [];
  const completedCount = exercises.filter((exercise) => checked[exercise.id] ?? exercise.completed).length;
  const submit = () => {
    if (!workoutId) return;
    complete.mutate({ workoutId, data: { score: Number(score), volume: Number(volume), notes } }, { onSuccess: (result) => setSaved(result as WorkoutLog) });
  };
  if (query.isLoading) return <LoadingPage label="Setting up your session" />;
  if (query.isError || !workout) return <ErrorState onRetry={() => query.refetch()} label="This workout couldn't be opened." />;
  return <div className="mx-auto max-w-5xl"><Link href="/workouts" className="mb-7 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground" data-testid="link-back-workouts">← All workouts</Link><div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]"><div><Badge tone={workout.completed ? 'teal' : 'warm'}>{workout.completed ? 'Completed' : workout.category}</Badge><h1 className="mt-4 text-4xl font-bold tracking-[-.06em] sm:text-5xl">{workout.title}</h1><p className="mt-3 max-w-md text-base leading-7 text-muted-foreground">{workout.subtitle}</p><div className="mt-7 flex flex-wrap gap-2"><span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><Timer size={14} />{workout.durationMinutes} minutes</span><span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><Gauge size={14} />{workout.difficulty}</span></div><div className="mt-8 studio-card bg-secondary p-5 text-secondary-foreground"><div className="flex items-center justify-between"><p className="studio-label text-secondary-foreground/50">Session progress</p><span className="studio-mono text-sm text-primary">{completedCount}/{exercises.length}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary-foreground/10"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${exercises.length ? completedCount / exercises.length * 100 : 0}%` }} /></div><p className="mt-4 text-sm leading-6 text-secondary-foreground/70">{completedCount === exercises.length && exercises.length ? 'Everything is checked. Log how it felt.' : 'Move through each line with control. Check it when it is done.'}</p></div></div><div className="studio-card p-5 sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="studio-label">The work</p><h2 className="mt-1 text-xl font-bold">Exercise sequence</h2></div><span className="studio-mono text-[10px] text-muted-foreground">{formatDay(workout.scheduledFor)}</span></div><div className="space-y-2">{exercises.map((exercise, index) => { const isDone = checked[exercise.id] ?? exercise.completed; return <button key={exercise.id} onClick={() => setChecked((current) => ({ ...current, [exercise.id]: !isDone }))} className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition', isDone ? 'border-[hsl(162_39%_44%/0.35)] bg-[hsl(162_39%_44%/0.08)]' : 'border-border hover:border-primary/60')} data-testid={`button-exercise-${exercise.id}`}><span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold', isDone ? 'border-[hsl(162_39%_44%)] bg-[hsl(162_39%_44%)] text-background' : 'border-border text-muted-foreground')}>{isDone ? <Check size={13} /> : `0${index + 1}`}</span><span className="min-w-0 flex-1"><span className={cx('block text-sm font-bold', isDone && 'line-through opacity-60')}>{exercise.name}</span><span className="mt-1 block text-xs text-muted-foreground">{exercise.prescription}</span>{exercise.note && <span className="mt-2 block text-[11px] italic text-muted-foreground/80">{exercise.note}</span>}</span><CheckCircle2 size={16} className={cx('mt-1 shrink-0', isDone ? 'text-[hsl(162_39%_44%)]' : 'text-border')} /></button> })}</div><div className="mt-7 border-t border-border/70 pt-6"><p className="studio-label">Close the loop</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">How did it feel?<select value={score} onChange={(event) => setScore(event.target.value)} className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" data-testid="select-workout-score">{Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} / 10 — {value <= 4 ? 'heavy day' : value <= 7 ? 'solid work' : 'felt strong'}</option>)}</select></label><label className="text-xs font-semibold">Total volume<input type="number" min="0" value={volume} onChange={(event) => setVolume(event.target.value)} className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm" data-testid="input-workout-volume" /></label></div><label className="mt-3 block text-xs font-semibold">A note for future you<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="One thing worth remembering…" className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground/60" data-testid="input-workout-notes" /></label><button disabled={complete.isPending || !!saved} onClick={submit} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55" data-testid="button-complete-workout">{saved ? <><CheckCircle2 size={17} /> Logged — nice work</> : complete.isPending ? 'Saving your result…' : <><Play size={16} /> Finish and log workout</>}</button>{complete.isError && <p className="mt-3 text-center text-xs text-destructive" data-testid="status-complete-error">We couldn't save that result. Try again.</p>}</div></div></div></div>;
}

function MembersPage() {
  const query = useListMembers();
  const members = query.data as Member[] | undefined;
  return <div><PageIntro eyebrow="Coach view" title="Know the room." detail="A quick read on who is showing up, what they are chasing, and where a nudge might help." action={<div className="inline-flex items-center gap-2 rounded-xl bg-[hsl(162_39%_44%/0.12)] px-3 py-2 text-xs font-bold text-[hsl(162_39%_32%)]"><span className="h-2 w-2 rounded-full bg-[hsl(162_39%_44%)]" />Live roster</div>} />{query.isLoading ? <LoadingPage label="Gathering the roster" /> : query.isError ? <ErrorState onRetry={() => query.refetch()} /> : !members?.length ? <EmptyState title="No members yet" detail="When your first member joins the studio, they will show up here." /> : <><div className="mb-5 flex flex-wrap items-center gap-2"><Badge tone="teal">{members.length} active members</Badge><span className="text-xs text-muted-foreground">Attendance is a conversation starter, not a grade.</span></div><div className="studio-card overflow-hidden" data-testid="table-members"><div className="hidden grid-cols-[1.5fr_1fr_100px_100px_110px] gap-4 border-b border-border bg-muted/45 px-5 py-3 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground md:grid"><span>Member</span><span>Goal</span><span>Streak</span><span>Attendance</span><span>Last active</span></div><div className="divide-y divide-border">{members.map((member, index) => <div key={member.id} className={cx('grid gap-3 px-5 py-4 transition hover:bg-muted/30 md:grid-cols-[1.5fr_1fr_100px_100px_110px] md:items-center', 'studio-rise', `studio-delay-${Math.min(index + 1, 4)}`)} data-testid={`row-member-${member.id}`}><div className="flex items-center gap-3"><Avatar initials={member.initials} color={member.avatarColor} /><div><p className="text-sm font-bold">{member.name}</p><p className="text-xs text-muted-foreground md:hidden">{member.goal}</p></div></div><p className="hidden text-sm text-muted-foreground md:block">{member.goal}</p><div className="flex items-center gap-1.5 text-sm"><Flame size={14} className="text-accent" /><span className="font-semibold">{member.streak}</span><span className="text-xs text-muted-foreground">wk</span></div><div><span className="text-sm font-bold">{member.attendance}%</span><div className="mt-1 h-1 w-20 rounded-full bg-muted"><div className="h-1 rounded-full bg-[hsl(162_39%_44%)]" style={{ width: `${member.attendance}%` }} /></div></div><p className="text-xs text-muted-foreground">{relativeDate(member.lastActive)}</p></div>)}</div></div></>}</div>;
}

function NotFoundPage() {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><span className="studio-mono text-xs text-muted-foreground">404 / off the map</span><h1 className="mt-4 text-4xl font-bold tracking-tight">That page missed the session.</h1><Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold" data-testid="link-back-home">Back to overview <MoveRight size={16} /></Link></div>;
}

function RoutedApp() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <AppShell>
            <Switch>
              <Route path="/" component={() => <ProtectedRoute component={DashboardPage} />} />
              <Route path="/schedule" component={() => <ProtectedRoute component={SchedulePage} />} />
              <Route path="/workouts" component={() => <ProtectedRoute component={WorkoutsPage} />} />
              <Route path="/workouts/:workoutId" component={() => <ProtectedRoute component={WorkoutDetailPage} />} />
              <Route path="/members" component={() => <ProtectedRoute component={MembersPage} />} />
              <Route path="/exercises" component={() => <ProtectedRoute component={ExerciseLibrary} />} />
              <Route path="/programmes" component={() => <ProtectedRoute component={ProgrammeList} />} />
              <Route path="/programmes/:id" component={() => <ProtectedRoute component={ProgrammeBuilder} />} />
              <Route path="/my-programme" component={() => <ProtectedRoute component={MyProgramme} />} />
              <Route path="/workout/:id" component={() => <ProtectedRoute component={WorkoutSession} />} />
              <Route path="/coach/monitoring" component={() => <ProtectedRoute component={CoachMonitoring} />} />
              <Route path="/coach/workout/:id" component={() => <ProtectedRoute component={CoachWorkoutDetail} />} />
              <Route component={NotFoundPage} />
            </Switch>
          </AppShell>
        </Route>
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <ModeProvider>
              <RoutedApp />
            </ModeProvider>
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;