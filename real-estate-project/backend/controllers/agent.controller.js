import * as agentService from "../services/agent.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_AGENT_STATUSES = ["ACTIVE", "SUSPENDED", "INACTIVE"];

export async function getAgents(req, res) {
  try {
    const result = await agentService.listAgents(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getAgentById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "agent_id không hợp lệ." });
  try {
    const row = await agentService.getAgentById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy môi giới #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createAgent(req, res) {
  const data = sanitizePayload(req.body);
  if (!data.license_no || !data.full_name || !data.email) {
    return res
      .status(400)
      .json({ error: "Thiếu thông tin bắt buộc: license_no, full_name, email." });
  }
  if (data.agent_status !== undefined && !VALID_AGENT_STATUSES.includes(data.agent_status)) {
    return res
      .status(400)
      .json({ error: "agent_status không hợp lệ (ACTIVE, SUSPENDED, INACTIVE)." });
  }

  try {
    const result = await agentService.createAgent(data);
    res.status(201).json({
      message: `Thêm mới môi giới thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent") });
  }
}

export async function updateAgent(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "agent_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }
  if (data.agent_status !== undefined && !VALID_AGENT_STATUSES.includes(data.agent_status)) {
    return res
      .status(400)
      .json({ error: "agent_status không hợp lệ (ACTIVE, SUSPENDED, INACTIVE)." });
  }

  try {
    const result = await agentService.updateAgent(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy môi giới #${id}.` });
    res.json({ message: `Cập nhật môi giới #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent", id) });
  }
}

export async function deleteAgent(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "agent_id không hợp lệ." });

  try {
    const deleted = await agentService.deleteAgent(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy môi giới #${id}.` });
    res.json({ message: `Xóa môi giới #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "agent", id) });
  }
}
