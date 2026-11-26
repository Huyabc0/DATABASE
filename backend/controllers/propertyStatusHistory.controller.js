import * as historyService from "../services/propertyStatusHistory.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_STATUSES = ["AVAILABLE", "LEASED", "UNDER_MAINTENANCE"];

export async function getPropertyStatusHistories(req, res) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const propertyId = req.query.property_id ? parsePositiveInt(req.query.property_id) : null;
    const result = await historyService.listPropertyStatusHistories({
      page,
      limit,
      offset,
      propertyId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPropertyStatusHistoryById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "status_history_id không hợp lệ." });
  try {
    const row = await historyService.getPropertyStatusHistoryById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy lịch sử #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createPropertyStatusHistory(req, res) {
  const data = sanitizePayload(req.body);
  delete data.status_history_id;
  if (!data.property_id || !data.status) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc: property_id, status." });
  }
  if (!VALID_STATUSES.includes(data.status)) {
    return res
      .status(400)
      .json({ error: "Trạng thái không hợp lệ (AVAILABLE, LEASED, UNDER_MAINTENANCE)." });
  }

  try {
    const result = await historyService.createPropertyStatusHistory(data);
    res.status(201).json({
      message: `Thêm mới lịch sử trạng thái thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_status_history") });
  }
}

export async function updatePropertyStatusHistory(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "status_history_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.status_history_id;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }
  if (data.status !== undefined && !VALID_STATUSES.includes(data.status)) {
    return res
      .status(400)
      .json({ error: "Trạng thái không hợp lệ (AVAILABLE, LEASED, UNDER_MAINTENANCE)." });
  }

  try {
    const result = await historyService.updatePropertyStatusHistory(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy lịch sử #${id}.` });
    res.json({ message: `Cập nhật lịch sử trạng thái #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_status_history", id) });
  }
}

export async function deletePropertyStatusHistory(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "status_history_id không hợp lệ." });

  try {
    const deleted = await historyService.deletePropertyStatusHistory(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy lịch sử #${id}.` });
    res.json({ message: `Xóa lịch sử trạng thái #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_status_history", id) });
  }
}
