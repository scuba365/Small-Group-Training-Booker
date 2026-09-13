import { Router, type IRouter } from "express";
import {
  BookSessionParams,
  BookSessionResponse,
  CancelSessionBookingParams,
  CancelSessionBookingResponse,
  CompleteWorkoutBody,
  CompleteWorkoutParams,
  CompleteWorkoutResponse,
  GetDashboardResponse,
  GetWorkoutParams,
  GetWorkoutResponse,
  ListMembersResponse,
  ListSessionsQueryParams,
  ListSessionsResponse,
  ListWorkoutsResponse,
} from "@workspace/api-zod";
import {
  getDashboard,
  members,
  sessions,
  workoutLogs,
  workouts,
} from "../lib/training-data";

const router: IRouter = Router();

router.get("/dashboard", (_req, res): void => {
  res.json(GetDashboardResponse.parse(getDashboard()));
});

router.get("/sessions", (req, res): void => {
  const parsed = ListSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = parsed.data.range === "month" ? sessions : sessions.slice(0, 5);
  res.json(ListSessionsResponse.parse(result));
});

router.post("/sessions/:sessionId/booking", (req, res): void => {
  const parsed = BookSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const session = sessions.find((item) => item.id === parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (session.booked) {
    res.json(BookSessionResponse.parse(session));
    return;
  }
  if (session.spotsTaken >= session.spotsTotal) {
    res.status(409).json({ error: "This session is full" });
    return;
  }

  session.spotsTaken += 1;
  session.booked = true;
  res.json(BookSessionResponse.parse(session));
});

router.delete("/sessions/:sessionId/booking", (req, res): void => {
  const parsed = CancelSessionBookingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const session = sessions.find((item) => item.id === parsed.data.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.booked) {
    session.spotsTaken = Math.max(0, session.spotsTaken - 1);
    session.booked = false;
  }
  res.json(CancelSessionBookingResponse.parse(session));
});

router.get("/workouts", (_req, res): void => {
  res.json(ListWorkoutsResponse.parse(workouts));
});

router.get("/workouts/:workoutId", (req, res): void => {
  const parsed = GetWorkoutParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const workout = workouts.find((item) => item.id === parsed.data.workoutId);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  res.json(GetWorkoutResponse.parse(workout));
});

router.post("/workouts/:workoutId/complete", (req, res): void => {
  const params = CompleteWorkoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = CompleteWorkoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const workout = workouts.find((item) => item.id === params.data.workoutId);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }

  workout.completed = true;
  workout.exercises = workout.exercises.map((exercise) => ({
    ...exercise,
    completed: true,
  }));

  const log = {
    id: `log-${workout.id}-${Date.now()}`,
    workoutId: workout.id,
    title: workout.title,
    completedAt: new Date().toISOString(),
    score: body.data.score,
    volume: body.data.volume,
    notes: body.data.notes,
  };
  workoutLogs.unshift(log);
  res.status(201).json(CompleteWorkoutResponse.parse(log));
});

router.get("/members", (_req, res): void => {
  res.json(ListMembersResponse.parse(members));
});

export default router;