import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "real_estate_ledger",
  waitForConnections: true,
  connectionLimit: 10,
});

/**
 * Kiểm tra kết nối MySQL khi khởi động server.
 */
export async function testDbConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("Kết nối MySQL thành công!");
    conn.release();
  } catch (err) {
    console.error("LỖI KẾT NỐI MYSQL:", err.message);
  }
}

export default pool;
