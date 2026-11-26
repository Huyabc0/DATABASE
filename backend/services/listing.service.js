import pool from "../config/db.js";

export async function listListings({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM listing");
  const [rows] = await pool.query(
    "SELECT * FROM listing ORDER BY listing_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "listing_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getListingById(listingId) {
  const [[row]] = await pool.query(
    "SELECT * FROM listing WHERE listing_id = ?",
    [listingId]
  );
  return row || null;
}

export async function withListingCreationLock(propertyId, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Khóa bất động sản ngay cả khi chưa có dòng nào trong bảng listing.
    await conn.query("SELECT property_id FROM property WHERE property_id = ? FOR UPDATE", [
      propertyId,
    ]);
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function findActiveListing(propertyId, conn) {
  const [[row]] = await conn.query(
    "SELECT listing_id FROM listing WHERE property_id = ? AND listing_status = 'ACTIVE' ORDER BY listing_id LIMIT 1",
    [propertyId]
  );
  return row || null;
}

export async function createListing(data, conn = pool) {
  const payload = {
    property_id: data.property_id,
    listing_type: data.listing_type,
    offer_amount: data.offer_amount,
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    listing_status: data.listing_status ?? "ACTIVE",
  };
  const [result] = await conn.query("INSERT INTO listing SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function updateListing(listingId, data) {
  const [[oldRow]] = await pool.query("SELECT * FROM listing WHERE listing_id = ?", [listingId]);
  if (!oldRow) return null;

  const updates = {};
  for (const field of [
    "property_id",
    "listing_type",
    "offer_amount",
    "start_date",
    "end_date",
    "listing_status",
  ]) {
    if (data[field] !== undefined) updates[field] = data[field];
  }

  if (Object.keys(updates).length > 0) {
    await pool.query("UPDATE listing SET ? WHERE listing_id = ?", [updates, listingId]);
  }
  return { updated: true };
}

export async function deleteListing(listingId) {
  const [result] = await pool.query("DELETE FROM listing WHERE listing_id = ?", [listingId]);
  return result.affectedRows > 0;
}
