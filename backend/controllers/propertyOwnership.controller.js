import * as ownershipService from "../services/propertyOwnership.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

export async function getPropertyOwnerships(req, res) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const propertyId = req.query.property_id ? parsePositiveInt(req.query.property_id) : null;
    const ownerId = req.query.owner_id ? parsePositiveInt(req.query.owner_id) : null;
    const result = await ownershipService.listPropertyOwnerships({
      page,
      limit,
      offset,
      propertyId,
      ownerId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getPropertyOwnership(req, res) {
  const ownerId = parsePositiveInt(req.params.ownerId);
  const propertyId = parsePositiveInt(req.params.propertyId);
  if (!ownerId || !propertyId) {
    return res.status(400).json({ error: "ownerId hoặc propertyId không hợp lệ." });
  }
  try {
    const rows = await ownershipService.getPropertyOwnership(
      ownerId,
      propertyId,
      req.query.valid_from || null
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy thông tin quyền sở hữu." });
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createPropertyOwnership(req, res) {
  const data = sanitizePayload(req.body);
  if (!data.owner_id || !data.property_id || data.ownership_share === undefined) {
    return res
      .status(400)
      .json({ error: "Thiếu thông tin bắt buộc: owner_id, property_id, ownership_share." });
  }
  const share = Number(data.ownership_share);
  if (Number.isNaN(share) || share <= 0 || share > 100) {
    return res.status(400).json({ error: "Tỷ lệ sở hữu (ownership_share) phải > 0 và <= 100." });
  }

  try {
    const created = await ownershipService.createPropertyOwnership(data);
    res.status(201).json({
      message: "Thêm quyền sở hữu bất động sản thành công!",
      data: created,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_ownership") });
  }
}

export async function updatePropertyOwnership(req, res) {
  const ownerId = parsePositiveInt(req.params.ownerId);
  const propertyId = parsePositiveInt(req.params.propertyId);
  if (!ownerId || !propertyId) {
    return res.status(400).json({ error: "ownerId hoặc propertyId không hợp lệ." });
  }

  const data = sanitizePayload(req.body);
  if (data.ownership_share !== undefined) {
    const share = Number(data.ownership_share);
    if (Number.isNaN(share) || share <= 0 || share > 100) {
      return res.status(400).json({ error: "Tỷ lệ sở hữu (ownership_share) phải > 0 và <= 100." });
    }
  }

  try {
    const validFrom = req.query.valid_from || data.valid_from || null;
    const result = await ownershipService.updatePropertyOwnership(
      ownerId,
      propertyId,
      validFrom,
      data
    );
    if (!result) {
      return res.status(404).json({ error: "Không tìm thấy bản ghi quyền sở hữu cần cập nhật." });
    }
    res.json({ message: "Cập nhật quyền sở hữu thành công!" });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_ownership") });
  }
}

export async function deletePropertyOwnership(req, res) {
  const ownerId = parsePositiveInt(req.params.ownerId);
  const propertyId = parsePositiveInt(req.params.propertyId);
  if (!ownerId || !propertyId) {
    return res.status(400).json({ error: "ownerId hoặc propertyId không hợp lệ." });
  }

  try {
    const validFrom = req.query.valid_from || null;
    const deleted = await ownershipService.deletePropertyOwnership(ownerId, propertyId, validFrom);
    if (!deleted) {
      return res.status(404).json({ error: "Không tìm thấy bản ghi quyền sở hữu cần xóa." });
    }
    res.json({ message: "Xóa quyền sở hữu thành công!" });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "property_ownership") });
  }
}
