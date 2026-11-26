import pool from "../config/db.js";

export async function listLeaseTenants({ page, limit, offset, leaseId, tenantId }) {
  const start = performance.now();
  const conditions = [];
  const params = [];

  if (leaseId) {
    conditions.push("lt.lease_id = ?");
    params.push(leaseId);
  }
  if (tenantId) {
    conditions.push("lt.tenant_id = ?");
    params.push(tenantId);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM lease_tenant lt ${whereClause}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT lt.lease_id, lt.tenant_id, t.full_name AS tenant_name, t.phone,
            lt.tenant_role, lt.joined_on, lt.left_on
     FROM lease_tenant lt
     JOIN tenant t ON lt.tenant_id = t.tenant_id
     ${whereClause}
     ORDER BY lt.lease_id DESC, lt.tenant_id ASC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "lease_id,tenant_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getLeaseTenant(leaseId, tenantId) {
  const [[row]] = await pool.query(
    "SELECT lease_id, tenant_id, tenant_role, joined_on, left_on FROM lease_tenant WHERE lease_id = ? AND tenant_id = ?",
    [leaseId, tenantId]
  );
  return row || null;
}

export async function createLeaseTenant(data) {
  const payload = {
    lease_id: data.lease_id,
    tenant_id: data.tenant_id,
    tenant_role: data.tenant_role ?? "PRIMARY",
    joined_on: data.joined_on,
    left_on: data.left_on ?? null,
  };
  await pool.query("INSERT INTO lease_tenant SET ?", [payload]);
  return payload;
}

export async function updateLeaseTenant(leaseId, tenantId, data) {
  const [[oldRow]] = await pool.query(
    "SELECT * FROM lease_tenant WHERE lease_id = ? AND tenant_id = ?",
    [leaseId, tenantId]
  );
  if (!oldRow) return null;

  const updates = {};
  for (const field of ["tenant_role", "joined_on", "left_on"]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE lease_tenant SET ? WHERE lease_id = ? AND tenant_id = ?", [
      updates,
      leaseId,
      tenantId,
    ]);
  }
  return { updated: true };
}

export async function deleteLeaseTenant(leaseId, tenantId) {
  const [result] = await pool.query(
    "DELETE FROM lease_tenant WHERE lease_id = ? AND tenant_id = ?",
    [leaseId, tenantId]
  );
  return result.affectedRows > 0;
}
