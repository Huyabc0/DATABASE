import pool from "../config/db.js";

export async function listPropertyStatusHistories({ page, limit, offset, propertyId }) {
  const start = performance.now();
  const whereClause = propertyId ? "WHERE property_id = ?" : "";
  const params = propertyId ? [propertyId] : [];

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM property_status_history ${whereClause}`,
    params
  );
  const [rows] = await pool.query(
    `SELECT status_history_id, property_id, status, valid_from, valid_to, reason
     FROM property_status_history ${whereClause}
     ORDER BY status_history_id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "status_history_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getPropertyStatusHistoryById(statusHistoryId) {
  const [[row]] = await pool.query(
    "SELECT status_history_id, property_id, status, valid_from, valid_to, reason FROM property_status_history WHERE status_history_id = ?",
    [statusHistoryId]
  );
  return row || null;
}

export async function createPropertyStatusHistory(data) {
  const payload = {
    property_id: data.property_id,
    status: data.status,
    valid_from: data.valid_from || new Date(),
    valid_to: data.valid_to ?? null,
    reason: data.reason ?? null,
  };
  const [result] = await pool.query("INSERT INTO property_status_history SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updatePropertyStatusHistory(statusHistoryId, data) {
  const [[oldRow]] = await pool.query(
    "SELECT * FROM property_status_history WHERE status_history_id = ?",
    [statusHistoryId]
  );
  if (!oldRow) return null;

  const updates = {};
  for (const field of ["property_id", "status", "valid_from", "valid_to", "reason"]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query(
      "UPDATE property_status_history SET ? WHERE status_history_id = ?",
      [updates, statusHistoryId]
    );
  }
  return { updated: true };
}

export async function deletePropertyStatusHistory(statusHistoryId) {
  const [result] = await pool.query(
    "DELETE FROM property_status_history WHERE status_history_id = ?",
    [statusHistoryId]
  );
  return result.affectedRows > 0;
}
