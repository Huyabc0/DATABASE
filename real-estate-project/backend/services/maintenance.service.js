import pool from "../config/db.js";
import { syncPropertyStatusAndHistory } from "./propertyStatusSync.service.js";
import { createFinancialEntryWithConn } from "./financialEntry.service.js";

export async function listMaintenanceRequests({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM maintenance_request");
  const [rows] = await pool.query(
    "SELECT maintenance_id, property_id, reporter_tenant_id, priority, blocking_flag, status, opened_at, closed_at FROM maintenance_request ORDER BY maintenance_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "maintenance_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getMaintenanceRequestById(maintenanceId) {
  const [[row]] = await pool.query(
    "SELECT maintenance_id, property_id, reporter_tenant_id, priority, blocking_flag, status, opened_at, closed_at FROM maintenance_request WHERE maintenance_id = ?",
    [maintenanceId]
  );
  return row || null;
}

export async function createMaintenanceRequest(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const isBlocking =
      data.blocking_flag === true || data.blocking_flag === 1 || data.blocking_flag === "true";

    const payload = {
      property_id: data.property_id,
      reporter_tenant_id: data.reporter_tenant_id ?? null,
      priority: data.priority ?? "MEDIUM",
      blocking_flag: isBlocking,
      status: data.status ?? "OPEN",
      closed_at: data.closed_at ?? null,
    };

    const [result] = await conn.query("INSERT INTO maintenance_request SET ?", [payload]);
    const insertId = result.insertId;

    const auditNotes = [];
    if (isBlocking && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(payload.status)) {
      const syncRes = await syncPropertyStatusAndHistory(
        conn,
        payload.property_id,
        "UNDER_MAINTENANCE",
        `Mở bảo trì cản trở #${insertId}`
      );
      auditNotes.push(
        `Đã chuyển BĐS #${payload.property_id} sang UNDER_MAINTENANCE & tạm dừng ${syncRes.paused_listings_count} tin đăng.`
      );
    }

    const [history] = await conn.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
      [payload.property_id]
    );

    await conn.commit();
    return { insertId, audit_notes: auditNotes, trigger_effect: history };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateMaintenanceRequest(maintenanceId, data, costData = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oldRow]] = await conn.query(
      "SELECT * FROM maintenance_request WHERE maintenance_id = ? FOR UPDATE",
      [maintenanceId]
    );
    if (!oldRow) {
      await conn.rollback();
      return null;
    }

    const updates = {};
    for (const field of [
      "property_id",
      "reporter_tenant_id",
      "priority",
      "blocking_flag",
      "status",
      "closed_at",
    ]) {
      if (data[field] !== undefined) updates[field] = data[field];
    }

    if (Object.keys(updates).length > 0) {
      await conn.query("UPDATE maintenance_request SET ? WHERE maintenance_id = ?", [
        updates,
        maintenanceId,
      ]);
    }

    const newStatus = updates.status || oldRow.status;
    const isBlocking =
      updates.blocking_flag !== undefined
        ? updates.blocking_flag === true ||
        updates.blocking_flag === 1 ||
        updates.blocking_flag === "true"
        : Boolean(oldRow.blocking_flag);
    const propId = updates.property_id || oldRow.property_id;
    const auditNotes = [];
    let financialEntryId = null;

    const wasOpenBlocking =
      Boolean(oldRow.blocking_flag) &&
      ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(oldRow.status);
    const isNowOpenBlocking =
      isBlocking && ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(newStatus);
    const isNowClosed = ["COMPLETED", "CANCELLED"].includes(newStatus);

    if (isNowOpenBlocking) {
      await syncPropertyStatusAndHistory(
        conn,
        propId,
        "UNDER_MAINTENANCE",
        `Cập nhật bảo trì cản trở #${maintenanceId} (${newStatus})`
      );
      auditNotes.push(`BĐS #${propId} đang bảo trì cản trở -> Trạng thái: UNDER_MAINTENANCE.`);
    } else if (wasOpenBlocking && (!isBlocking || isNowClosed)) {
      if (isNowClosed && !updates.closed_at) {
        await conn.query(
          "UPDATE maintenance_request SET closed_at = CURRENT_TIMESTAMP WHERE maintenance_id = ? AND closed_at IS NULL",
          [maintenanceId]
        );
      }

      const [[{ openBlocking }]] = await conn.query(
        "SELECT COUNT(*) AS openBlocking FROM maintenance_request WHERE property_id = ? AND maintenance_id <> ? AND blocking_flag = TRUE AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')",
        [propId, maintenanceId]
      );

      if (openBlocking === 0) {
        const [[{ activeLeases }]] = await conn.query(
          "SELECT COUNT(*) AS activeLeases FROM lease WHERE property_id = ? AND lease_status = 'ACTIVE'",
          [propId]
        );
        const nextStatus = activeLeases > 0 ? "LEASED" : "AVAILABLE";
        await syncPropertyStatusAndHistory(
          conn,
          propId,
          nextStatus,
          `Hoàn tất bảo trì #${maintenanceId} (${newStatus})`
        );
        auditNotes.push(
          `Đã hoàn tất bảo trì #${maintenanceId}: Khôi phục BĐS #${propId} về trạng thái ${nextStatus} và ghi nhận vào property_status_history.`
        );
      }
    } else if (
      ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(oldRow.status) &&
      isNowClosed &&
      !updates.closed_at
    ) {
      await conn.query(
        "UPDATE maintenance_request SET closed_at = CURRENT_TIMESTAMP WHERE maintenance_id = ? AND closed_at IS NULL",
        [maintenanceId]
      );
    }

    // Tự động ghi nhận chi phí bảo trì vào sổ cái tài chính (luôn ghi khi đóng/hoàn tất có kèm chi phí)
    if (
      ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(oldRow.status) &&
      isNowClosed &&
      costData &&
      costData.amount > 0
    ) {
      const feResult = await createFinancialEntryWithConn(conn, {
        property_id: propId,
        maintenance_id: maintenanceId,
        entry_type: "REPAIR_FEE",
        direction: "OUT",
        amount: costData.amount,
        currency: costData.currency ?? "VND",
        occurred_at: costData.occurred_at || new Date(),
      });
      financialEntryId = feResult.insertId;
    }

    const [history] = await conn.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
      [propId]
    );

    await conn.commit();
    return { audit_notes: auditNotes, trigger_effect: history, financial_entry_id: financialEntryId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function completeMaintenanceRequest(maintenanceId, costData = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[maint]] = await conn.query(
      "SELECT * FROM maintenance_request WHERE maintenance_id = ? FOR UPDATE",
      [maintenanceId]
    );
    if (!maint) {
      await conn.rollback();
      return null;
    }

    await conn.query(
      "UPDATE maintenance_request SET status = 'COMPLETED', closed_at = CURRENT_TIMESTAMP WHERE maintenance_id = ?",
      [maintenanceId]
    );

    let financialEntryId = null;
    if (Boolean(maint.blocking_flag)) {
      const [[{ openBlocking }]] = await conn.query(
        "SELECT COUNT(*) AS openBlocking FROM maintenance_request WHERE property_id = ? AND maintenance_id <> ? AND blocking_flag = TRUE AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')",
        [maint.property_id, maintenanceId]
      );

      if (openBlocking === 0) {
        const [[{ activeLeases }]] = await conn.query(
          "SELECT COUNT(*) AS activeLeases FROM lease WHERE property_id = ? AND lease_status = 'ACTIVE'",
          [maint.property_id]
        );
        const nextStatus = activeLeases > 0 ? "LEASED" : "AVAILABLE";
        await syncPropertyStatusAndHistory(
          conn,
          maint.property_id,
          nextStatus,
          `Hoàn tất bảo trì cản trở cuối #${maintenanceId}`
        );
      }
    }

    // Tự động ghi nhận chi phí bảo trì vào sổ cái tài chính (nếu có costData)
    if (costData && costData.amount > 0) {
      const feResult = await createFinancialEntryWithConn(conn, {
        property_id: maint.property_id,
        maintenance_id: maintenanceId,
        entry_type: "REPAIR_FEE",
        direction: "OUT",
        amount: costData.amount,
        currency: costData.currency ?? "VND",
        occurred_at: costData.occurred_at || new Date(),
      });
      financialEntryId = feResult.insertId;
    }

    const [history] = await conn.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
      [maint.property_id]
    );

    await conn.commit();
    return {
      property_id: maint.property_id,
      financial_entry_id: financialEntryId,
      trigger_effect: history,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteMaintenanceRequest(maintenanceId) {
  const [result] = await pool.query(
    "DELETE FROM maintenance_request WHERE maintenance_id = ?",
    [maintenanceId]
  );
  return result.affectedRows > 0;
}
