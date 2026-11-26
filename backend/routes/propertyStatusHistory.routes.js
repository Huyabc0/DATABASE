import { Router } from "express";
import * as historyController from "../controllers/propertyStatusHistory.controller.js";

const router = Router();

router.get("/", historyController.getPropertyStatusHistories);
router.get("/:id", historyController.getPropertyStatusHistoryById);
router.post("/", historyController.createPropertyStatusHistory);
router.put("/:id", historyController.updatePropertyStatusHistory);
router.delete("/:id", historyController.deletePropertyStatusHistory);

export default router;
