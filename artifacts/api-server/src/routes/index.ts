import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trainingRouter from "./training";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trainingRouter);

export default router;
