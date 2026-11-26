import * as leaseService from "../services/lease.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_LEASE_STATUSES = ["DRAFT", "ACTIVE", "EXPIRED", "TERMINATED", "CANCELLED"];

function validateLeaseData(data, isUpdate = false) {
  if (!data || Object.keys(data).length === 0) {
    return "Dữ liệu gửi lên đang trống.";
  }
  if (
    !isUpdate &&
    (!data.property_id || !data.start_date || !data.end_date || data.monthly_rent === undefined)
  ) {
    return "Thiếu thông tin bắt buộc: property_id, start_date, end_date hoặc monthly_rent.";
  }
  if (data.monthly_rent !== undefined && Number(data.monthly_rent) <= 0) {
    return "Tiền thuê hàng tháng (monthly_rent) phải lớn hơn 0.";
  }
  if (data.deposit !== undefined && Number(data.deposit) < 0) {
    return "Tiền cọc (deposit) không được âm.";
  }
  if (data.start_date && data.end_date && new Date(data.end_date) < new Date(data.start_date)) {
    return "Ngày kết thúc hợp đồng (end_date) phải lớn hơn hoặc bằng ngày bắt đầu (start_date).";
  }
  if (data.lease_status !== undefined && !VALID_LEASE_STATUSES.includes(data.lease_status)) {
    return "Trạng thái hợp đồng không hợp lệ (DRAFT, ACTIVE, EXPIRED, TERMINATED, CANCELLED).";
  }
  return null;
}

export async function getLeases(req, res) {
  try {
    const result = await leaseService.listLeases(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getLeaseById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "lease_id không hợp lệ." });
  try {
    const row = await leaseService.getLeaseById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy hợp đồng #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createLease(req, res) {
  const data = sanitizePayload(req.body);
  delete data.lease_id;
  const errMsg = validateLeaseData(data, false);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await leaseService.createLease(data);
    res.status(201).json({
      message: `Thêm mới hợp đồng thuê thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease") });
  }
}

export async function updateLease(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "lease_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.lease_id;
  const errMsg = validateLeaseData(data, true);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await leaseService.updateLease(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy hợp đồng #${id}.` });
    res.json({
      message: `Cập nhật hợp đồng #${id} thành công!`,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease", id) });
  }
}

export async function deleteLease(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "lease_id không hợp lệ." });

  try {
    const deleted = await leaseService.deleteLease(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy hợp đồng #${id}.` });
    res.json({ message: `Xóa hợp đồng #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease", id) });
  }
}

/**
 * POST /api/leases/rent
 * Workflow cho thuê hoàn chỉnh (1 transaction):
 * - Check property AVAILABLE
 * - Tìm/tạo tenant
 * - Tìm listing RENT
 * - Tạo lease ACTIVE + lease_tenant
 * - Đồng bộ property -> LEASED + property_status_history
 * - Đóng listing -> CLOSED + kết thúc agent_assignment
 * - Ghi financial_entry: DEPOSIT (IN) + RENT kỳ đầu (IN)
 */
export async function rentPropertyWorkflow(req, res) {
  const data = sanitizePayload(req.body);

  if (!data.property_id) {
    return res.status(400).json({ error: "Thiếu property_id." });
  }

  try {
    const result = await leaseService.leasePropertyWorkflow(data.property_id, data);
    res.status(201).json({
      message: `Cho thuê BĐS #${data.property_id} thành công!`,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
