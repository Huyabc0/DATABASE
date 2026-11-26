import { Router } from "express";
import * as reportController from "../controllers/report.controller.js";

const router = Router();

// --- Schema ---
router.get("/schema/:resource", reportController.getTableSchema);

// --- 3 SQL Views ---
router.get("/views/property-current-status", reportController.getPropertyCurrentStatusView);
router.get("/views/property-ledger-balance", reportController.getPropertyLedgerBalanceView);
router.get("/views/active-leases-detail", reportController.getActiveLeasesDetailView);

// --- 12 Báo cáo phức tạp ---
router.get("/reports/property-cash-flow", reportController.getPropertyCashFlow);
router.get("/reports/agent-performance", reportController.getAgentPerformance);
router.get("/reports/owner-entitlement", reportController.getOwnerEntitlement);
router.get("/reports/property-ledger", reportController.getPropertyLedger);
router.get("/reports/above-avg-rent-leases", reportController.getAboveAvgRentLeases);
router.get("/reports/ownership-discrepancies", reportController.getOwnershipDiscrepancies);
router.get("/reports/unmonetized-active-listings", reportController.getUnmonetizedActiveListings);
router.get("/reports/maintenance-by-property-type", reportController.getMaintenanceByPropertyType);
router.get("/reports/property-timeline", reportController.getPropertyTimeline);
router.get("/reports/tenant-lease-summary", reportController.getTenantLeaseSummary);
router.get("/reports/rent-price-variance", reportController.getRentPriceVariance);
router.get("/reports/property-occupancy", reportController.getPropertyOccupancy);

export default router;
