import * as maintenanceService from "../services/maintenance.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const VALID_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

function validateMaintenanceData(data, isUpdate = false) {
  if (!data || Object.keys(data).length === 0) {
    return "Dữ liệu gửi lên đang trống.";
  }
  if (!isUpdate && !data.property_id) {
    return "Thiếu thông tin bắt buộc: property_id.";
  }
  if (data.priority !== undefined && !VALID_PRIORITIES.includes(data.priority)) {
    return "Mức độ ưu tiên (priority) chỉ nhận LOW, MEDIUM, HIGH, URGENT.";
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    return "Trạng thái bảo trì không hợp lệ (OPEN, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED).";
  }
  return null;
}

export async function getMaintenanceRequests(req, res) {
  try {
    const result = await maintenanceService.listMaintenanceRequests(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getMaintenanceRequestById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "maintenance_id không hợp lệ." });
  try {
    const row = await maintenanceService.getMaintenanceRequestById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy yêu cầu bảo trì #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createMaintenanceRequest(req, res) {
  const data = sanitizePayload(req.body);
  delete data.maintenance_id;
  const errMsg = validateMaintenanceData(data, false);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await maintenanceService.createMaintenanceRequest(data);
    res.status(201).json({
      message: `Thêm mới yêu cầu bảo trì thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "maintenance_request") });
  }
}

export async function updateMaintenanceRequest(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "maintenance_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.maintenance_id;
  const errMsg = validateMaintenanceData(data, true);
  if (errMsg) return res.status(400).json({ error: errMsg });

  // Extract cost data for financial entry (optional)
  const { amount, currency, occurred_at, ...maintenanceData } = data;
  const parsedAmount = Number(amount);
  const costData = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? { amount: parsedAmount, currency, occurred_at }
    : null;

  try {
    const result = await maintenanceService.updateMaintenanceRequest(id, maintenanceData, costData);
    if (!result) return res.status(404).json({ error: `Không tìm thấy yêu cầu bảo trì #${id}.` });
    res.json({
      message: `Cập nhật yêu cầu bảo trì #${id} thành công!`,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
      financial_entry_id: result.financial_entry_id,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "maintenance_request", id) });
  }
}

export async function completeMaintenanceRequest(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "maintenance_id không hợp lệ." });

  // Extract cost data for financial entry (optional)
  const { amount, currency, occurred_at } = sanitizePayload(req.body);
  const parsedAmount = Number(amount);
  const costData = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? { amount: parsedAmount, currency, occurred_at }
    : null;

  try {
    const result = await maintenanceService.completeMaintenanceRequest(id, costData);
    if (!result) return res.status(404).json({ error: "Không tìm thấy yêu cầu bảo trì" });
    res.json({
      message: `Đã hoàn tất bảo trì #${id} và đồng bộ lại trạng thái BĐS #${result.property_id}.`,
      trigger_effect: result.trigger_effect,
      financial_entry_id: result.financial_entry_id,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteMaintenanceRequest(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "maintenance_id không hợp lệ." });

  try {
    const deleted = await maintenanceService.deleteMaintenanceRequest(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy yêu cầu bảo trì #${id}.` });
    res.json({ message: `Xóa yêu cầu bảo trì #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "maintenance_request", id) });
  }
}
