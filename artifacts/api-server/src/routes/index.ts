import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import healthRouter from "./health";
import trainingRouter from "./training";
import authRouter from "./auth";
import exercisesRouter from "./exercises";
import programmesRouter from "./programmes";
import assignmentsRouter from "./assignments";
import meRouter from "./me";
import workoutInstancesRouter from "./workout-instances";
import coachMonitoringRouter from "./coach-monitoring";
import workoutTemplatesRouter from "./workout-templates";

const router: IRouter = Router();

// Public routes (no auth required)
router.use(healthRouter);
router.use(authRouter); // login / logout / me

// All routes below require authentication.
router.use(requireAuth);

router.use(trainingRouter);
router.use(exercisesRouter);
router.use(programmesRouter);
router.use(assignmentsRouter);
router.use(meRouter);
router.use(workoutInstancesRouter);
router.use(coachMonitoringRouter);
router.use(workoutTemplatesRouter);

export default router;
