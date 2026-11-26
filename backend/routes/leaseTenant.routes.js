import { Router } from "express";
import * as leaseTenantController from "../controllers/leaseTenant.controller.js";

const router = Router();

router.get("/", leaseTenantController.getLeaseTenants);
router.get("/:leaseId/:tenantId", leaseTenantController.getLeaseTenant);
router.post("/", leaseTenantController.createLeaseTenant);
router.put("/:leaseId/:tenantId", leaseTenantController.updateLeaseTenant);
router.delete("/:leaseId/:tenantId", leaseTenantController.deleteLeaseTenant);

export default router;
