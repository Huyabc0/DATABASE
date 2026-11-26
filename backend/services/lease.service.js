import pool from "../config/db.js";
import { syncPropertyStatusAndHistory } from "./propertyStatusSync.service.js";

export async function listLeases({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM lease");
  const [rows] = await pool.query(
    "SELECT * FROM lease ORDER BY lease_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "lease_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getLeaseById(leaseId) {
  const [[row]] = await pool.query(
    "SELECT * FROM lease WHERE lease_id = ?",
    [leaseId]
  );
  return row || null;
}

export async function createLease(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const payload = {
      property_id: data.property_id,
      origin_listing_id: data.origin_listing_id ?? null,
      start_date: data.start_date,
      end_date: data.end_date,
      monthly_rent: data.monthly_rent,
      deposit: data.deposit ?? 0.0,
      lease_status: data.lease_status ?? "DRAFT",
    };

    if (payload.origin_listing_id) {
      const [[lst]] = await conn.query(
        "SELECT listing_id, property_id, listing_type FROM listing WHERE listing_id = ?",
        [payload.origin_listing_id]
      );
      if (!lst || Number(lst.property_id) !== Number(payload.property_id) || lst.listing_type !== "RENT") {
        throw new Error(
          `Tin đăng nguồn #${payload.origin_listing_id} không tồn tại, không thuộc BĐS #${payload.property_id} hoặc không phải loại RENT.`
        );
      }
    }

    if (payload.lease_status === "ACTIVE") {
      const [[overlap]] = await conn.query(
        "SELECT lease_id FROM lease WHERE property_id = ? AND lease_status = 'ACTIVE' AND NOT (end_date < ? OR start_date > ?) LIMIT 1",
        [payload.property_id, payload.start_date, payload.end_date]
      );
      if (overlap) {
        throw new Error(
          `Vi phạm BR-12: BĐS #${payload.property_id} đã có hợp đồng ACTIVE #${overlap.lease_id} bị chồng lấn thời gian.`
        );
      }
    }

    const [result] = await conn.query("INSERT INTO lease SET ?", [payload]);
    const insertId = result.insertId;

    const auditNotes = [];
    if (payload.lease_status === "ACTIVE") {
      const [[{ openBlocking }]] = await conn.query(
        "SELECT COUNT(*) AS openBlocking FROM maintenance_request WHERE property_id = ? AND blocking_flag = TRUE AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')",
        [payload.property_id]
      );
      if (openBlocking === 0) {
        await syncPropertyStatusAndHistory(
          conn,
          payload.property_id,
          "LEASED",
          `Kích hoạt hợp đồng thuê #${insertId}`
        );
        auditNotes.push(`Đã chuyển BĐS #${payload.property_id} sang LEASED.`);
      } else {
        auditNotes.push(`HĐ #${insertId} ACTIVE nhưng BĐS #${payload.property_id} giữ trạng thái UNDER_MAINTENANCE do đang có bảo trì cản trở (BR-15).`);
      }
      if (payload.origin_listing_id) {
        await conn.query(
          "UPDATE listing SET listing_status = 'CLOSED', end_date = CURRENT_DATE WHERE listing_id = ? AND property_id = ? AND listing_status IN ('ACTIVE', 'PAUSED')",
          [payload.origin_listing_id, payload.property_id]
        );
        await conn.query(
          "UPDATE agent_assignment SET assigned_to = CURRENT_TIMESTAMP WHERE listing_id = ? AND assigned_to IS NULL",
          [payload.origin_listing_id]
        );
      }
    }

    await conn.commit();
    return { insertId, audit_notes: auditNotes, trigger_effect: null };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateLease(leaseId, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[oldRow]] = await conn.query("SELECT * FROM lease WHERE lease_id = ? FOR UPDATE", [
      leaseId,
    ]);
    if (!oldRow) {
      await conn.rollback();
      return null;
    }

    const updates = {};
    for (const field of [
      "property_id",
      "origin_listing_id",
      "start_date",
      "end_date",
      "monthly_rent",
      "deposit",
      "lease_status",
    ]) {
      if (data[field] !== undefined) updates[field] = data[field];
    }

    // Kiểm tra chéo ngày bắt đầu/kết thúc sau khi gộp dữ liệu cũ & mới
    const effectiveStart = updates.start_date ?? oldRow.start_date;
    const effectiveEnd = updates.end_date ?? oldRow.end_date;
    if (new Date(effectiveEnd) < new Date(effectiveStart)) {
      throw new Error("Ngày kết thúc hợp đồng (end_date) phải lớn hơn hoặc bằng ngày bắt đầu (start_date).");
    }

    // Kiểm tra chuyển trạng thái vòng đời hợp đồng theo BR-14
    if (updates.lease_status && updates.lease_status !== oldRow.lease_status) {
      if (["EXPIRED", "TERMINATED", "CANCELLED"].includes(oldRow.lease_status)) {
        throw new Error(`Vi phạm BR-14: Hợp đồng đã ở trạng thái kết thúc (${oldRow.lease_status}) không thể chuyển sang ${updates.lease_status}.`);
      }
      if (oldRow.lease_status === "DRAFT" && !["ACTIVE", "CANCELLED"].includes(updates.lease_status)) {
        throw new Error("Vi phạm BR-14: Hợp đồng DRAFT chỉ được chuyển sang ACTIVE hoặc CANCELLED.");
      }
      if (oldRow.lease_status === "ACTIVE" && !["EXPIRED", "TERMINATED"].includes(updates.lease_status)) {
        throw new Error("Vi phạm BR-14: Hợp đồng ACTIVE chỉ được chuyển sang EXPIRED hoặc TERMINATED.");
      }
    }

    const propId = updates.property_id || oldRow.property_id;
    const listingId =
      updates.origin_listing_id !== undefined
        ? updates.origin_listing_id
        : oldRow.origin_listing_id;

    if (listingId) {
      const [[lst]] = await conn.query(
        "SELECT listing_id, property_id, listing_type FROM listing WHERE listing_id = ?",
        [listingId]
      );
      if (!lst || Number(lst.property_id) !== Number(propId) || lst.listing_type !== "RENT") {
        throw new Error(
          `Tin đăng nguồn #${listingId} không tồn tại, không thuộc BĐS #${propId} hoặc không phải loại RENT.`
        );
      }
    }

    const nextStatus = updates.lease_status ?? oldRow.lease_status;
    if (nextStatus === "ACTIVE") {
      const [[overlap]] = await conn.query(
        "SELECT lease_id FROM lease WHERE property_id = ? AND lease_id <> ? AND lease_status = 'ACTIVE' AND NOT (end_date < ? OR start_date > ?) LIMIT 1",
        [propId, leaseId, effectiveStart, effectiveEnd]
      );
      if (overlap) {
        throw new Error(
          `Vi phạm BR-12: BĐS #${propId} đã có hợp đồng ACTIVE #${overlap.lease_id} bị chồng lấn thời gian.`
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await conn.query("UPDATE lease SET ? WHERE lease_id = ?", [updates, leaseId]);
    }

    const auditNotes = [];
    if (updates.lease_status && updates.lease_status !== oldRow.lease_status) {
      if (updates.lease_status === "ACTIVE") {
        const [[{ openBlocking }]] = await conn.query(
          "SELECT COUNT(*) AS openBlocking FROM maintenance_request WHERE property_id = ? AND blocking_flag = TRUE AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')",
          [propId]
        );
        if (openBlocking === 0) {
          await syncPropertyStatusAndHistory(
            conn,
            propId,
            "LEASED",
            `Hợp đồng thuê #${leaseId} có hiệu lực (ACTIVE)`
          );
          auditNotes.push(`HĐ #${leaseId} ACTIVE -> BĐS #${propId} chuyển sang LEASED & đóng tin đăng.`);
        } else {
          auditNotes.push(`HĐ #${leaseId} ACTIVE nhưng BĐS #${propId} giữ trạng thái UNDER_MAINTENANCE do đang có bảo trì cản trở (BR-15).`);
        }
        if (listingId) {
          await conn.query(
            "UPDATE listing SET listing_status = 'CLOSED', end_date = CURRENT_DATE WHERE listing_id = ? AND property_id = ? AND listing_status IN ('ACTIVE', 'PAUSED')",
            [listingId, propId]
          );
          await conn.query(
            "UPDATE agent_assignment SET assigned_to = CURRENT_TIMESTAMP WHERE listing_id = ? AND assigned_to IS NULL",
            [listingId]
          );
        }
      } else if (["EXPIRED", "TERMINATED", "CANCELLED"].includes(updates.lease_status)) {
        const [[{ otherActive }]] = await conn.query(
          "SELECT COUNT(*) AS otherActive FROM lease WHERE property_id = ? AND lease_id <> ? AND lease_status = 'ACTIVE'",
          [propId, leaseId]
        );
        const [[{ openBlocking }]] = await conn.query(
          "SELECT COUNT(*) AS openBlocking FROM maintenance_request WHERE property_id = ? AND blocking_flag = TRUE AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')",
          [propId]
        );
        if (otherActive === 0 && openBlocking === 0) {
          await syncPropertyStatusAndHistory(
            conn,
            propId,
            "AVAILABLE",
            `Kết thúc hợp đồng thuê #${leaseId} (${updates.lease_status})`
          );
          auditNotes.push(`HĐ #${leaseId} ${updates.lease_status} -> BĐS #${propId} trả về AVAILABLE.`);
        }
      }
    }

    await conn.commit();
    return { audit_notes: auditNotes, trigger_effect: null };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteLease(leaseId) {
  const [result] = await pool.query("DELETE FROM lease WHERE lease_id = ?", [leaseId]);
  return result.affectedRows > 0;
}

/**
 * Nghiệp vụ cho thuê bất động sản hoàn chỉnh (1 Transaction duy nhất):
 * 1. Kiểm tra BĐS tồn tại (không ở trạng thái UNDER_MAINTENANCE).
 * 2. Xác thực hoặc tạo mới khách thuê (tenant).
 * 3. Tra cứu tin đăng (listing) để lấy giá chào & đóng tin đăng (CLOSED).
 * 4. Hoàn thành phân công môi giới (cập nhật assigned_to trong agent_assignment).
 * 5. Tạo hợp đồng thuê (lease) ACTIVE & đồng bộ property -> LEASED + property_status_history.
 * 6. Gán khách thuê vào hợp đồng (lease_tenant).
 * 7. Ghi nhận tiền cọc (DEPOSIT) & tiền thuê kỳ đầu (RENT) vào sổ cái financial_entry.
 */
export async function leasePropertyWorkflow(propertyId, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Kiểm tra BĐS
    const [[prop]] = await conn.query(
      "SELECT property_id, current_status FROM property WHERE property_id = ? FOR UPDATE",
      [propertyId]
    );
    if (!prop) {
      throw new Error(`Không tìm thấy bất động sản #${propertyId}.`);
    }
    if (prop.current_status !== "AVAILABLE") {
      throw new Error(`BĐS #${propertyId} đang ở trạng thái ${prop.current_status}, không thể cho thuê.`);
    }

    // 2. Xử lý khách thuê (tenant): dùng tenant_id có sẵn hoặc tạo mới vào bảng tenant trước
    let tenantId = data.tenant_id ? Number(data.tenant_id) : null;
    let tenantCreated = false;

    if (tenantId) {
      const [[existingTenant]] = await conn.query(
        "SELECT tenant_id FROM tenant WHERE tenant_id = ?",
        [tenantId]
      );
      if (!existingTenant) {
        throw new Error(`Không tìm thấy khách thuê #${tenantId}.`);
      }
    } else if (data.tenant && typeof data.tenant === "object") {
      const { full_name, email, phone } = data.tenant;
      if (!full_name || !email || !phone) {
        throw new Error("Thông tin khách thuê mới (tenant) phải có đủ: full_name, email, phone.");
      }
      const [[byEmail]] = await conn.query("SELECT tenant_id FROM tenant WHERE email = ?", [
        email.trim(),
      ]);
      if (byEmail) {
        tenantId = byEmail.tenant_id;
      } else {
        const [tRes] = await conn.query("INSERT INTO tenant SET ?", [
          { full_name: full_name.trim(), email: email.trim(), phone: phone.trim() },
        ]);
        tenantId = tRes.insertId;
        tenantCreated = true;
      }
    } else {
      throw new Error(
        "Cần cung cấp tenant_id hoặc thông tin khách thuê mới (tenant: { full_name, email, phone })."
      );
    }

    // 3. Tra cứu listing (nếu có origin_listing_id hoặc tìm listing RENT đang mở của BĐS)
    let listing = null;
    if (data.origin_listing_id) {
      const [[lst]] = await conn.query("SELECT * FROM listing WHERE listing_id = ?", [
        data.origin_listing_id,
      ]);
      if (!lst || Number(lst.property_id) !== Number(propertyId)) {
        throw new Error(
          `Tin đăng #${data.origin_listing_id} không tồn tại hoặc không thuộc BĐS #${propertyId}.`
        );
      }
      listing = lst;
    } else {
      const [[lst]] = await conn.query(
        "SELECT * FROM listing WHERE property_id = ? AND listing_type = 'RENT' AND listing_status = 'ACTIVE' ORDER BY listing_id DESC LIMIT 1",
        [propertyId]
      );
      listing = lst || null;
    }

    const monthlyRent =
      data.monthly_rent !== undefined
        ? Number(data.monthly_rent)
        : listing
          ? Number(listing.offer_amount)
          : null;

    if (!monthlyRent || monthlyRent <= 0) {
      throw new Error(
        "Thiếu giá thuê (monthly_rent) và BĐS chưa có tin đăng RENT hợp lệ để lấy giá."
      );
    }

    const startDate = data.start_date || new Date().toISOString().slice(0, 10);
    const endDate = data.end_date;
    if (!endDate || new Date(endDate) < new Date(startDate)) {
      throw new Error("end_date bắt buộc và phải >= start_date.");
    }

    const deposit = data.deposit !== undefined ? Number(data.deposit) : 0;
    if (deposit < 0) {
      throw new Error("Tiền đặt cọc (deposit) không được âm.");
    }

    const currency = data.currency || "VND";

    // 4. Tạo hợp đồng thuê (lease) ở trạng thái ACTIVE
    const [leaseRes] = await conn.query("INSERT INTO lease SET ?", [
      {
        property_id: propertyId,
        origin_listing_id: listing ? listing.listing_id : null,
        start_date: startDate,
        end_date: endDate,
        monthly_rent: monthlyRent,
        deposit,
        lease_status: "ACTIVE",
      },
    ]);
    const leaseId = leaseRes.insertId;

    // 5. Gán khách thuê vào bảng lease_tenant
    await conn.query("INSERT INTO lease_tenant SET ?", [
      {
        lease_id: leaseId,
        tenant_id: tenantId,
        tenant_role: data.tenant_role || "PRIMARY",
        joined_on: startDate,
        left_on: null,
      },
    ]);

    // 6. Đồng bộ property -> LEASED & property_status_history (chống trùng trigger)
    const syncRes = await syncPropertyStatusAndHistory(
      conn,
      propertyId,
      "LEASED",
      `Kích hoạt hợp đồng thuê #${leaseId}`
    );

    // 7. Đóng listing nguồn (CLOSED) & hoàn thành phân công môi giới (assigned_to)
    let completedAssignments = 0;
    if (listing) {
      await conn.query(
        "UPDATE listing SET listing_status = 'CLOSED', end_date = CURRENT_DATE WHERE listing_id = ? AND listing_status IN ('ACTIVE', 'PAUSED')",
        [listing.listing_id]
      );
      const [assignRes] = await conn.query(
        "UPDATE agent_assignment SET assigned_to = CURRENT_TIMESTAMP WHERE listing_id = ? AND assigned_to IS NULL",
        [listing.listing_id]
      );
      completedAssignments = assignRes.affectedRows;
    }

    // 8. Ghi nhận sổ cái tài chính (financial_entry): DEPOSIT & RENT (direction = 'IN')
    const financialEntries = [];
    const now = new Date();

    if (deposit > 0) {
      const [depRes] = await conn.query("INSERT INTO financial_entry SET ?", [
        {
          property_id: propertyId,
          listing_id: listing ? listing.listing_id : null,
          lease_id: leaseId,
          maintenance_id: null,
          entry_type: "DEPOSIT",
          direction: "IN",
          amount: deposit,
          currency,
          occurred_at: now,
        },
      ]);
      financialEntries.push({
        entry_id: depRes.insertId,
        entry_type: "DEPOSIT",
        direction: "IN",
        amount: deposit,
      });
    }

    const recordFirstRent = data.record_first_rent !== false;
    if (recordFirstRent && monthlyRent > 0) {
      const [rentRes] = await conn.query("INSERT INTO financial_entry SET ?", [
        {
          property_id: propertyId,
          listing_id: listing ? listing.listing_id : null,
          lease_id: leaseId,
          maintenance_id: null,
          entry_type: "RENT",
          direction: "IN",
          amount: monthlyRent,
          currency,
          occurred_at: now,
        },
      ]);
      financialEntries.push({
        entry_id: rentRes.insertId,
        entry_type: "RENT",
        direction: "IN",
        amount: monthlyRent,
      });
    }

    const [history] = await conn.query(
      "SELECT * FROM property_status_history WHERE property_id = ? ORDER BY valid_from DESC LIMIT 3",
      [propertyId]
    );

    await conn.commit();
    return {
      lease_id: leaseId,
      property_id: propertyId,
      tenant_id: tenantId,
      tenant_created: tenantCreated,
      origin_listing_id: listing ? listing.listing_id : null,
      completed_agent_assignments: completedAssignments,
      financial_entries: financialEntries,
      status_sync: syncRes,
      property_status_history: history,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
