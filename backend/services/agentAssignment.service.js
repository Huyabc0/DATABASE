import pool from "../config/db.js";

export async function listAgentAssignments({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM agent_assignment");
  const [rows] = await pool.query(
    `SELECT aa.assignment_id, aa.listing_id, aa.agent_id, a.full_name AS agent_name,
            aa.assignment_role, aa.assigned_from, aa.assigned_to
     FROM agent_assignment aa
     JOIN agent a ON aa.agent_id = a.agent_id
     ORDER BY aa.assignment_id DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "assignment_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getAgentAssignmentById(assignmentId) {
  const [[row]] = await pool.query(
    "SELECT assignment_id, listing_id, agent_id, assignment_role, assigned_from, assigned_to FROM agent_assignment WHERE assignment_id = ?",
    [assignmentId]
  );
  return row || null;
}

export async function createAgentAssignment(data) {
  const payload = {
    listing_id: data.listing_id,
    agent_id: data.agent_id,
    assignment_role: data.assignment_role ?? "LEAD",
    assigned_from: data.assigned_from || new Date(),
    assigned_to: data.assigned_to ?? null,
  };
  const [result] = await pool.query("INSERT INTO agent_assignment SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updateAgentAssignment(assignmentId, data) {
  const [[oldRow]] = await pool.query(
    "SELECT * FROM agent_assignment WHERE assignment_id = ?",
    [assignmentId]
  );
  if (!oldRow) return null;

  const updates = {};
  for (const field of [
    "listing_id",
    "agent_id",
    "assignment_role",
    "assigned_from",
    "assigned_to",
  ]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE agent_assignment SET ? WHERE assignment_id = ?", [
      updates,
      assignmentId,
    ]);
  }
  return { updated: true };
}

export async function deleteAgentAssignment(assignmentId) {
  const [result] = await pool.query("DELETE FROM agent_assignment WHERE assignment_id = ?", [
    assignmentId,
  ]);
  return result.affectedRows > 0;
}
