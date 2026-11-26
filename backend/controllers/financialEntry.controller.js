import * as financialService from "../services/financialEntry.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_ENTRY_TYPES = [
  "RENT",
  "DEPOSIT",
  "DEPOSIT_REFUND",
  "REPAIR_FEE",
  "COMMISSION",
  "MANAGEMENT_FEE",
];
const VALID_DIRECTIONS = ["IN", "OUT"];

export async function getFinancialEntries(req, res) {
  try {
    const result = await financialService.listFinancialEntries(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getFinancialEntryById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "entry_id không hợp lệ." });
  try {
    const row = await financialService.getFinancialEntryById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy bút toán #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createFinancialEntry(req, res) {
  const data = sanitizePayload(req.body);
  delete data.entry_id;

  if (!data.property_id || !data.entry_type || !data.direction || data.amount === undefined) {
    return res.status(400).json({
      error: "Thiếu thông tin bút toán: property_id, entry_type, direction hoặc amount.",
    });
  }
  if (!VALID_ENTRY_TYPES.includes(data.entry_type)) {
    return res.status(400).json({
      error: `entry_type không hợp lệ (chỉ nhận ${VALID_ENTRY_TYPES.join(", ")}).`,
    });
  }
  if (!VALID_DIRECTIONS.includes(data.direction)) {
    return res.status(400).json({
      error: "Chiều dòng tiền (direction) chỉ nhận IN (Thu vào) hoặc OUT (Chi ra).",
    });
  }
  if (Number(data.amount) <= 0) {
    return res.status(400).json({ error: "Số tiền giao dịch (amount) phải lớn hơn 0." });
  }

  try {
    const result = await financialService.createFinancialEntry(data);
    res.status(201).json({
      message: `Ghi nhận bút toán tài chính thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "financial_entry") });
  }
}

export async function updateFinancialEntryBlocked(req, res) {
  return res.status(400).json({
    error: "Vi phạm BR-26: Sổ cái tài chính là bất biến, không được phép chỉnh sửa (UPDATE).",
  });
}

export async function deleteFinancialEntryBlocked(req, res) {
  return res.status(400).json({
    error: "Vi phạm BR-26: Sổ cái tài chính là bất biến, không được phép DELETE bản ghi đã ghi sổ.",
  });
}

export async function reverseFinancialEntry(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "entry_id không hợp lệ." });

  try {
    const result = await financialService.reverseFinancialEntry(id);
    if (result.notFound) {
      return res.status(404).json({ error: `Không tìm thấy bút toán #${id}` });
    }
    res.status(201).json({
      message: `Đã tạo bút toán đảo #${result.reversal_entry_id} cho bút toán gốc #${id} (${result.original_direction} -> ${result.reverse_direction}).`,
      reversal_entry_id: result.reversal_entry_id,
      payload: result.payload,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
