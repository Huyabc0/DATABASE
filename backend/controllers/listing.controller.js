import * as listingService from "../services/listing.service.js";
import {
  sanitizePayload,
  parsePositiveInt,
  getPagination,
  mapDbError,
} from "../utils/helpers.js";

const VALID_LISTING_TYPES = ["SALE", "RENT"];
const VALID_LISTING_STATUSES = ["ACTIVE", "CLOSED", "CANCELLED", "PAUSED"];

function validateListingData(data, isUpdate = false) {
  if (!data || Object.keys(data).length === 0) {
    return "Dữ liệu gửi lên đang trống.";
  }
  if (
    !isUpdate &&
    (!["string", "number"].includes(typeof data.property_id) ||
      !parsePositiveInt(data.property_id) ||
      !data.listing_type ||
      data.offer_amount === undefined ||
      !data.start_date)
  ) {
    return "Thiếu thông tin bắt buộc: property_id, listing_type, offer_amount hoặc start_date.";
  }
  if (data.listing_type !== undefined && !VALID_LISTING_TYPES.includes(data.listing_type)) {
    return "Loại tin đăng (listing_type) chỉ nhận SALE hoặc RENT.";
  }
  if (data.offer_amount !== undefined && Number(data.offer_amount) <= 0) {
    return "Giá chào (offer_amount) phải lớn hơn 0.";
  }
  if (
    data.listing_status !== undefined &&
    !VALID_LISTING_STATUSES.includes(data.listing_status)
  ) {
    return "Trạng thái tin đăng không hợp lệ (ACTIVE, CLOSED, CANCELLED, PAUSED).";
  }
  return null;
}

export async function getListings(req, res) {
  try {
    const result = await listingService.listListings(getPagination(req.query));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function getListingById(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "listing_id không hợp lệ." });
  try {
    const row = await listingService.getListingById(id);
    if (!row) return res.status(404).json({ error: `Không tìm thấy tin đăng #${id}.` });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export async function createListing(req, res) {
  const data = sanitizePayload(req.body);
  delete data.listing_id;
  if (data.listing_status === null) delete data.listing_status;
  const errMsg = validateListingData(data, false);
  if (errMsg) return res.status(400).json({ error: errMsg });
  const propertyId = parsePositiveInt(data.property_id);
  data.property_id = propertyId;

  try {
    const result = await listingService.withListingCreationLock(propertyId, async (conn) => {
      const activeListing = await listingService.findActiveListing(propertyId, conn);
      if (activeListing) return { activeListingId: activeListing.listing_id };

      return listingService.createListing(data, conn);
    });
    if (result.activeListingId) {
      return res.status(409).json({
        error: `BR06: Bất động sản #${propertyId} đã có tin đăng #${result.activeListingId} ở trạng thái ACTIVE.`,
      });
    }
    res.status(201).json({
      message: `Thêm mới tin đăng thành công (ID = ${result.insertId})`,
      insertId: result.insertId,
    });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "listing") });
  }
}

export async function updateListing(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "listing_id không hợp lệ." });

  const data = sanitizePayload(req.body);
  delete data.listing_id;
  const errMsg = validateListingData(data, true);
  if (errMsg) return res.status(400).json({ error: errMsg });

  try {
    const result = await listingService.updateListing(id, data);
    if (!result) return res.status(404).json({ error: `Không tìm thấy tin đăng #${id}.` });
    res.json({ message: `Cập nhật tin đăng #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "listing", id) });
  }
}

export async function deleteListing(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: "listing_id không hợp lệ." });

  try {
    const deleted = await listingService.deleteListing(id);
    if (!deleted) return res.status(404).json({ error: `Không tìm thấy tin đăng #${id}.` });
    res.json({ message: `Xóa tin đăng #${id} thành công!` });
  } catch (err) {
    res.status(400).json({ error: mapDbError(err, "listing", id) });
  }
}
