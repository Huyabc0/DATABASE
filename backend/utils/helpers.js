/**
 * Làm sạch payload đầu vào: loại bỏ undefined, trim chuỗi và chuyển chuỗi rỗng thành null.
 */
export const sanitizePayload = (body) => {
  const cleaned = {};
  for (const [key, val] of Object.entries(body || {})) {
    if (val === undefined) continue;
    if (typeof val === "string") {
      const trimmed = val.trim();
      cleaned[key] = trimmed === "" ? null : trimmed;
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
};

/**
 * Kiểm tra ID số nguyên dương hợp lệ.
 */
export const parsePositiveInt = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
};

/**
 * Đọc tham số phân trang (page, limit, offset) từ req.query.
 */
export const getPagination = (query) => {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const limit = Math.min(200, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Chuẩn hóa thông báo lỗi MySQL thân thiện hơn cho client.
 */
export const mapDbError = (err, entityName, idLabel = "") => {
  if (err.errno === 1451) {
    return `Không thể xóa ${entityName}${idLabel ? ` #${idLabel}` : ""} vì đang có dữ liệu ở bảng khác tham chiếu tới (vi phạm khóa ngoại).`;
  }
  if (err.errno === 1452) {
    return `Dữ liệu tham chiếu (khóa ngoại) không tồn tại khi thao tác trên ${entityName}.`;
  }
  if (err.errno === 1062) {
    return `Dữ liệu bị trùng lặp (vi phạm ràng buộc UNIQUE) trong bảng ${entityName}: ${err.sqlMessage || err.message}`;
  }
  return err.message;
};
