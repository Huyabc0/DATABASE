import pool from "../config/db.js";

export async function listPropertyOwnerships({ page, limit, offset, propertyId, ownerId }) {
  const start = performance.now();
  const conditions = [];
  const params = [];

  if (propertyId) {
    conditions.push("po.property_id = ?");
    params.push(propertyId);
  }
  if (ownerId) {
    conditions.push("po.owner_id = ?");
    params.push(ownerId);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM property_ownership po ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT po.owner_id, o.full_name AS owner_name, po.property_id, p.address, p.unit,
            po.ownership_share, po.valid_from, po.valid_to
     FROM property_ownership po
     JOIN owner o ON po.owner_id = o.owner_id
     JOIN property p ON po.property_id = p.property_id
     ${whereClause}
     ORDER BY po.valid_from DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "owner_id,property_id,valid_from",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getPropertyOwnership(ownerId, propertyId, validFrom) {
  let sql =
    "SELECT owner_id, property_id, ownership_share, valid_from, valid_to FROM property_ownership WHERE owner_id = ? AND property_id = ?";
  const params = [ownerId, propertyId];
  if (validFrom) {
    sql += " AND valid_from = ?";
    params.push(validFrom);
  } else {
    sql += " ORDER BY valid_from DESC";
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function createPropertyOwnership(data) {
  const payload = {
    owner_id: data.owner_id,
    property_id: data.property_id,
    ownership_share: data.ownership_share,
    valid_from: data.valid_from || new Date(),
    valid_to: data.valid_to ?? null,
  };
  await pool.query("INSERT INTO property_ownership SET ?", [payload]);
  return payload;
}

export async function updatePropertyOwnership(ownerId, propertyId, validFrom, data) {
  const updates = {};
  if (data.ownership_share !== undefined) updates.ownership_share = data.ownership_share;
  if (data.valid_to !== undefined) updates.valid_to = data.valid_to;

  if (Object.keys(updates).length === 0) {
    return { updated: false };
  }

  let sql = "UPDATE property_ownership SET ? WHERE owner_id = ? AND property_id = ?";
  const params = [updates, ownerId, propertyId];
  if (validFrom) {
    sql += " AND valid_from = ?";
    params.push(validFrom);
  } else {
    sql += " AND valid_to IS NULL";
  }

  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0 ? { updated: true } : null;
}

export async function deletePropertyOwnership(ownerId, propertyId, validFrom) {
  let sql = "DELETE FROM property_ownership WHERE owner_id = ? AND property_id = ?";
  const params = [ownerId, propertyId];
  if (validFrom) {
    sql += " AND valid_from = ?";
    params.push(validFrom);
  }
  const [result] = await pool.query(sql, params);
  return result.affectedRows > 0;
}
