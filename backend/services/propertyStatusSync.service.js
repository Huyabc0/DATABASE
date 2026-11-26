/**
 * Đồng bộ trạng thái bất động sản (property.current_status),
 * sổ cái lịch sử trạng thái (property_status_history) và tạm dừng tin đăng (listing)
 * khi trạng thái BĐS không còn AVAILABLE.
 *
 * Lưu ý: Hàm kiểm tra trạng thái thực tế trong property_status_history trước khi ghi
 * để tránh ghi trùng nếu Trigger MySQL (trg_property_status_update) đã chạy trước đó.
 */
export async function syncPropertyStatusAndHistory(conn, propertyId, targetStatus, reason) {
  const [[prop]] = await conn.query(
    "SELECT property_id, current_status FROM property WHERE property_id = ? FOR UPDATE",
    [propertyId]
  );
  if (!prop) {
    throw new Error(`Không tìm thấy bất động sản #${propertyId}.`);
  }

  if (prop.current_status !== targetStatus) {
    await conn.query("UPDATE property SET current_status = ? WHERE property_id = ?", [
      targetStatus,
      propertyId,
    ]);
  }

  const [[activeHistory]] = await conn.query(
    "SELECT status_history_id, status FROM property_status_history WHERE property_id = ? AND valid_to IS NULL ORDER BY valid_from DESC LIMIT 1",
    [propertyId]
  );

  let historyChanged = false;
  if (!activeHistory) {
    await conn.query(
      "INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason) VALUES (?, ?, CURRENT_TIMESTAMP, NULL, ?)",
      [propertyId, targetStatus, reason]
    );
    historyChanged = true;
  } else if (activeHistory.status !== targetStatus) {
    await conn.query(
      "UPDATE property_status_history SET valid_to = CURRENT_TIMESTAMP WHERE status_history_id = ?",
      [activeHistory.status_history_id]
    );
    await conn.query(
      "INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason) VALUES (?, ?, CURRENT_TIMESTAMP, NULL, ?)",
      [propertyId, targetStatus, reason]
    );
    historyChanged = true;
  }

  let pausedListings = 0;
  let reactivatedListings = 0;

  if (targetStatus !== "AVAILABLE") {
    // Tạm dừng các tin đăng ACTIVE khi BĐS không còn AVAILABLE
    const [lstRes] = await conn.query(
      "UPDATE listing SET listing_status = 'PAUSED' WHERE property_id = ? AND listing_status = 'ACTIVE'",
      [propertyId]
    );
    pausedListings = lstRes.affectedRows;
  } else {
    // Kích hoạt lại các tin đăng PAUSED khi BĐS quay về AVAILABLE
    const [lstRes] = await conn.query(
      "UPDATE listing SET listing_status = 'ACTIVE' WHERE property_id = ? AND listing_status = 'PAUSED'",
      [propertyId]
    );
    reactivatedListings = lstRes.affectedRows;
  }

  return {
    previous_status: prop.current_status,
    current_status: targetStatus,
    history_updated: historyChanged,
    paused_listings_count: pausedListings,
    reactivated_listings_count: reactivatedListings,
  };
}
