import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trainingRouter from "./training";
import authRouter from "./auth";
import exercisesRouter from "./exercises";
import programmesRouter from "./programmes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trainingRouter);
router.use(authRouter);
router.use(exercisesRouter);
router.use(programmesRouter);

export default router;
