import pool from "../config/db.js";

export async function listFinancialEntries({ page, limit, offset }) {
  const start = performance.now();
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM financial_entry");
  const [rows] = await pool.query(
    "SELECT * FROM financial_entry ORDER BY entry_id DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    page,
    limit,
    pk: "entry_id",
    total_all_rows: total,
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}

export async function getFinancialEntryById(entryId) {
  const [[row]] = await pool.query("SELECT * FROM financial_entry WHERE entry_id = ?", [entryId]);
  return row || null;
}

export async function createFinancialEntry(data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const result = await createFinancialEntryWithConn(conn, data);

    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Tạo financial entry dùng connection hiện có (để dùng trong transaction ngoài)
 * @param {Object} conn - MySQL connection đang trong transaction
 * @param {Object} data - Dữ liệu financial entry
 * @returns {Object} { insertId }
 */
export async function createFinancialEntryWithConn(conn, data) {
  // Kiểm tra BR-25: lease_id và maintenance_id phải thuộc cùng property_id
  if (data.lease_id) {
    const [[leaseRow]] = await conn.query("SELECT property_id FROM lease WHERE lease_id = ?", [
      data.lease_id,
    ]);
    if (!leaseRow || Number(leaseRow.property_id) !== Number(data.property_id)) {
      throw new Error(
        `Vi phạm BR-25: lease_id=${data.lease_id} không thuộc property_id=${data.property_id}.`
      );
    }
  }

  if (data.maintenance_id) {
    const [[maintRow]] = await conn.query(
      "SELECT property_id FROM maintenance_request WHERE maintenance_id = ?",
      [data.maintenance_id]
    );
    if (!maintRow || Number(maintRow.property_id) !== Number(data.property_id)) {
      throw new Error(
        `Vi phạm BR-25: maintenance_id=${data.maintenance_id} không thuộc property_id=${data.property_id}.`
      );
    }
  }

  const payload = {
    property_id: data.property_id,
    listing_id: data.listing_id ?? null,
    lease_id: data.lease_id ?? null,
    maintenance_id: data.maintenance_id ?? null,
    entry_type: data.entry_type,
    direction: data.direction,
    amount: data.amount,
    currency: data.currency ?? "VND",
    occurred_at: data.occurred_at || new Date(),
    reversal_of_entry_id: data.reversal_of_entry_id ?? null,
  };

  const [result] = await conn.query("INSERT INTO financial_entry SET ?", [payload]);
  return { insertId: result.insertId };
}

export async function reverseFinancialEntry(entryId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[orig]] = await conn.query("SELECT * FROM financial_entry WHERE entry_id = ?", [
      entryId,
    ]);
    if (!orig) {
      await conn.rollback();
      return { notFound: true };
    }

    const [[alreadyReversed]] = await conn.query(
      "SELECT entry_id FROM financial_entry WHERE reversal_of_entry_id = ?",
      [entryId]
    );
    if (alreadyReversed) {
      await conn.rollback();
      throw new Error(
        `Bút toán #${entryId} đã được đảo trước đó bởi bút toán #${alreadyReversed.entry_id}.`
      );
    }

    const reverseDirection = orig.direction === "IN" ? "OUT" : "IN";

    const payload = {
      property_id: orig.property_id,
      listing_id: orig.listing_id,
      lease_id: orig.lease_id,
      maintenance_id: orig.maintenance_id,
      entry_type: orig.entry_type,
      direction: reverseDirection,
      amount: orig.amount,
      currency: orig.currency,
      occurred_at: new Date(),
      reversal_of_entry_id: orig.entry_id,
    };

    const [result] = await conn.query("INSERT INTO financial_entry SET ?", [payload]);
    await conn.commit();

    return {
      reversal_entry_id: result.insertId,
      original_direction: orig.direction,
      reverse_direction: reverseDirection,
      payload,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
