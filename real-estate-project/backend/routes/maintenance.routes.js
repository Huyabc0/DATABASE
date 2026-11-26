import { Router } from "express";
import * as maintenanceController from "../controllers/maintenance.controller.js";

const router = Router();

router.get("/", maintenanceController.getMaintenanceRequests);
router.get("/:id", maintenanceController.getMaintenanceRequestById);
router.post("/", maintenanceController.createMaintenanceRequest);
router.put("/:id", maintenanceController.updateMaintenanceRequest);
router.put("/:id/complete", maintenanceController.completeMaintenanceRequest);
router.delete("/:id", maintenanceController.deleteMaintenanceRequest);

export default router;
