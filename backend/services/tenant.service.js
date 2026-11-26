import pool from "../config/db.js";

export async function listTenants({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM tenant");
  const [rows] = await pool.query(
    "SELECT tenant_id, full_name, email, phone FROM tenant ORDER BY tenant_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "tenant_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getTenantById(tenantId) {
  const [[row]] = await pool.query(
    "SELECT tenant_id, full_name, email, phone FROM tenant WHERE tenant_id = ?",
    [tenantId]
  );
  return row || null;
}

export async function createTenant(data) {
  const payload = {
    full_name: data.full_name,
    email: data.email,
    phone: data.phone,
  };
  const [result] = await pool.query("INSERT INTO tenant SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updateTenant(tenantId, data) {
  const [[oldRow]] = await pool.query("SELECT * FROM tenant WHERE tenant_id = ?", [tenantId]);
  if (!oldRow) return null;

  const updates = {};
  for (const field of ["full_name", "email", "phone"]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE tenant SET ? WHERE tenant_id = ?", [updates, tenantId]);
  }
  return { updated: true };
}

export async function deleteTenant(tenantId) {
  const [result] = await pool.query("DELETE FROM tenant WHERE tenant_id = ?", [tenantId]);
  return result.affectedRows > 0;
}
