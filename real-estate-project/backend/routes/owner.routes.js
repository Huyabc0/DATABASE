import { Router } from "express";
import * as ownerController from "../controllers/owner.controller.js";

const router = Router();

router.get("/", ownerController.getOwners);
router.get("/:id", ownerController.getOwnerById);
router.post("/", ownerController.createOwner);
router.put("/:id", ownerController.updateOwner);
router.delete("/:id", ownerController.deleteOwner);

export default router;
