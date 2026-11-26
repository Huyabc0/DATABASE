import * as propertyService from "../services/property.service.js";
import { leasePropertyWorkflow } from "../services/lease.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_PROPERTY_STATUSES = ["AVAILABLE", "LEASED", "UNDER_MAINTENANCE"];

function validatePropertyData(data, isUpdate = false) {
  if (!data || Object.keys(data).length === 0) {
    return "Dữ liệu gửi lên đang trống.";
  }
  if (!isUpdate && (!data.address || !data.property_type || data.area === undefined)) {
    return "Thiếu thông tin bắt buộc: address, property_type hoặc area.";
  }
  if (data.area !== undefined && Number(data.area) <= 0) {
    return "Diện tích (area) phải lớn hơn 0.";
  }
  if (data.bedrooms !== undefined && Number(data.bedrooms) < 0) {
    return "Số phòng ngủ (bedrooms) không được âm.";
  }
  if (
    data.current_status !== undefined &&
    !VALID_PROPERTY_STATUSES.includes(data.current_status)
  ) {
    return "Trạng thái BĐS không hợp lệ (chỉ nhận AVAILABLE, LEASED, UNDER_MAINTENANCE).";
  }
  return null;
}

export async function getProperties(req, res) {
  try {
    const result = await propertyService.listProperties(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPropertyById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "property_id không hợp lệ." });
  try {
    const row = await propertyService.getPropertyById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy bất động sản #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createProperty(req, res) {
  const data = sanitizePayload(req.body);
  delete data.property_id;
  const errMsg = validatePropertyData(data, false);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await propertyService.createProperty(data);
    res.status(201).json({
      message: `Thêm mới bất động sản thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property") });
  }
}

export async function updateProperty(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "property_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.property_id;
  const errMsg = validatePropertyData(data, true);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await propertyService.updateProperty(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy bất động sản #${id}.` });
    res.json({
      message: `Cập nhật bất động sản #${id} thành công!`,
      audit_notes: result.audit_notes,
      trigger_effect: result.trigger_effect,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property", id) });
  }
}

export async function deleteProperty(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "property_id không hợp lệ." });

  try {
    const deleted = await propertyService.deleteProperty(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy bất động sản #${id}.` });
    res.json({ message: `Xóa bất động sản #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property", id) });
  }
}

export async function leaseProperty(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "property_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  try {
    const result = await leasePropertyWorkflow(id, data);
    res.status(201).json({
      message: `Cho thuê BĐS #${id} thành công (Hợp đồng #${result.lease_id})!`,
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease", id) });
  }
}
