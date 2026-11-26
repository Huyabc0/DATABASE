import { Router } from "express";
import * as ownershipController from "../controllers/propertyOwnership.controller.js";

const router = Router();

router.get("/", ownershipController.getPropertyOwnerships);
router.get("/:ownerId/:propertyId", ownershipController.getPropertyOwnership);
router.post("/", ownershipController.createPropertyOwnership);
router.put("/:ownerId/:propertyId", ownershipController.updatePropertyOwnership);
router.delete("/:ownerId/:propertyId", ownershipController.deletePropertyOwnership);

export default router;
