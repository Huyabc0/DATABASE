import * as tenantService from "../services/tenant.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

export async function getTenants(req, res) {
  try {
    const result = await tenantService.listTenants(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getTenantById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "tenant_id không hợp lệ." });
  try {
    const row = await tenantService.getTenantById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy khách thuê #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createTenant(req, res) {
  const data = sanitizePayload(req.body);
  delete data.tenant_id;
  if (!data.full_name || !data.email || !data.phone) {
    return res.status(400).json({ error: "Thiếu thông tin bắt buộc: full_name, email, phone." });
  }

  try {
    const result = await tenantService.createTenant(data);
    res.status(201).json({
      message: `Thêm mới khách thuê thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "tenant") });
  }
}

export async function updateTenant(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "tenant_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.tenant_id;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }

  try {
    const result = await tenantService.updateTenant(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy khách thuê #${id}.` });
    res.json({ message: `Cập nhật khách thuê #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "tenant", id) });
  }
}

export async function deleteTenant(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "tenant_id không hợp lệ." });

  try {
    const deleted = await tenantService.deleteTenant(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy khách thuê #${id}.` });
    res.json({ message: `Xóa khách thuê #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "tenant", id) });
  }
}
