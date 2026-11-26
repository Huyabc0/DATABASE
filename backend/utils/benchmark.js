import pool from "../config/db.js";

/**
 * Thực thi truy vấn SELECT và đo thời gian thực thi (ms) phục vụ benchmark / báo cáo.
 */
export async function executeBenchmarkQuery(sql, params = []) {
  const start = performance.now();
  const [rows] = await pool.query(sql, params);
  const queryTimeMs = Number((performance.now() - start).toFixed(2));
  return {
    total_rows: rows.length,
    query_time_ms: queryTimeMs,
    data: rows,
  };
}
