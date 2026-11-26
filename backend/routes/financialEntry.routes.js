import { Router } from "express";
import * as financialController from "../controllers/financialEntry.controller.js";

const router = Router();

router.get("/", financialController.getFinancialEntries);
router.get("/:id", financialController.getFinancialEntryById);
router.post("/", financialController.createFinancialEntry);
router.post("/:id/reverse", financialController.reverseFinancialEntry);
router.put("/:id", financialController.updateFinancialEntryBlocked);
router.delete("/:id", financialController.deleteFinancialEntryBlocked);

export default router;
