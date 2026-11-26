import pool from "../config/db.js";
import { syncPropertyStatusAndHistory } from "./propertyStatusSync.service.js";

export async function listProperties({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM property");
  const [rows] = await pool.query(
    "SELECT * FROM property ORDER BY property_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "property_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getPropertyById(propertyId) {
  const [[row]] = await pool.query(
    "SELECT * FROM property WHERE property_id = ?",
    [propertyId]
  );
  return row || null;
}

export async function createProperty(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const payload = {
      address: data.address,
      unit: data.unit ?? null,
      property_type: data.property_type,
      area: data.area,
      bedrooms: data.bedrooms ?? 0,
      current_status: data.current_status ?? "AVAILABLE",
    };

    const [result] = await conn.query("INSERT INTO property SET ?", [payload]);
    const insertId = result.insertId;

    // Đồng bộ lịch sử trạng thái khởi tạo (chống trùng với trg_property_init_status)
    const syncRes = await syncPropertyStatusAndHistory(
      conn,
      insertId,
      payload.current_status,
      "Khởi tạo bất động sản mới"
    );

    const auditNotes = [
      syncRes.history_updated
        ? `Đã khởi tạo lịch sử trạng thái '${payload.current_status}' trong property_status_history.`
        : `Lịch sử trạng thái '${payload.current_status}' đã được đồng bộ.`,
    ];

    const [history] = await conn.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC",
      [insertId]
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

export async function updateProperty(propertyId, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oldRow]] = await conn.query(
      "SELECT * FROM property WHERE property_id = ? FOR UPDATE",
      [propertyId]
    );
    if (!oldRow) {
      await conn.rollback();
      return null;
    }

    const updates = {};
    for (const field of [
      "address",
      "unit",
      "property_type",
      "area",
      "bedrooms",
      "current_status",
    ]) {
      if (data[field] !== undefined) updates[field] = data[field];
    }

    if (Object.keys(updates).length > 0) {
      await conn.query("UPDATE property SET ? WHERE property_id = ?", [updates, propertyId]);
    }

    const auditNotes = [];
    let triggerEffect = null;

    // Nếu current_status thay đổi -> Đồng bộ property_status_history & tạm dừng listing ACTIVE
    if (updates.current_status && updates.current_status !== oldRow.current_status) {
      const syncRes = await syncPropertyStatusAndHistory(
        conn,
        propertyId,
        updates.current_status,
        `Cập nhật trạng thái BĐS từ ${oldRow.current_status} sang ${updates.current_status}`
      );
      auditNotes.push(
        `Trạng thái BĐS đổi (${oldRow.current_status} -> ${updates.current_status}): Đã cập nhật valid_to cũ, thêm dòng mới vào property_status_history và tạm dừng ${syncRes.paused_listings_count} tin đăng.`
      );
      const [history] = await conn.query(
        "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
        [propertyId]
      );
      triggerEffect = history;
    }

    await conn.commit();
    return { audit_notes: auditNotes, trigger_effect: triggerEffect };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteProperty(propertyId) {
  const [result] = await pool.query("DELETE FROM property WHERE property_id = ?", [propertyId]);
  return result.affectedRows > 0;
}
