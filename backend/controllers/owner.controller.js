import * as ownerService from "../services/owner.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

export async function getOwners(req, res) {
  try {
    const result = await ownerService.listOwners(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getOwnerById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "owner_id không hợp lệ." });
  try {
    const row = await ownerService.getOwnerById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy chủ sở hữu #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createOwner(req, res) {
  const data = sanitizePayload(req.body);
  if (!data.full_name || !data.email || !data.phone) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc: full_name, email, phone." });
  }

  try {
    const result = await ownerService.createOwner(data);
    res.status(201).json({
      message: `Thêm mới chủ sở hữu thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "owner") });
  }
}

export async function updateOwner(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "owner_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }

  try {
    const result = await ownerService.updateOwner(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy chủ sở hữu #${id}.` });
    res.json({ message: `Cập nhật chủ sở hữu #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "owner", id) });
  }
}

export async function deleteOwner(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "owner_id không hợp lệ." });

  try {
    const deleted = await ownerService.deleteOwner(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy chủ sở hữu #${id}.` });
    res.json({ message: `Xóa chủ sở hữu #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "owner", id) });
  }
}
