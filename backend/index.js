import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Bật CORS trực tiếp (không cần cài thêm thư viện ngoài)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "real_estate_ledger",
  waitForConnections: true,
  connectionLimit: 10,
});

// Kiểm tra kết nối MySQL ngay khi chạy server
pool
  .getConnection()
  .then((conn) => {
    console.log("Kết nối MySQL thành công!");
    conn.release();
  })
  .catch((err) => {
    console.error("LỖI KẾT NỐI MYSQL:", err.message);
  });

const TABLE_CONFIG = {
  properties: { table: "property", pk: "property_id" },
  owners: { table: "owner", pk: "owner_id" },
  agents: { table: "agent", pk: "agent_id" },
  tenants: { table: "tenant", pk: "tenant_id" },
  listings: { table: "listing", pk: "listing_id" },
  leases: { table: "lease", pk: "lease_id" },
  "financial-entries": { table: "financial_entry", pk: "entry_id" },
  "maintenance-requests": { table: "maintenance_request", pk: "maintenance_id" },
  "property-status-histories": { table: "property_status_history", pk: "status_history_id" },
};

const sanitizePayload = (body) => {
  const cleaned = {};
  for (const [key, val] of Object.entries(body || {})) {
    if (val === undefined) continue;
    cleaned[key] = val === "" ? null : val;
  }
  return cleaned;
};

const runBenchmarkQuery = async (res, sql, params = []) => {
  try {
    const start = performance.now();
    const [rows] = await pool.query(sql, params);
    const queryTimeMs = Number((performance.now() - start).toFixed(2));
    res.json({ total_rows: rows.length, query_time_ms: queryTimeMs, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// =========================================================================
// PHẦN 1: FULL CRUD CHO 9 BẢNG CHÍNH + LẤY SCHEMA TỰ ĐỘNG
// =========================================================================
app.get("/api/schema/:resource", async (req, res) => {
  const cfg = TABLE_CONFIG[req.params.resource];
  if (!cfg) return res.status(404).json({ error: "Bảng không hợp lệ" });
  try {
    const [columns] = await pool.query("DESCRIBE ??", [cfg.table]);
    res.json({ table: cfg.table, pk: cfg.pk, columns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

Object.entries(TABLE_CONFIG).forEach(([resource, { table, pk }]) => {
  app.get(`/api/${resource}`, async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      const start = performance.now();
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM ??", [table]);
      const [rows] = await pool.query(
        "SELECT * FROM ?? ORDER BY ?? DESC LIMIT ? OFFSET ?",
        [table, pk, limit, offset]
      );
      const queryTimeMs = Number((performance.now() - start).toFixed(2));

      res.json({
        page,
        limit,
        pk,
        total_all_rows: total,
        total_rows: rows.length,
        query_time_ms: queryTimeMs,
        data: rows,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(`/api/${resource}`, async (req, res) => {
    try {
      const data = sanitizePayload(req.body);
      delete data[pk];
      const [result] = await pool.query("INSERT INTO ?? SET ?", [table, data]);

      const response = {
        message: `Thêm mới vào bảng ${table} thành công (ID = ${result.insertId})`,
        insertId: result.insertId,
      };

      if (table === "property") {
        const [history] = await pool.query(
          "SELECT * FROM property_status_history WHERE property_id = ?",
          [result.insertId]
        );
        response.trigger_effect = history;
      }

      if (table === "maintenance_request" && data.property_id) {
        const [history] = await pool.query(
          "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
          [data.property_id]
        );
        response.trigger_effect = history;
      }

      res.status(201).json(response);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put(`/api/${resource}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = sanitizePayload(req.body);
      delete data[pk];
      const [result] = await pool.query("UPDATE ?? SET ? WHERE ?? = ?", [table, data, pk, id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `Không tìm thấy bản ghi #${id}` });
      }
      res.json({ message: `Cập nhật ${table} #${id} thành công!` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete(`/api/${resource}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [result] = await pool.query("DELETE FROM ?? WHERE ?? = ?", [table, pk, id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: `Không tìm thấy bản ghi #${id}` });
      }
      res.json({ message: `Xóa ${table} #${id} thành công!` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
});

// =========================================================================
// PHẦN 2: API NGHIỆP VỤ DEMO TRIGGERS
// =========================================================================
app.put("/api/maintenance-requests/:id/complete", async (req, res) => {
  try {
    const maintenanceId = Number(req.params.id);
    const [[maint]] = await pool.query(
      "SELECT property_id FROM maintenance_request WHERE maintenance_id = ?",
      [maintenanceId]
    );
    if (!maint) return res.status(404).json({ error: "Không tìm thấy yêu cầu bảo trì" });

    await pool.query(
      "UPDATE maintenance_request SET status = 'COMPLETED', closed_at = CURRENT_TIMESTAMP WHERE maintenance_id = ?",
      [maintenanceId]
    );
    const [history] = await pool.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
      [maint.property_id]
    );
    res.json({
      message: `Đã hoàn tất bảo trì #${maintenanceId}. Trigger 2 đã đồng bộ lại trạng thái BĐS #${maint.property_id}.`,
      trigger_effect: history,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/financial-entries/:id/reverse", async (req, res) => {
  try {
    const entryId = Number(req.params.id);
    const [[orig]] = await pool.query("SELECT * FROM financial_entry WHERE entry_id = ?", [entryId]);
    if (!orig) return res.status(404).json({ error: `Không tìm thấy bút toán #${entryId}` });

    const reverseDirection =
      orig.direction === "CREDIT" ? "DEBIT" :
      orig.direction === "DEBIT" ? "CREDIT" :
      orig.direction === "IN" ? "OUT" : "IN";

    const payload = {
      property_id: orig.property_id,
      listing_id: orig.listing_id,
      lease_id: orig.lease_id,
      maintenance_id: orig.maintenance_id,
      entry_type: orig.entry_type,
      direction: reverseDirection,
      amount: orig.amount,
      currency: orig.currency,
      occurred_at: new Date(),
      reversal_of_entry_id: orig.entry_id,
    };

    if ("reference_no" in orig) {
      payload.reference_no = `REV-${orig.reference_no || orig.entry_id}-${Date.now().toString().slice(-4)}`;
    }

    const [result] = await pool.query("INSERT INTO financial_entry SET ?", [payload]);
    res.status(201).json({
      message: `Đã tạo bút toán đảo #${result.insertId} cho bút toán gốc #${entryId} (${orig.direction} -> ${reverseDirection}).`,
      reversal_entry_id: result.insertId,
      payload,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =========================================================================
// PHẦN 3: 3 API LẤY DỮ LIỆU TỪ 3 SQL VIEWS
// =========================================================================
app.get("/api/views/property-current-status", (req, res) => {
  runBenchmarkQuery(res, "SELECT * FROM v_property_current_status LIMIT 100");
});

app.get("/api/views/property-ledger-balance", (req, res) => {
  runBenchmarkQuery(res, "SELECT * FROM v_property_ledger_balance LIMIT 100");
});

app.get("/api/views/active-leases-detail", (req, res) => {
  runBenchmarkQuery(res, "SELECT * FROM v_active_leases_detail LIMIT 100");
});

// =========================================================================
// PHẦN 4: 12 API BÁO CÁO PHỨC TẠP
// =========================================================================
app.get("/api/reports/property-cash-flow", (req, res) => {
  const sql = `
    SELECT
        p.property_id,
        CONCAT(p.address, COALESCE(CONCAT(' (', NULLIF(p.unit, ''), ')'), '')) AS property_name,
        fe.currency,
        SUM(CASE WHEN fe.entry_type = 'RENT' AND fe.direction = 'CREDIT' THEN fe.amount ELSE 0 END) AS total_rent_income,
        SUM(CASE WHEN fe.entry_type = 'DEPOSIT' AND fe.direction = 'CREDIT' THEN fe.amount ELSE 0 END)
          - SUM(CASE WHEN fe.entry_type = 'DEPOSIT_REFUND' AND fe.direction = 'DEBIT' THEN fe.amount ELSE 0 END) AS net_deposit_held,
        SUM(CASE WHEN fe.entry_type IN ('REPAIR_FEE', 'COMMISSION', 'MANAGEMENT_FEE') AND fe.direction = 'DEBIT' THEN fe.amount ELSE 0 END) AS total_operating_expense,
        SUM(CASE WHEN fe.direction = 'CREDIT' THEN fe.amount ELSE -fe.amount END) AS net_cash_flow
    FROM property p
    JOIN financial_entry fe ON p.property_id = fe.property_id
    GROUP BY p.property_id, p.address, p.unit, fe.currency
    ORDER BY net_cash_flow DESC
  `;
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/agent-performance", (req, res) => {
  const sql = `
    SELECT
        a.agent_id, a.license_no, a.full_name,
        COUNT(DISTINCT CASE WHEN aa.assignment_role = 'LEAD' AND aa.assigned_to IS NULL THEN aa.listing_id END) AS active_lead_count,
        COUNT(DISTINCT l_closed.lease_id) AS closed_leases_count,
        COALESCE(SUM(l_closed.monthly_rent * 12), 0) AS annualized_closed_rent_value,
        RANK() OVER (ORDER BY COALESCE(SUM(l_closed.monthly_rent * 12), 0) DESC) AS performance_rank
    FROM agent a
    LEFT JOIN agent_assignment aa ON a.agent_id = aa.agent_id
    LEFT JOIN listing lst ON aa.listing_id = lst.listing_id AND aa.assignment_role = 'LEAD'
    LEFT JOIN lease l_closed ON lst.listing_id = l_closed.origin_listing_id AND l_closed.lease_status IN ('ACTIVE', 'EXPIRED')
    WHERE a.agent_status = 'ACTIVE'
    GROUP BY a.agent_id, a.license_no, a.full_name
  `;
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/owner-entitlement", (req, res) => {
  const sql = `
    WITH property_net_income AS (
        SELECT property_id, currency,
            SUM(CASE WHEN direction = 'CREDIT' AND entry_type <> 'DEPOSIT' THEN amount
                     WHEN direction = 'DEBIT'  AND entry_type <> 'DEPOSIT_REFUND' THEN -amount
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
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/property-ledger", (req, res) => {
  const propertyId = Number(req.query.property_id) || 6;
  const sql = `
    SELECT
        fe.entry_id, fe.occurred_at, fe.entry_type,
        fe.direction, fe.amount, fe.currency,
        CASE
            WHEN fe.reversal_of_entry_id IS NOT NULL THEN CONCAT('Đảo cho bút toán #', fe.reversal_of_entry_id)
            WHEN rev.entry_id IS NOT NULL THEN CONCAT('Đã bị đảo bởi #', rev.entry_id)
            ELSE 'Hiệu lực'
        END AS audit_note,
        SUM(CASE WHEN fe.direction = 'CREDIT' THEN fe.amount ELSE -fe.amount END)
            OVER (PARTITION BY fe.property_id, fe.currency ORDER BY fe.occurred_at, fe.entry_id) AS running_balance
    FROM financial_entry fe
    LEFT JOIN financial_entry rev ON fe.entry_id = rev.reversal_of_entry_id
    WHERE fe.property_id = ?
    ORDER BY fe.occurred_at ASC, fe.entry_id ASC
  `;
  runBenchmarkQuery(res, sql, [propertyId]);
});

app.get("/api/reports/above-avg-rent-leases", (req, res) => {
  const sql = `
    SELECT p.property_id, p.address, p.unit, p.area, l.monthly_rent,
           ROUND(l.monthly_rent / p.area, 0) AS rent_per_sqm
    FROM property p
    JOIN lease l ON p.property_id = l.property_id
    WHERE l.lease_status = 'ACTIVE'
      AND l.monthly_rent > (SELECT AVG(monthly_rent) FROM lease WHERE lease_status = 'ACTIVE')
    ORDER BY l.monthly_rent DESC
  `;
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/ownership-discrepancies", (req, res) => {
  const sql = `
    SELECT p.property_id, p.address, p.unit,
           COUNT(po.owner_id) AS active_owner_count,
           COALESCE(SUM(po.ownership_share), 0) AS total_ownership_share
    FROM property p
    LEFT JOIN property_ownership po ON p.property_id = po.property_id AND po.valid_to IS NULL
    GROUP BY p.property_id, p.address, p.unit
    HAVING COALESCE(SUM(po.ownership_share), 0) <> 100.00
  `;
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/unmonetized-active-listings", (req, res) => {
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
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/maintenance-by-property-type", (req, res) => {
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
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/property-timeline", (req, res) => {
  const propertyId = Number(req.query.property_id) || 1;
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
      SELECT posted_at AS event_timestamp, 'FINANCIAL_LEDGER' AS source_module,
             CONCAT('Bút toán #', entry_id, ' (', direction, ' - ', entry_type, '): ', amount, ' ', currency) AS event_detail
      FROM financial_entry WHERE property_id = ?
    )
    SELECT ROW_NUMBER() OVER (ORDER BY event_timestamp ASC) AS step_no,
           event_timestamp, source_module, event_detail
    FROM property_timeline
    ORDER BY event_timestamp ASC
  `;
  runBenchmarkQuery(res, sql, [propertyId, propertyId, propertyId]);
});

app.get("/api/reports/tenant-lease-summary", (req, res) => {
  const sql = `
    SELECT t.tenant_id, t.full_name, t.email, t.phone,
           COUNT(DISTINCT lt.lease_id) AS total_leases,
           COUNT(DISTINCT l.property_id) AS distinct_properties_rented,
           SUM(l.monthly_rent) AS cumulative_monthly_rent_commitment
    FROM tenant t
    JOIN lease_tenant lt ON t.tenant_id = lt.tenant_id
    JOIN lease l ON lt.lease_id = l.lease_id
    GROUP BY t.tenant_id, t.full_name, t.email, t.phone
    HAVING COUNT(DISTINCT lt.lease_id) >= 1
    ORDER BY total_leases DESC, cumulative_monthly_rent_commitment DESC
  `;
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/rent-price-variance", (req, res) => {
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
  runBenchmarkQuery(res, sql);
});

app.get("/api/reports/property-occupancy", (req, res) => {
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
  runBenchmarkQuery(res, sql);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  server.close(() => process.exit(0));
});