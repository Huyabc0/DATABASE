import * as leaseTenantService from "../services/leaseTenant.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

export async function getLeaseTenants(req, res) {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const leaseId = req.query.lease_id ? parsePositiveInt(req.query.lease_id) : null;
    const tenantId = req.query.tenant_id ? parsePositiveInt(req.query.tenant_id) : null;
    const result = await leaseTenantService.listLeaseTenants({
      page,
      limit,
      offset,
      leaseId,
      tenantId,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getLeaseTenant(req, res) {
  const leaseId = parsePositiveInt(req.params.leaseId);
  const tenantId = parsePositiveInt(req.params.tenantId);
  if (!leaseId || !tenantId) {
    return res.status(400).json({ error: "leaseId hoặc tenantId không hợp lệ." });
  }

  try {
    const row = await leaseTenantService.getLeaseTenant(leaseId, tenantId);
    if (!row) {
      return res.status(404).json({ error: "Không tìm thấy khách thuê trong hợp đồng này." });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createLeaseTenant(req, res) {
  const data = sanitizePayload(req.body);
  if (!data.lease_id || !data.tenant_id || !data.joined_on) {
    return res
      .status(400)
      .json({ error: "Thiếu thông tin bắt buộc: lease_id, tenant_id, joined_on." });
  }

  try {
    const created = await leaseTenantService.createLeaseTenant(data);
    res.status(201).json({
      message: "Gán khách thuê vào hợp đồng thành công!",
      data: created,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease_tenant") });
  }
}

export async function updateLeaseTenant(req, res) {
  const leaseId = parsePositiveInt(req.params.leaseId);
  const tenantId = parsePositiveInt(req.params.tenantId);
  if (!leaseId || !tenantId) {
    return res.status(400).json({ error: "leaseId hoặc tenantId không hợp lệ." });
  }

  const data = sanitizePayload(req.body);
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Dữ liệu cập nhật đang trống." });
  }

  try {
    const result = await leaseTenantService.updateLeaseTenant(leaseId, tenantId, data);
    if (!result) {
      return res.status(404).json({ error: "Không tìm thấy khách thuê trong hợp đồng này." });
    }
    res.json({ message: "Cập nhật thông tin khách thuê trong hợp đồng thành công!" });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease_tenant") });
  }
}

export async function deleteLeaseTenant(req, res) {
  const leaseId = parsePositiveInt(req.params.leaseId);
  const tenantId = parsePositiveInt(req.params.tenantId);
  if (!leaseId || !tenantId) {
    return res.status(400).json({ error: "leaseId hoặc tenantId không hợp lệ." });
  }

  try {
    const deleted = await leaseTenantService.deleteLeaseTenant(leaseId, tenantId);
    if (!deleted) {
      return res.status(404).json({ error: "Không tìm thấy khách thuê trong hợp đồng này." });
    }
    res.json({ message: "Gỡ khách thuê khỏi hợp đồng thành công!" });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "lease_tenant") });
  }
}
