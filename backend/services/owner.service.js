import pool from "../config/db.js";

export async function listOwners({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM owner");
  const [rows] = await pool.query(
    "SELECT owner_id, full_name, email, phone FROM owner ORDER BY owner_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "owner_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getOwnerById(ownerId) {
  const [[row]] = await pool.query(
    "SELECT owner_id, full_name, email, phone FROM owner WHERE owner_id = ?",
    [ownerId]
  );
  return row || null;
}

export async function createOwner(data) {
  const payload = {
    full_name: data.full_name,
    email: data.email,
    phone: data.phone,
  };
  const [result] = await pool.query("INSERT INTO owner SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updateOwner(ownerId, data) {
  const [[oldRow]] = await pool.query("SELECT * FROM owner WHERE owner_id = ?", [ownerId]);
  if (!oldRow) return null;

  const updates = {};
  if (data.full_name !== undefined) updates.full_name = data.full_name;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE owner SET ? WHERE owner_id = ?", [updates, ownerId]);
  }
  return { updated: true };
}

export async function deleteOwner(ownerId) {
  const [result] = await pool.query("DELETE FROM owner WHERE owner_id = ?", [ownerId]);
  return result.affectedRows > 0;
}
