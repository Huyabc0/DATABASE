import { Router } from "express";
import * as assignController from "../controllers/agentAssignment.controller.js";

const router = Router();

router.get("/", assignController.getAgentAssignments);
router.get("/:id", assignController.getAgentAssignmentById);
router.post("/", assignController.createAgentAssignment);
router.put("/:id", assignController.updateAgentAssignment);
router.delete("/:id", assignController.deleteAgentAssignment);

export default router;
