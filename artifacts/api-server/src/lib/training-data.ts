export type TrainingSession = {
  id: string;
  title: string;
  focus: string;
  startAt: string;
  endAt: string;
  coachName: string;
  location: string;
  spotsTotal: number;
  spotsTaken: number;
  booked: boolean;
  level: string;
  tag: string;
  accent: string;
};

export type Exercise = {
  id: string;
  name: string;
  prescription: string;
  note: string;
  completed: boolean;
};

export type Workout = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  durationMinutes: number;
  difficulty: string;
  scheduledFor: string;
  completed: boolean;
  exercises: Exercise[];
};

export type WorkoutLog = {
  id: string;
  workoutId: string;
  title: string;
  completedAt: string;
  score: number;
  volume: number;
  notes: string;
};

export type Member = {
  id: string;
  name: string;
  initials: string;
  goal: string;
  streak: number;
  lastActive: string;
  attendance: number;
  avatarColor: string;
};

export const sessions: TrainingSession[] = [
  {
    id: "session-monday-strength",
    title: "Strength Foundations",
    focus: "Lower body + trunk",
    startAt: "2026-09-14T07:00:00.000Z",
    endAt: "2026-09-14T07:50:00.000Z",
    coachName: "Maya Chen",
    location: "The Foundry · Studio 01",
    spotsTotal: 8,
    spotsTaken: 6,
    booked: true,
    level: "All levels",
    tag: "Strength",
    accent: "lime",
  },
  {
    id: "session-tuesday-engine",
    title: "Engine Room",
    focus: "Intervals + conditioning",
    startAt: "2026-09-15T18:15:00.000Z",
    endAt: "2026-09-15T19:05:00.000Z",
    coachName: "Jon Bell",
    location: "The Foundry · Turf",
    spotsTotal: 10,
    spotsTaken: 8,
    booked: false,
    level: "Intermediate",
    tag: "Conditioning",
    accent: "orange",
  },
  {
    id: "session-wednesday-pull",
    title: "Pull & Power",
    focus: "Back, grip + carries",
    startAt: "2026-09-16T07:00:00.000Z",
    endAt: "2026-09-16T07:50:00.000Z",
    coachName: "Maya Chen",
    location: "The Foundry · Studio 01",
    spotsTotal: 8,
    spotsTaken: 5,
    booked: false,
    level: "All levels",
    tag: "Strength",
    accent: "blue",
  },
  {
    id: "session-thursday-mobility",
    title: "Move Better",
    focus: "Mobility + control",
    startAt: "2026-09-17T18:15:00.000Z",
    endAt: "2026-09-17T19:05:00.000Z",
    coachName: "Aisha Okafor",
    location: "The Foundry · Studio 02",
    spotsTotal: 10,
    spotsTaken: 7,
    booked: true,
    level: "All levels",
    tag: "Mobility",
    accent: "purple",
  },
  {
    id: "session-saturday-team",
    title: "Saturday Team Session",
    focus: "Full body benchmark",
    startAt: "2026-09-19T09:00:00.000Z",
    endAt: "2026-09-19T10:00:00.000Z",
    coachName: "Jon Bell",
    location: "The Foundry · Turf",
    spotsTotal: 14,
    spotsTaken: 11,
    booked: false,
    level: "All levels",
    tag: "Team",
    accent: "pink",
  },
];

export const workouts: Workout[] = [
  {
    id: "workout-lower-body",
    title: "Lower Body Strength",
    subtitle: "Build a stronger base",
    category: "Strength",
    durationMinutes: 42,
    difficulty: "Moderate",
    scheduledFor: "2026-09-14T12:00:00.000Z",
    completed: false,
    exercises: [
      {
        id: "goblet-squat",
        name: "Goblet squat",
        prescription: "4 × 8 reps",
        note: "Pause for one breath at the bottom.",
        completed: false,
      },
      {
        id: "rear-foot-split-squat",
        name: "Rear-foot elevated split squat",
        prescription: "3 × 8 / side",
        note: "Keep the front heel heavy.",
        completed: false,
      },
      {
        id: "single-leg-bridge",
        name: "Single-leg bridge",
        prescription: "3 × 12 / side",
        note: "Move slowly and finish tall.",
        completed: false,
      },
      {
        id: "farmer-carry",
        name: "Farmer carry",
        prescription: "4 × 30m",
        note: "Quiet feet, ribs stacked.",
        completed: false,
      },
    ],
  },
  {
    id: "workout-engine-intervals",
    title: "Engine Intervals",
    subtitle: "Find your sustainable pace",
    category: "Conditioning",
    durationMinutes: 28,
    difficulty: "Challenging",
    scheduledFor: "2026-09-16T12:00:00.000Z",
    completed: false,
    exercises: [
      {
        id: "bike-sprint",
        name: "Bike sprint",
        prescription: "8 × 30 sec",
        note: "Fast, not frantic.",
        completed: false,
      },
      {
        id: "box-step-over",
        name: "Box step-over",
        prescription: "4 × 12 reps",
        note: "Alternate sides each rep.",
        completed: false,
      },
      {
        id: "dead-bug",
        name: "Dead bug",
        prescription: "4 × 8 / side",
        note: "Keep your low back connected.",
        completed: false,
      },
    ],
  },
  {
    id: "workout-recovery-reset",
    title: "Recovery Reset",
    subtitle: "Make space to move",
    category: "Mobility",
    durationMinutes: 20,
    difficulty: "Easy",
    scheduledFor: "2026-09-18T12:00:00.000Z",
    completed: true,
    exercises: [
      {
        id: "cossack-flow",
        name: "Cossack flow",
        prescription: "3 × 5 / side",
        note: "Use the range you own today.",
        completed: true,
      },
      {
        id: "90-90-switch",
        name: "90/90 switches",
        prescription: "3 × 8 / side",
        note: "Stay tall through the switch.",
        completed: true,
      },
    ],
  },
];

export const workoutLogs: WorkoutLog[] = [
  {
    id: "log-recovery-reset",
    workoutId: "workout-recovery-reset",
    title: "Recovery Reset",
    completedAt: "2026-09-12T12:38:00.000Z",
    score: 8,
    volume: 420,
    notes: "Hips felt much freer after.",
  },
  {
    id: "log-upper-body",
    workoutId: "workout-upper-body",
    title: "Upper Body Pull",
    completedAt: "2026-09-10T07:47:00.000Z",
    score: 9,
    volume: 1280,
    notes: "Strong finish on the carries.",
  },
];

export const members: Member[] = [
  {
    id: "member-olivia",
    name: "Olivia Byrne",
    initials: "OB",
    goal: "Build strength",
    streak: 6,
    lastActive: "Today, 7:42",
    attendance: 92,
    avatarColor: "coral",
  },
  {
    id: "member-james",
    name: "James Kelly",
    initials: "JK",
    goal: "Improve conditioning",
    streak: 3,
    lastActive: "Yesterday, 18:58",
    attendance: 86,
    avatarColor: "blue",
  },
  {
    id: "member-nina",
    name: "Nina Shah",
    initials: "NS",
    goal: "Move without pain",
    streak: 11,
    lastActive: "Yesterday, 07:51",
    attendance: 98,
    avatarColor: "purple",
  },
  {
    id: "member-daniel",
    name: "Daniel Walsh",
    initials: "DW",
    goal: "Train for a half",
    streak: 2,
    lastActive: "Mon, 18:12",
    attendance: 78,
    avatarColor: "orange",
  },
];

export function getDashboard() {
  const upcoming = sessions.slice(0, 4);
  return {
    memberName: "Olivia",
    weekLabel: "14–20 September",
    streak: 6,
    sessionsBooked: sessions.filter((session) => session.booked).length,
    workoutsCompleted: workoutLogs.length,
    readinessScore: 82,
    nextSession: sessions.find((session) => session.booked) ?? null,
    upcoming,
    recentWorkouts: workoutLogs,
    progress: [
      { label: "Deadlift", value: "72", unit: "kg", change: "+8% this month", trend: "up" as const },
      { label: "Consistency", value: "92", unit: "%", change: "+6% this month", trend: "up" as const },
      { label: "Recovery", value: "8.4", unit: "/10", change: "Holding steady", trend: "flat" as const },
    ],
  };
}