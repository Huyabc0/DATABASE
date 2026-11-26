import * as assignService from "../services/agentAssignment.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_ROLES = ["LEAD", "SUPPORT"];

export async function getAgentAssignments(req, res) {
  try {
    const result = await assignService.listAgentAssignments(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAgentAssignmentById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "assignment_id không hợp lệ." });
  try {
    const row = await assignService.getAgentAssignmentById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy phân công #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createAgentAssignment(req, res) {
  const data = sanitizePayload(req.body);
  delete data.assignment_id;
  if (!data.listing_id || !data.agent_id) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc: listing_id, agent_id." });
  }
  if (data.assignment_role !== undefined && !VALID_ROLES.includes(data.assignment_role)) {
    return res.status(400).json({ error: "assignment_role chỉ nhận LEAD hoặc SUPPORT." });
  }

  try {
    const result = await assignService.createAgentAssignment(data);
    res.status(201).json({
      message: `Thêm mới phân công môi giới thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent_assignment") });
  }
}

export async function updateAgentAssignment(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "assignment_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.assignment_id;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }
  if (data.assignment_role !== undefined && !VALID_ROLES.includes(data.assignment_role)) {
    return res.status(400).json({ error: "assignment_role chỉ nhận LEAD hoặc SUPPORT." });
  }

  try {
    const result = await assignService.updateAgentAssignment(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy phân công #${id}.` });
    res.json({ message: `Cập nhật phân công #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent_assignment", id) });
  }
}

export async function deleteAgentAssignment(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "assignment_id không hợp lệ." });

  try {
    const deleted = await assignService.deleteAgentAssignment(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy phân công #${id}.` });
    res.json({ message: `Xóa phân công #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent_assignment", id) });
  }
}
