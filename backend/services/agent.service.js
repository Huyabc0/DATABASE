import pool from "../config/db.js";

export async function listAgents({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM agent");
  const [rows] = await pool.query(
    "SELECT agent_id, license_no, full_name, email, agent_status FROM agent ORDER BY agent_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "agent_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getAgentById(agentId) {
  const [[row]] = await pool.query(
    "SELECT agent_id, license_no, full_name, email, agent_status FROM agent WHERE agent_id = ?",
    [agentId]
  );
  return row || null;
}

export async function createAgent(data) {
  const payload = {
    license_no: data.license_no,
    full_name: data.full_name,
    email: data.email,
    agent_status: data.agent_status ?? "ACTIVE",
  };
  const [result] = await pool.query("INSERT INTO agent SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updateAgent(agentId, data) {
  const [[oldRow]] = await pool.query("SELECT * FROM agent WHERE agent_id = ?", [agentId]);
  if (!oldRow) return null;

  const updates = {};
  for (const field of ["license_no", "full_name", "email", "agent_status"]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE agent SET ? WHERE agent_id = ?", [updates, agentId]);
  }
  return { updated: true };
}

export async function deleteAgent(agentId) {
  const [result] = await pool.query("DELETE FROM agent WHERE agent_id = ?", [agentId]);
  return result.affectedRows > 0;
}
