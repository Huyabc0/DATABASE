import { Router } from "express";
import * as propertyController from "../controllers/property.controller.js";

const router = Router();

router.get("/", propertyController.getProperties);
router.get("/:id", propertyController.getPropertyById);
router.post("/", propertyController.createProperty);
router.post("/:id/lease", propertyController.leaseProperty);
router.put("/:id", propertyController.updateProperty);
router.delete("/:id", propertyController.deleteProperty);

export default router;
