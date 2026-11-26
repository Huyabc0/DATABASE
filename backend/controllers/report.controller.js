import * as reportService from "../services/report.service.js";

const handleBenchmark = (fn) => async (req, res) => {
  try {
    const result = await fn(req);
    res.json(result);
  } catch (err) {
    console.error("SQL Query Error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

export async function getTableSchema(req, res) {
  try {
    const schema = await reportService.describeResourceTable(req.params.resource);
    if (!schema) return res.status(404).json({ error: "Bảng không hợp lệ" });
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// --- 3 SQL VIEWS ---
export const getPropertyCurrentStatusView = handleBenchmark(() =>
  reportService.getPropertyCurrentStatusView()
);
export const getPropertyLedgerBalanceView = handleBenchmark(() =>
  reportService.getPropertyLedgerBalanceView()
);
export const getActiveLeasesDetailView = handleBenchmark(() =>
  reportService.getActiveLeasesDetailView()
);

// --- 12 BÁO CÁO PHỨC TẠP ---
export const getPropertyCashFlow = handleBenchmark(() =>
  reportService.getPropertyCashFlowReport()
);
export const getAgentPerformance = handleBenchmark(() =>
  reportService.getAgentPerformanceReport()
);
export const getOwnerEntitlement = handleBenchmark(() =>
  reportService.getOwnerEntitlementReport()
);
export const getPropertyLedger = handleBenchmark((req) =>
  reportService.getPropertyLedgerReport(Number(req.query.property_id) || 1)
);
export const getAboveAvgRentLeases = handleBenchmark(() =>
  reportService.getAboveAvgRentLeasesReport()
);
export const getOwnershipDiscrepancies = handleBenchmark(() =>
  reportService.getOwnershipDiscrepanciesReport()
);
export const getUnmonetizedActiveListings = handleBenchmark(() =>
  reportService.getUnmonetizedActiveListingsReport()
);
export const getMaintenanceByPropertyType = handleBenchmark(() =>
  reportService.getMaintenanceByPropertyTypeReport()
);
export const getPropertyTimeline = handleBenchmark((req) =>
  reportService.getPropertyTimelineReport(Number(req.query.property_id) || 1)
);
export const getTenantLeaseSummary = handleBenchmark(() =>
  reportService.getTenantLeaseSummaryReport()
);
export const getRentPriceVariance = handleBenchmark(() =>
  reportService.getRentPriceVarianceReport()
);
export const getPropertyOccupancy = handleBenchmark(() =>
  reportService.getPropertyOccupancyReport()
);
