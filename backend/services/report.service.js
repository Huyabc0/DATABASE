import pool from "../config/db.js";
import { executeBenchmarkQuery } from "../utils/benchmark.js";

const SCHEMA_TABLE_MAP = {
  owners: { table: "owner", pk: "owner_id" },
  properties: { table: "property", pk: "property_id" },
  "property-ownerships": {
    table: "property_ownership",
    pk: "owner_id,property_id,valid_from",
  },
  agents: { table: "agent", pk: "agent_id" },
  listings: { table: "listing", pk: "listing_id" },
  "agent-assignments": { table: "agent_assignment", pk: "assignment_id" },
  tenants: { table: "tenant", pk: "tenant_id" },
  leases: { table: "lease", pk: "lease_id" },
  "lease-tenants": { table: "lease_tenant", pk: "lease_id,tenant_id" },
  "maintenance-requests": {
    table: "maintenance_request",
    pk: "maintenance_id",
  },
  "property-status-histories": {
    table: "property_status_history",
    pk: "status_history_id",
  },
  "financial-entries": { table: "financial_entry", pk: "entry_id" },
};

export async function describeResourceTable(resource) {
  const cfg = SCHEMA_TABLE_MAP[resource];
  if (!cfg) return null;
  const [columns] = await pool.query("DESCRIBE ??", [cfg.table]);
  return { table: cfg.table, pk: cfg.pk, columns };
}

// --- 3 SQL VIEWS ---
export function getPropertyCurrentStatusView() {
  return executeBenchmarkQuery(
    "SELECT * FROM v_property_current_status LIMIT 100",
  );
}

export function getPropertyLedgerBalanceView() {
  return executeBenchmarkQuery(
    "SELECT * FROM v_property_ledger_balance LIMIT 100",
  );
}

export function getActiveLeasesDetailView() {
  return executeBenchmarkQuery(
    "SELECT * FROM v_active_leases_detail LIMIT 100",
  );
}

// --- 12 BÁO CÁO PHỨC TẠP ---
export function getPropertyCashFlowReport() {
  //Q01 – Báo cáo tổng hợp thu nhập, chi phí và dòng tiền theo từng bất động sản
  const sql = `
    SELECT
        p.property_id,
        CONCAT(p.address, COALESCE(CONCAT(' (', NULLIF(p.unit, ''), ')'), '')) AS property_name,
        fe.currency,
        SUM(CASE WHEN fe.entry_type = 'RENT' AND fe.direction = 'IN' THEN fe.amount ELSE 0 END) AS total_rent_income,
        SUM(CASE WHEN fe.entry_type = 'DEPOSIT' AND fe.direction = 'IN' THEN fe.amount ELSE 0 END)
          - SUM(CASE WHEN fe.entry_type = 'DEPOSIT_REFUND' AND fe.direction = 'OUT' THEN fe.amount ELSE 0 END) AS net_deposit_held,
        SUM(CASE WHEN fe.entry_type IN ('REPAIR_FEE', 'COMMISSION', 'MANAGEMENT_FEE') AND fe.direction = 'OUT' THEN fe.amount ELSE 0 END) AS total_operating_expense,
        SUM(CASE WHEN fe.direction = 'IN' THEN fe.amount ELSE -fe.amount END) AS net_cash_flow
    FROM property p
    JOIN financial_entry fe ON p.property_id = fe.property_id
    GROUP BY p.property_id, p.address, p.unit, fe.currency
    ORDER BY net_cash_flow DESC
  `;
  return executeBenchmarkQuery(sql);
}

export function getAgentPerformanceReport() {
  //Q02 – Đánh giá và xếp hạng hiệu quả làm việc của nhân viên môi giới
  const sql = `
    WITH agent_lead_listings AS (
      SELECT
          agent_id,
          listing_id,
          MAX(CASE WHEN assigned_to IS NULL THEN 1 ELSE 0 END) AS is_currently_leading
      FROM agent_assignment
      WHERE assignment_role = 'LEAD'
      GROUP BY agent_id, listing_id
    )
    SELECT
        a.agent_id, a.license_no, a.full_name,
        COALESCE(SUM(all_lead.is_currently_leading), 0) AS active_lead_count,
        COUNT(DISTINCT l_closed.lease_id) AS closed_leases_count,
        COALESCE(SUM(l_closed.monthly_rent * 12), 0) AS annualized_closed_rent_value,
        RANK() OVER (ORDER BY COALESCE(SUM(l_closed.monthly_rent * 12), 0) DESC) AS performance_rank
    FROM agent a
    LEFT JOIN agent_lead_listings all_lead ON a.agent_id = all_lead.agent_id
    LEFT JOIN listing lst ON all_lead.listing_id = lst.listing_id
    LEFT JOIN lease l_closed ON lst.listing_id = l_closed.origin_listing_id AND l_closed.lease_status IN ('ACTIVE', 'EXPIRED')
    WHERE a.agent_status = 'ACTIVE'
    GROUP BY a.agent_id, a.license_no, a.full_name
  `;
  return executeBenchmarkQuery(sql);
}

export function getOwnerEntitlementReport() {
  //Q03 – Tính toán phần thu nhập được phân chia cho từng chủ sở hữu theo tỷ lệ sở hữu
  const sql = `
    WITH property_net_income AS (
        SELECT property_id, currency,
            SUM(CASE WHEN direction = 'IN' AND entry_type <> 'DEPOSIT' THEN amount
                     WHEN direction = 'OUT' AND entry_type <> 'DEPOSIT_REFUND' THEN -amount
                     ELSE 0 END) AS distributable_income
        FROM financial_entry
        GROUP BY property_id, currency
    )
    SELECT
        o.owner_id, o.full_name AS owner_name, p.property_id, p.address,
        po.ownership_share, pni.currency,
        pni.distributable_income AS property_total_income,
        ROUND(pni.distributable_income * (po.ownership_share / 100.0), 2) AS owner_entitled_amount
    FROM owner o
    JOIN property_ownership po ON o.owner_id = po.owner_id AND po.valid_to IS NULL
    JOIN property p ON po.property_id = p.property_id
    JOIN property_net_income pni ON p.property_id = pni.property_id
    ORDER BY o.owner_id, p.property_id
  `;
  return executeBenchmarkQuery(sql);
}

export function getPropertyLedgerReport(propertyId) {
  //Q04 – Tra cứu lịch sử thu chi và tính số dư lũy kế của bất động sản
  const sql = `
    SELECT
        fe.entry_id, fe.occurred_at, fe.entry_type,
        fe.direction, fe.amount, fe.currency,
        CASE
            WHEN fe.reversal_of_entry_id IS NOT NULL THEN CONCAT('Đảo cho bút toán #', fe.reversal_of_entry_id)
            WHEN rev.entry_id IS NOT NULL THEN CONCAT('Đã bị đảo bởi #', rev.entry_id)
            ELSE 'Hiệu lực'
        END AS audit_note,
        SUM(CASE WHEN fe.direction = 'IN' THEN fe.amount ELSE -fe.amount END)
            OVER (PARTITION BY fe.property_id, fe.currency ORDER BY fe.occurred_at, fe.entry_id) AS running_balance
    FROM financial_entry fe
    LEFT JOIN financial_entry rev ON fe.entry_id = rev.reversal_of_entry_id
    WHERE fe.property_id = ?
    ORDER BY fe.occurred_at ASC, fe.entry_id ASC
  `;
  return executeBenchmarkQuery(sql, [propertyId]);
}

export function getAboveAvgRentLeasesReport() {
  //Q05 – Tìm các hợp đồng thuê có giá thuê cao hơn mức trung bình toàn hệ thống
  const sql = `
    SELECT p.property_id, p.address, p.unit, p.area, l.monthly_rent,
           ROUND(l.monthly_rent / p.area, 0) AS rent_per_sqm
    FROM property p
    JOIN lease l ON p.property_id = l.property_id
    WHERE l.lease_status = 'ACTIVE'
      AND l.monthly_rent > (SELECT AVG(monthly_rent) FROM lease WHERE lease_status = 'ACTIVE')
    ORDER BY l.monthly_rent DESC
  `;
  return executeBenchmarkQuery(sql);
}

export function getOwnershipDiscrepanciesReport() {
  //Q06 – Kiểm tra các bất động sản có tổng tỷ lệ sở hữu không bằng 100%
  const sql = `
    SELECT p.property_id, p.address, p.unit,
           COUNT(po.owner_id) AS active_owner_count,
           COALESCE(SUM(po.ownership_share), 0) AS total_ownership_share
    FROM property p
    LEFT JOIN property_ownership po ON p.property_id = po.property_id AND po.valid_to IS NULL
    GROUP BY p.property_id, p.address, p.unit
    HAVING COALESCE(SUM(po.ownership_share), 0) <> 100.00
  `;
  return executeBenchmarkQuery(sql);
}

export function getUnmonetizedActiveListingsReport() {
  //Q07 – Tìm các tin đăng đang hoạt động nhưng chưa phát sinh giao dịch tài chính
  const sql = `
    SELECT lst.listing_id, p.address, p.unit, lst.listing_type, lst.offer_amount,
           a.full_name AS lead_agent_name,
           DATEDIFF(CURRENT_DATE, lst.start_date) AS days_on_market
    FROM listing lst
    JOIN property p ON lst.property_id = p.property_id
    LEFT JOIN agent_assignment aa ON lst.listing_id = aa.listing_id AND aa.assignment_role = 'LEAD' AND aa.assigned_to IS NULL
    LEFT JOIN agent a ON aa.agent_id = a.agent_id
    WHERE lst.listing_status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM financial_entry fe WHERE fe.listing_id = lst.listing_id)
    ORDER BY days_on_market DESC
  `;
  return executeBenchmarkQuery(sql);
}

export function getMaintenanceByPropertyTypeReport() {
  //Q08 – Thống kê số lượng yêu cầu bảo trì và thời gian xử lý theo loại hình bất động sản
  const sql = `
    SELECT p.property_type, COUNT(mr.maintenance_id) AS total_requests,
           SUM(CASE WHEN mr.blocking_flag = TRUE THEN 1 ELSE 0 END) AS blocking_requests,
           ROUND(100.0 * SUM(CASE WHEN mr.blocking_flag = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(mr.maintenance_id), 0), 1) AS blocking_rate_pct,
           ROUND(AVG(CASE WHEN mr.status = 'COMPLETED' THEN TIMESTAMPDIFF(SECOND, mr.opened_at, mr.closed_at) / 3600.0 END), 2) AS avg_resolution_hours
    FROM property p
    JOIN maintenance_request mr ON p.property_id = mr.property_id
    GROUP BY p.property_type
    ORDER BY total_requests DESC
  `;
  return executeBenchmarkQuery(sql);
}

export function getPropertyTimelineReport(propertyId) {
  //Q09 – Tổng hợp lịch sử biến động trạng thái, bảo trì và giao dịch tài chính của bất động sản
  const sql = `
    WITH property_timeline AS (
      SELECT valid_from AS event_timestamp, 'STATUS_HISTORY' AS source_module,
             CONCAT('Chuyển sang trạng thái ', status, COALESCE(CONCAT(' — ', reason), '')) AS event_detail
      FROM property_status_history WHERE property_id = ?
      UNION ALL
      SELECT opened_at AS event_timestamp, 'MAINTENANCE' AS source_module,
             CONCAT('Sự cố #', maintenance_id, ' [', priority, '] - ', status) AS event_detail
      FROM maintenance_request WHERE property_id = ?
      UNION ALL
      SELECT occurred_at AS event_timestamp, 'FINANCIAL_LEDGER' AS source_module,
             CONCAT('Bút toán #', entry_id, ' (', direction, ' - ', entry_type, '): ', amount, ' ', currency) AS event_detail
      FROM financial_entry WHERE property_id = ?
    )
    SELECT ROW_NUMBER() OVER (ORDER BY event_timestamp ASC) AS step_no,
           event_timestamp, source_module, event_detail
    FROM property_timeline
    ORDER BY event_timestamp ASC
  `;
  return executeBenchmarkQuery(sql, [propertyId, propertyId, propertyId]);
}

export function getTenantLeaseSummaryReport() {
  //Q10 – Thống kê hợp đồng thuê và tổng tiền thuê hàng tháng theo từng khách thuê
  const sql = `
    SELECT t.tenant_id, t.full_name, t.email, t.phone,
           COUNT(DISTINCT lt.lease_id) AS total_leases,
           COUNT(DISTINCT l.property_id) AS distinct_properties_rented,
           COALESCE(SUM(CASE WHEN l.lease_status = 'ACTIVE' THEN l.monthly_rent ELSE 0 END), 0) AS cumulative_monthly_rent_commitment
    FROM tenant t
    JOIN lease_tenant lt ON t.tenant_id = lt.tenant_id
    JOIN lease l ON lt.lease_id = l.lease_id
    GROUP BY t.tenant_id, t.full_name, t.email, t.phone
    ORDER BY total_leases DESC, cumulative_monthly_rent_commitment DESC
  `;
  return executeBenchmarkQuery(sql);
}

export function getRentPriceVarianceReport() {
  //Q11 – Phân tích chênh lệch giữa giá thuê chào ban đầu và giá thuê trong hợp đồng
  const sql = `
    SELECT l.lease_id, p.address, p.unit, lst.listing_id,
           lst.offer_amount AS listed_rent, l.monthly_rent AS contracted_rent,
           (l.monthly_rent - lst.offer_amount) AS price_variance,
           ROUND(((l.monthly_rent - lst.offer_amount) / lst.offer_amount) * 100, 2) AS variance_pct,
           (
               SELECT a.full_name
               FROM agent_assignment aa
               JOIN agent a ON aa.agent_id = a.agent_id
               WHERE aa.listing_id = lst.listing_id AND aa.assignment_role = 'LEAD'
               ORDER BY aa.assigned_from DESC LIMIT 1
           ) AS closing_lead_agent
    FROM lease l
    JOIN listing lst ON l.origin_listing_id = lst.listing_id
    JOIN property p ON l.property_id = p.property_id
    WHERE lst.listing_type = 'RENT'
  `;
  return executeBenchmarkQuery(sql);
}

export function getPropertyOccupancyReport() {
  //Q12 – Thống kê số ngày bất động sản ở từng trạng thái và tính tỷ lệ khai thác cho thuê
  const sql = `
    WITH status_durations AS (
        SELECT property_id, status,
               TIMESTAMPDIFF(SECOND, valid_from, COALESCE(valid_to, CURRENT_TIMESTAMP)) / 86400.0 AS duration_days
        FROM property_status_history
    )
    SELECT p.property_id, p.address, p.unit,
           ROUND(COALESCE(SUM(CASE WHEN sd.status = 'AVAILABLE' THEN sd.duration_days ELSE 0 END), 0), 1) AS total_available_days,
           ROUND(COALESCE(SUM(CASE WHEN sd.status = 'LEASED' THEN sd.duration_days ELSE 0 END), 0), 1) AS total_leased_days,
           ROUND(COALESCE(SUM(CASE WHEN sd.status = 'UNDER_MAINTENANCE' THEN sd.duration_days ELSE 0 END), 0), 1) AS total_maintenance_days,
           ROUND(100.0 * COALESCE(SUM(CASE WHEN sd.status = 'LEASED' THEN sd.duration_days ELSE 0 END), 0) / NULLIF(SUM(sd.duration_days), 0), 1) AS occupancy_rate_pct
    FROM property p
    LEFT JOIN status_durations sd ON p.property_id = sd.property_id
    GROUP BY p.property_id, p.address, p.unit
    ORDER BY occupancy_rate_pct DESC
  `;
  return executeBenchmarkQuery(sql);
}
