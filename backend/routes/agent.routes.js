import { Router } from "express";
import * as agentController from "../controllers/agent.controller.js";

const router = Router();

router.get("/", agentController.getAgents);
router.get("/:id", agentController.getAgentById);
router.post("/", agentController.createAgent);
router.put("/:id", agentController.updateAgent);
router.delete("/:id", agentController.deleteAgent);

export default router;
