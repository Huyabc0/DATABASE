import { Router } from "express";
import * as leaseController from "../controllers/lease.controller.js";

const router = Router();

router.get("/", leaseController.getLeases);
router.get("/:id", leaseController.getLeaseById);
router.post("/", leaseController.createLease);
router.put("/:id", leaseController.updateLease);
router.delete("/:id", leaseController.deleteLease);

router.post("/rent", leaseController.rentPropertyWorkflow);

export default router;
