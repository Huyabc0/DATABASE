import { useState, useEffect, useRef, useMemo } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000/api";
const PAGE_LIMIT = 20;

const TABLES = [
  { key: "properties", label: "Bất động sản (property)" },
  { key: "owners", label: "Chủ sở hữu (owner)" },
  { key: "agents", label: "Môi giới (agent)" },
  { key: "tenants", label: "Khách thuê (tenant)" },
  { key: "listings", label: "Tin đăng (listing)" },
  { key: "leases", label: "Hợp đồng thuê (lease)" },
  { key: "financial-entries", label: "Sổ cái tài chính (financial_entry)" },
  { key: "maintenance-requests", label: "Yêu cầu bảo trì (maintenance_request)" },
  { key: "property-status-histories", label: "Lịch sử trạng thái (property_status_history)" },
];

const REPORTS = [
  { key: "property-cash-flow", label: "1. Dòng tiền theo BĐS", desc: "Tổng hợp tiền thuê, tiền cọc giữ lại, chi phí vận hành và dòng tiền thuần theo từng BĐS." },
  { key: "agent-performance", label: "2. Hiệu suất nhân viên môi giới", desc: "Thống kê số tin LEAD đang phụ trách, hợp đồng đã chốt và xếp hạng doanh thu quy năm." },
  { key: "owner-entitlement", label: "3. Phân chia lợi nhuận chủ sở hữu", desc: "Tính thu nhập phân bổ cho từng chủ sở hữu dựa trên tỷ lệ sở hữu hiệu lực." },
  { key: "property-ledger", label: "4. Sổ cái chi tiết & số dư lũy kế", desc: "Truy vết toàn bộ bút toán kèm trạng thái đảo và số dư lũy kế (Running Balance) theo BĐS.", hasPropertyId: true, defaultId: 6 },
  { key: "above-avg-rent-leases", label: "5. Hợp đồng thuê giá cao hơn trung bình", desc: "Lọc các hợp đồng ACTIVE có giá thuê vượt mức trung bình toàn hệ thống." },
  { key: "ownership-discrepancies", label: "6. Kiểm toán sai lệch tỷ lệ sở hữu != 100%", desc: "Phát hiện các BĐS có tổng tỷ lệ sở hữu hiện hành khác 100%." },
  { key: "unmonetized-active-listings", label: "7. Tin đăng ACTIVE chưa phát sinh dòng tiền", desc: "Liệt kê các tin đăng đang mở chưa có giao dịch tài chính kèm số ngày trên thị trường." },
  { key: "maintenance-by-property-type", label: "8. Thống kê bảo trì theo loại BĐS", desc: "Đo tổng số sự cố, tỷ lệ sự cố cản trở và thời gian xử lý trung bình (giờ)." },
  { key: "property-timeline", label: "9. Dòng thời gian hợp nhất của BĐS", desc: "Hợp nhất lịch sử trạng thái, bảo trì và sổ cái tài chính theo trình tự thời gian.", hasPropertyId: true, defaultId: 1 },
  { key: "tenant-lease-summary", label: "10. Tổng hợp hợp đồng theo khách thuê", desc: "Thống kê tổng số hợp đồng, số BĐS đã thuê và cam kết tiền thuê hàng tháng đang hiệu lực." },
  { key: "rent-price-variance", label: "11. Chênh lệch giá chào và giá thuê thực tế", desc: "So sánh offer_amount trên tin đăng với monthly_rent chốt trong hợp đồng." },
  { key: "property-occupancy", label: "12. Tỷ lệ lấp đầy & số ngày vận hành BĐS", desc: "Tính số ngày AVAILABLE, LEASED, UNDER_MAINTENANCE và tỷ lệ lấp đầy (%)." },
];

const VIEWS = [
  { key: "property-current-status", label: "View 1: Hiện trạng BĐS & Chủ sở hữu", desc: "Trạng thái hiện tại, thời điểm hiệu lực và danh sách chủ sở hữu hiện hành của từng BĐS." },
  { key: "property-ledger-balance", label: "View 2: Bảng cân đối thu chi từng BĐS", desc: "Tổng hợp số lượng bút toán, tổng thu (IN), tổng chi (OUT) và số dư thuần theo BĐS." },
  { key: "active-leases-detail", label: "View 3: Chi tiết hợp đồng thuê đang hiệu lực", desc: "Danh sách hợp đồng ACTIVE kèm địa chỉ BĐS và danh sách khách thuê hiện tại." },
];

const NAV_TABS = [
  { key: "marketplace", label: "Khám phá Nhà Tốt", tag: "BĐS" },
  { key: "tables", label: "Quản lý 9 Bảng", tag: "CRUD" },
  { key: "reports", label: "12 Báo cáo & Benchmark", tag: "SQL" },
  { key: "views", label: "3 SQL Views", tag: "VIEW" },
  { key: "triggers", label: "Demo Triggers & Sổ cái", tag: "DEMO" },
];

const CATEGORY_CHIPS = [
  { key: "ALL", label: "Tất cả BĐS", icon: "🏠" },
  { key: "RENT", label: "Cho thuê", icon: "🔑" },
  { key: "SALE", label: "Mua bán", icon: "🏷️" },
  { key: "Căn hộ", label: "Căn hộ / Chung cư", icon: "🏢" },
  { key: "Nhà phố", label: "Nhà phố", icon: "🏡" },
  { key: "Biệt thự", label: "Biệt thự", icon: "🏰" },
  { key: "Mặt bằng", label: "Mặt bằng / VP", icon: "🏪" },
  { key: "AVAILABLE", label: "Đang trống", icon: "✅" },
];

const AUTO_HIDDEN_FIELDS = new Set(["posted_at", "opened_at"]);

const ENUM_OPTIONS = {
  current_status: [
    { value: "AVAILABLE", label: "AVAILABLE (Sẵn sàng)" },
    { value: "LEASED", label: "LEASED (Đang cho thuê)" },
    { value: "UNDER_MAINTENANCE", label: "UNDER_MAINTENANCE (Đang bảo trì)" },
  ],
  agent_status: [
    { value: "ACTIVE", label: "ACTIVE (Hoạt động)" },
    { value: "SUSPENDED", label: "SUSPENDED (Tạm đình chỉ)" },
    { value: "INACTIVE", label: "INACTIVE (Ngừng hoạt động)" },
  ],
  listing_type: [
    { value: "RENT", label: "RENT (Cho thuê)" },
    { value: "SALE", label: "SALE (Bán)" },
  ],
  listing_status: [
    { value: "ACTIVE", label: "ACTIVE (Đang mở)" },
    { value: "PAUSED", label: "PAUSED (Tạm dừng)" },
    { value: "CLOSED", label: "CLOSED (Đã đóng)" },
    { value: "CANCELLED", label: "CANCELLED (Đã hủy)" },
  ],
  lease_status: [
    { value: "DRAFT", label: "DRAFT (Nháp)" },
    { value: "ACTIVE", label: "ACTIVE (Đang hiệu lực)" },
    { value: "EXPIRED", label: "EXPIRED (Hết hạn)" },
    { value: "TERMINATED", label: "TERMINATED (Chấm dứt)" },
    { value: "CANCELLED", label: "CANCELLED (Đã hủy)" },
  ],
  entry_type: [
    { value: "RENT", label: "RENT (Tiền thuê)" },
    { value: "DEPOSIT", label: "DEPOSIT (Tiền cọc)" },
    { value: "DEPOSIT_REFUND", label: "DEPOSIT_REFUND (Hoàn cọc)" },
    { value: "REPAIR_FEE", label: "REPAIR_FEE (Chi phí sửa chữa)" },
    { value: "COMMISSION", label: "COMMISSION (Hoa hồng)" },
    { value: "MANAGEMENT_FEE", label: "MANAGEMENT_FEE (Phí quản lý)" },
  ],
  direction: [
    { value: "IN", label: "IN (Thu vào)" },
    { value: "OUT", label: "OUT (Chi ra)" },
  ],
  currency: [
    { value: "VND", label: "VND" },
    { value: "USD", label: "USD" },
    { value: "EUR", label: "EUR" },
  ],
  priority: [
    { value: "LOW", label: "LOW (Thấp)" },
    { value: "MEDIUM", label: "MEDIUM (Trung bình)" },
    { value: "HIGH", label: "HIGH (Cao)" },
    { value: "URGENT", label: "URGENT (Khẩn cấp)" },
  ],
  blocking_flag: [
    { value: "0", label: "0 - Không cản trở (FALSE)" },
    { value: "1", label: "1 - Cản trở sinh hoạt (TRUE)" },
  ],
};

const MONEY_FIELDS = new Set([
  "offer_amount",
  "monthly_rent",
  "deposit",
  "amount",
  "total_rent_income",
  "net_deposit_held",
  "total_operating_expense",
  "net_cash_flow",
  "annualized_closed_rent_value",
  "property_total_income",
  "owner_entitled_amount",
  "running_balance",
  "cumulative_monthly_rent_commitment",
  "listed_rent",
  "contracted_rent",
  "price_variance",
  "total_in",
  "total_out",
  "net_balance",
]);

const PERCENT_FIELDS = new Set([
  "ownership_share",
  "total_ownership_share",
  "blocking_rate_pct",
  "variance_pct",
  "occupancy_rate_pct",
]);

const DATE_ONLY_FIELDS = new Set(["start_date", "end_date", "joined_on", "left_on"]);

const DATETIME_FIELDS = new Set([
  "valid_from",
  "valid_to",
  "opened_at",
  "closed_at",
  "occurred_at",
  "posted_at",
  "status_since",
  "event_timestamp",
  "assigned_from",
  "assigned_to",
]);

const BADGE_FIELDS = new Set([
  "current_status",
  "status",
  "agent_status",
  "listing_status",
  "listing_type",
  "lease_status",
  "direction",
  "priority",
  "entry_type",
  "blocking_flag",
  "audit_note",
  "source_module",
]);

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getLocalDateStr(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getLocalDateTimeStr(date = new Date()) {
  return `${getLocalDateStr(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function addMonthsDateStr(months = 12) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return getLocalDateStr(d);
}

function formatInputValue(val, type) {
  if (val === null || val === undefined) return "";
  if (type.includes("tinyint(1)")) {
    return val === true || val === 1 || val === "1" || val === "true" ? "1" : "0";
  }
  if (typeof val === "string" && type.includes("date") && !type.includes("datetime")) {
    const d = new Date(val);
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    if (!Number.isNaN(d.getTime())) return getLocalDateStr(d);
    return val.slice(0, 10);
  }
  if (
    typeof val === "string" &&
    (type.includes("timestamp") || type.includes("datetime")) &&
    /^\d{4}-\d{2}-\d{2}T/.test(val)
  ) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return getLocalDateTimeStr(d);
  }
  return String(val);
}

function formatMoney(val, currency = "VND") {
  const num = Number(val);
  if (Number.isNaN(num)) return String(val);
  return `${new Intl.NumberFormat("vi-VN").format(num)} ${currency || "VND"}`;
}

function formatNhatotPrice(amount, listingType) {
  const num = Number(amount);
  if (!num || Number.isNaN(num)) return "Chưa niêm yết giá";
  if (num >= 1_000_000_000) {
    const ty = (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "");
    return `${ty} tỷ${listingType === "RENT" ? "/tháng" : ""}`;
  }
  if (num >= 1_000_000) {
    const tr = (num / 1_000_000).toFixed(1).replace(/\.0$/, "");
    return `${tr} triệu${listingType === "RENT" ? "/tháng" : ""}`;
  }
  return `${new Intl.NumberFormat("vi-VN").format(num)} đ${listingType === "RENT" ? "/tháng" : ""}`;
}

function getPropertyCardVisual(propertyType = "") {
  const t = String(propertyType).toLowerCase();
  if (t.includes("biệt thự") || t.includes("villa")) {
    return { cls: "visual-villa", icon: "🏰", label: "Biệt thự" };
  }
  if (t.includes("nhà") || t.includes("house")) {
    return { cls: "visual-house", icon: "🏡", label: "Nhà phố" };
  }
  if (t.includes("mặt bằng") || t.includes("văn phòng") || t.includes("office")) {
    return { cls: "visual-office", icon: "🏪", label: "Mặt bằng" };
  }
  return { cls: "visual-apt", icon: "🏢", label: propertyType || "Căn hộ" };
}

function getStatusLabelVi(status) {
  if (status === "AVAILABLE") return "Sẵn sàng";
  if (status === "LEASED") return "Đang cho thuê";
  if (status === "UNDER_MAINTENANCE") return "Đang bảo trì";
  return status;
}

function getBadgeTone(field, rawVal) {
  if (field === "blocking_flag") {
    return rawVal === 1 || rawVal === true || rawVal === "1" ? "badge-amber" : "badge-slate";
  }
  const val = String(rawVal).toUpperCase();
  if (["AVAILABLE", "ACTIVE", "COMPLETED", "IN", "CREDIT", "HIỆU LỰC"].includes(val)) {
    return "badge-green";
  }
  if (["LEASED", "IN_PROGRESS", "ASSIGNED", "RENT", "SALE"].includes(val)) {
    return "badge-blue";
  }
  if (["UNDER_MAINTENANCE", "PAUSED", "OPEN", "DRAFT", "HIGH", "URGENT"].includes(val)) {
    return "badge-amber";
  }
  if (["OUT", "DEBIT", "CANCELLED", "EXPIRED", "TERMINATED"].includes(val)) {
    return "badge-red";
  }
  if (val.startsWith("ĐÃ BỊ ĐẢO")) return "badge-red";
  if (val.startsWith("ĐẢO CHO")) return "badge-amber";
  return "badge-slate";
}

function formatDisplayCell(col, val, row) {
  if (val === null || val === undefined || val === "") {
    return <span className="cell-null">NULL</span>;
  }

  if (BADGE_FIELDS.has(col)) {
    const text =
      col === "blocking_flag"
        ? val === 1 || val === true || val === "1"
          ? "TRUE (Cản trở)"
          : "FALSE"
        : String(val);
    return <span className={`pill ${getBadgeTone(col, val)}`}>{text}</span>;
  }

  if (MONEY_FIELDS.has(col)) {
    return <span className="num-cell">{formatMoney(val, row.currency || "VND")}</span>;
  }

  if (col === "rent_per_sqm") {
    const num = Number(val);
    return (
      <span className="num-cell">
        {Number.isNaN(num) ? String(val) : `${new Intl.NumberFormat("vi-VN").format(num)} VND/m²`}
      </span>
    );
  }

  if (PERCENT_FIELDS.has(col)) {
    return <span className="num-cell">{Number(val).toFixed(2).replace(/\.00$/, "")}%</span>;
  }

  if (col === "area") {
    return <span className="num-cell">{new Intl.NumberFormat("vi-VN").format(Number(val))} m²</span>;
  }

  if (DATE_ONLY_FIELDS.has(col)) {
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y, m, d] = val.split("-");
      return `${d}/${m}/${y}`;
    }
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("vi-VN");
  }

  if (DATETIME_FIELDS.has(col)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) {
      return (
        <span className="date-cell">
          {d.toLocaleString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </span>
      );
    }
  }

  return String(val);
}

function getSelectOptionsForColumn(tableKey, colField) {
  if (colField === "status") {
    if (tableKey === "property-status-histories") {
      return ENUM_OPTIONS.current_status;
    }
    return [
      { value: "OPEN", label: "OPEN (Mới mở)" },
      { value: "ASSIGNED", label: "ASSIGNED (Đã phân công)" },
      { value: "IN_PROGRESS", label: "IN_PROGRESS (Đang xử lý)" },
      { value: "COMPLETED", label: "COMPLETED (Hoàn tất)" },
      { value: "CANCELLED", label: "CANCELLED (Đã hủy)" },
    ];
  }
  return ENUM_OPTIONS[colField] || null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState("marketplace");
  const [selectedItem, setSelectedItem] = useState("properties");
  const [propertyIdParam, setPropertyIdParam] = useState("6");
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  // State cho Trang chủ Nhà Tốt
  const [marketCategory, setMarketCategory] = useState("ALL");
  const [marketStatusFilter, setMarketStatusFilter] = useState("ALL");
  const [marketSort, setMarketSort] = useState("NEWEST");
  const [marketData, setMarketData] = useState({
    properties: [],
    listings: [],
    ownersMap: {},
    queryTimeMs: 0,
  });

  // State cho dữ liệu bảng / báo cáo / views
  const [result, setResult] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toast, setToast] = useState(null);

  // Modal Thêm / Sửa, Modal Cho thuê nhanh & Xác nhận
  const [modalOpen, setModalOpen] = useState(false);
  const [modalResource, setModalResource] = useState("properties");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [rentModalProp, setRentModalProp] = useState(null);
  const [rentForm, setRentForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    start_date: getLocalDateStr(),
    end_date: addMonthsDateStr(12),
    monthly_rent: "",
    deposit: "0",
    record_first_rent: true,
  });

  // State cho mục Demo Nghiệp vụ & Sổ cái
  const [demoLoading, setDemoLoading] = useState(false);
  const [newProp, setNewProp] = useState({
    address: "123 Nguyễn Huệ, Quận 1, TP.HCM",
    unit: "A-1205",
    property_type: "Căn hộ",
    area: 82,
    bedrooms: 2,
  });
  const [maintForm, setMaintForm] = useState({
    property_id: 1,
    priority: "URGENT",
    blocking_flag: 1,
    status: "OPEN",
  });
  const [completeMaintId, setCompleteMaintId] = useState(1);
  const [completeMaintCost, setCompleteMaintCost] = useState("");
  const [ledgerForm, setLedgerForm] = useState({
    property_id: 1,
    lease_id: 9999,
    entry_type: "RENT",
    direction: "IN",
    amount: 15000000,
    currency: "VND",
    occurred_at: getLocalDateTimeStr(),
  });
  const [ledgerEntryId, setLedgerEntryId] = useState(1);
  const [triggerLog, setTriggerLog] = useState(null);

  const toastTimerRef = useRef(null);
  const requestIdRef = useRef(0);

  const showToast = (ok, msg, details = null) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ ok, msg, details });
    toastTimerRef.current = setTimeout(() => setToast(null), 6500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const fetchMarketplace = async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [propRes, listRes, viewRes] = await Promise.all([
        fetch(`${API_BASE}/properties?page=1&limit=100`),
        fetch(`${API_BASE}/listings?page=1&limit=100`),
        fetch(`${API_BASE}/views/property-current-status`).catch(() => null),
      ]);
      const propJson = await propRes.json();
      const listJson = await listRes.json();
      const viewJson = viewRes && viewRes.ok ? await viewRes.json() : null;

      if (reqId !== requestIdRef.current) return;
      if (!propRes.ok) throw new Error(propJson.error || "Không thể tải danh sách bất động sản.");
      if (!listRes.ok) throw new Error(listJson.error || "Không thể tải danh sách tin đăng.");

      const ownersMap = {};
      if (Array.isArray(viewJson?.data)) {
        viewJson.data.forEach((v) => {
          ownersMap[v.property_id] = v.current_owners || "";
        });
      }

      setMarketData({
        properties: propJson.data || [],
        listings: listJson.data || [],
        ownersMap,
        queryTimeMs: Number(((propJson.query_time_ms || 0) + (listJson.query_time_ms || 0)).toFixed(2)),
      });
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setErrorMsg(err.message || "Không kết nối được tới máy chủ Backend.");
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const fetchData = async (tab, key, currentPage = 1, propId = propertyIdParam) => {
    if (tab === "triggers") return;
    if (tab === "marketplace") {
      await fetchMarketplace();
      return;
    }

    const reqId = ++requestIdRef.current;
    setLoading(true);
    setErrorMsg(null);

    try {
      let url = "";
      if (tab === "tables") {
        url = `${API_BASE}/${key}?page=${currentPage}&limit=${PAGE_LIMIT}`;
        const [dataRes, schemaRes] = await Promise.all([
          fetch(url),
          fetch(`${API_BASE}/schema/${key}`),
        ]);
        const dataJson = await dataRes.json();
        const schemaJson = schemaRes.ok ? await schemaRes.json() : null;
        if (reqId !== requestIdRef.current) return;
        if (!dataRes.ok) throw new Error(dataJson.error || "Không thể tải dữ liệu bảng.");
        setSchema(schemaJson);
        setResult(dataJson);
        return;
      }

      if (tab === "views") {
        url = `${API_BASE}/views/${key}`;
      } else if (tab === "reports") {
        const rep = REPORTS.find((r) => r.key === key);
        const safePropId = Number(propId) > 0 ? Number(propId) : rep?.defaultId || 1;
        url = `${API_BASE}/reports/${key}${rep?.hasPropertyId ? `?property_id=${safePropId}` : ""}`;
      }

      const res = await fetch(url);
      const json = await res.json();
      if (reqId !== requestIdRef.current) return;
      if (!res.ok) throw new Error(json.error || "Lỗi truy vấn dữ liệu.");
      setResult(json);
    } catch (err) {
      if (reqId !== requestIdRef.current) return;
      setErrorMsg(err.message || "Không kết nối được tới máy chủ API.");
      setResult(null);
      showToast(false, err.message || "Lỗi kết nối API");
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const reqId = ++requestIdRef.current;
    (async () => {
      try {
        const [propRes, listRes, viewRes] = await Promise.all([
          fetch(`${API_BASE}/properties?page=1&limit=100`),
          fetch(`${API_BASE}/listings?page=1&limit=100`),
          fetch(`${API_BASE}/views/property-current-status?sort=desc`).catch(() => null),
        ]);
        const propJson = await propRes.json();
        const listJson = await listRes.json();
        const viewJson = viewRes && viewRes.ok ? await viewRes.json() : null;
        if (reqId !== requestIdRef.current) return;
        if (!propRes.ok) throw new Error(propJson.error || "Không thể tải dữ liệu bất động sản.");

        const ownersMap = {};
        if (Array.isArray(viewJson?.data)) {
          viewJson.data.forEach((v) => {
            ownersMap[v.property_id] = v.current_owners || "";
          });
        }
        
        setMarketData({
          properties: propJson.data || [],
          listings: listJson.data || [],
          ownersMap,
          queryTimeMs: Number(((propJson.query_time_ms || 0) + (listJson.query_time_ms || 0)).toFixed(2)),
        });
      } catch (err) {
        if (reqId !== requestIdRef.current) return;
        setErrorMsg(err.message || "Không kết nối được tới máy chủ Backend.");
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();
  }, []);

  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
    setSearchTerm("");
    setPage(1);
    setErrorMsg(null);
    if (tab === "marketplace") {
      fetchMarketplace();
    } else if (tab === "tables") {
      setSelectedItem("properties");
      fetchData("tables", "properties", 1);
    } else if (tab === "reports") {
      setSelectedItem("property-cash-flow");
      fetchData("reports", "property-cash-flow", 1);
    } else if (tab === "views") {
      setSelectedItem("property-current-status");
      fetchData("views", "property-current-status", 1);
    }
  };

  const handleSelectItem = (key) => {
    setSelectedItem(key);
    setSearchTerm("");
    setPage(1);
    if (activeTab === "reports") {
      const rep = REPORTS.find((r) => r.key === key);
      const nextPropId = rep?.defaultId ? String(rep.defaultId) : propertyIdParam;
      if (rep?.defaultId) setPropertyIdParam(nextPropId);
      fetchData("reports", key, 1, nextPropId);
    } else {
      fetchData(activeTab, key, 1);
    }
  };

  const openQuickCreateForResource = async (resourceKey, prefill = {}) => {
    try {
      const schemaRes = await fetch(`${API_BASE}/schema/${resourceKey}`);
      if (!schemaRes.ok) throw new Error("Không tải được schema bảng.");
      const schemaJson = await schemaRes.json();

      setModalResource(resourceKey);
      setSchema(schemaJson);

      const initial = {};
      schemaJson.columns.forEach((col) => {
        if (col.Extra?.includes("auto_increment") || AUTO_HIDDEN_FIELDS.has(col.Field)) return;
        if (prefill[col.Field] !== undefined) {
          initial[col.Field] = String(prefill[col.Field]);
          return;
        }
        const type = col.Type.toLowerCase();
        const options = getSelectOptionsForColumn(resourceKey, col.Field);

        if (col.Field === "occurred_at" || col.Field === "valid_from") {
          initial[col.Field] = getLocalDateTimeStr();
        } else if (DATE_ONLY_FIELDS.has(col.Field) && col.Null === "NO") {
          initial[col.Field] = getLocalDateStr();
        } else if (type.includes("tinyint(1)")) {
          initial[col.Field] = col.Default === "1" ? "1" : "0";
        } else if (col.Default !== null && col.Default !== undefined && col.Default !== "CURRENT_TIMESTAMP") {
          initial[col.Field] = String(col.Default);
        } else if (options && col.Null === "NO") {
          initial[col.Field] = options[0].value;
        } else {
          initial[col.Field] = "";
        }
      });

      setEditingId(null);
      setFormData(initial);
      setModalOpen(true);
    } catch (err) {
      showToast(false, err.message || "Không mở được form tạo mới.");
    }
  };

  const openCreateModal = () => {
    if (!schema) {
      openQuickCreateForResource(selectedItem);
      return;
    }
    setModalResource(selectedItem);
    const initial = {};
    schema.columns.forEach((col) => {
      if (col.Extra?.includes("auto_increment") || AUTO_HIDDEN_FIELDS.has(col.Field)) return;
      const type = col.Type.toLowerCase();
      const options = getSelectOptionsForColumn(selectedItem, col.Field);

      if (col.Field === "occurred_at" || col.Field === "valid_from") {
        initial[col.Field] = getLocalDateTimeStr();
      } else if (DATE_ONLY_FIELDS.has(col.Field) && col.Null === "NO") {
        initial[col.Field] = getLocalDateStr();
      } else if (type.includes("tinyint(1)")) {
        initial[col.Field] = col.Default === "1" ? "1" : "0";
      } else if (col.Default !== null && col.Default !== undefined && col.Default !== "CURRENT_TIMESTAMP") {
        initial[col.Field] = String(col.Default);
      } else if (options && col.Null === "NO") {
        initial[col.Field] = options[0].value;
      } else {
        initial[col.Field] = "";
      }
    });
    setEditingId(null);
    setFormData(initial);
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    if (!schema) return;
    setModalResource(selectedItem);
    const initial = {};
    schema.columns.forEach((col) => {
      if (col.Extra?.includes("auto_increment") || AUTO_HIDDEN_FIELDS.has(col.Field)) return;
      initial[col.Field] = formatInputValue(row[col.Field], col.Type.toLowerCase());
    });
    setEditingId(row[schema.pk]);
    setFormData(initial);
    setModalOpen(true);
  };

  const buildPayloadFromForm = () => {
    if (!schema) return formData;
    const payload = {};
    schema.columns.forEach((col) => {
      if (col.Extra?.includes("auto_increment") || AUTO_HIDDEN_FIELDS.has(col.Field)) return;
      const raw = formData[col.Field];
      const type = col.Type.toLowerCase();
      if (type.includes("tinyint(1)")) {
        payload[col.Field] = raw === "1" || raw === 1 || raw === true || raw === "true" ? 1 : 0;
      } else {
        payload[col.Field] = raw;
      }
    });
    return payload;
  };

  const handleSaveRecord = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isEdit = editingId !== null;
      const url = isEdit ? `${API_BASE}/${modalResource}/${editingId}` : `${API_BASE}/${modalResource}`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayloadFromForm()),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(false, json.error || "Thao tác thất bại.");
      } else {
        const extra = [];
        if (Array.isArray(json.audit_notes) && json.audit_notes.length > 0) {
          extra.push(...json.audit_notes);
        }
        if (Array.isArray(json.trigger_effect) && json.trigger_effect.length > 0) {
          extra.push(`Trigger đồng bộ ${json.trigger_effect.length} dòng lịch sử trạng thái.`);
        }
        showToast(true, json.message || "Lưu dữ liệu thành công!", extra);
        setModalOpen(false);
        if (activeTab === "marketplace") {
          fetchMarketplace();
        } else if (activeTab === "tables") {
          fetchData("tables", selectedItem, page);
        }
      }
    } catch (err) {
      showToast(false, err.message || "Lỗi kết nối máy chủ.");
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteRecord = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/${selectedItem}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        showToast(false, json.error || "Không thể xóa bản ghi.");
      } else {
        showToast(true, json.message || `Đã xóa bản ghi #${id}`);
        fetchData("tables", selectedItem, page);
      }
    } catch (err) {
      showToast(false, err.message || "Lỗi kết nối máy chủ.");
    } finally {
      setConfirmDialog(null);
    }
  };

  const executeReverseEntry = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/financial-entries/${id}/reverse`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        showToast(false, json.error || "Không thể đảo bút toán.");
      } else {
        showToast(true, json.message || `Đã tạo bút toán đảo cho #${id}`);
        fetchData("tables", selectedItem, page);
      }
    } catch (err) {
      showToast(false, err.message || "Lỗi kết nối máy chủ.");
    } finally {
      setConfirmDialog(null);
    }
  };

  const openRentWorkflowModal = (item) => {
    const defaultRent = item.primaryListing?.listing_type === "RENT" ? String(item.primaryListing.offer_amount) : "";
    setRentModalProp(item);
    setRentForm({
      full_name: "",
      email: "",
      phone: "",
      start_date: getLocalDateStr(),
      end_date: addMonthsDateStr(12),
      monthly_rent: defaultRent,
      deposit: defaultRent || "0",
      record_first_rent: true,
    });
  };

  const handleSubmitRentWorkflow = async (e) => {
    e.preventDefault();
    if (!rentModalProp) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/properties/${rentModalProp.property_id}/lease`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: {
            full_name: rentForm.full_name,
            email: rentForm.email,
            phone: rentForm.phone,
          },
          origin_listing_id:
            rentModalProp.primaryListing?.listing_type === "RENT"
              ? rentModalProp.primaryListing.listing_id
              : undefined,
          start_date: rentForm.start_date,
          end_date: rentForm.end_date,
          monthly_rent: Number(rentForm.monthly_rent),
          deposit: Number(rentForm.deposit || 0),
          record_first_rent: rentForm.record_first_rent,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(false, json.error || "Cho thuê thất bại.");
      } else {
        showToast(true, json.message || "Tạo hợp đồng thuê & ghi sổ cái thành công!", [
          `Lease ID: #${json.lease_id}`,
          `Đã ghi ${json.financial_entries?.length || 0} bút toán vào sổ cái (IN).`,
        ]);
        setRentModalProp(null);
        fetchMarketplace();
      }
    } catch (err) {
      showToast(false, err.message || "Lỗi kết nối máy chủ.");
    } finally {
      setSaving(false);
    }
  };

  const callTriggerApi = async (title, url, method = "POST", body = null) => {
    setDemoLoading(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      setTriggerLog({ title, ok: res.ok, status: res.status, data });
      showToast(
        res.ok,
        res.ok ? data.message || `${title}: Thành công` : data.error || `${title}: Bị chặn`,
        data.audit_notes || null
      );
    } catch (err) {
      setTriggerLog({ title, ok: false, status: 0, data: { error: err.message } });
      showToast(false, err.message || "Lỗi gọi API demo");
    } finally {
      setDemoLoading(false);
    }
  };

  // Gộp Property + Listing cho giao diện Nhà Tốt
  const marketplaceCards = useMemo(() => {
    const listingsByProp = {};
    marketData.listings.forEach((lst) => {
      if (!listingsByProp[lst.property_id]) listingsByProp[lst.property_id] = [];
      listingsByProp[lst.property_id].push(lst);
    });

    const enriched = marketData.properties.map((prop) => {
      const propListings = listingsByProp[prop.property_id] || [];
      const priorityOrder = { ACTIVE: 1, PAUSED: 2, CLOSED: 3, CANCELLED: 4 };
      const sorted = [...propListings].sort(
        (a, b) => (priorityOrder[a.listing_status] || 9) - (priorityOrder[b.listing_status] || 9) || b.listing_id - a.listing_id
      );
      const primaryListing = sorted[0] || null;
      return {
        ...prop,
        primaryListing,
        listingsCount: propListings.length,
        ownersText: marketData.ownersMap[prop.property_id] || "",
      };
    });

    const q = searchTerm.trim().toLowerCase();
    const filtered = enriched.filter((item) => {
      if (marketStatusFilter !== "ALL" && item.current_status !== marketStatusFilter) {
        return false;
      }
      if (marketCategory === "RENT" || marketCategory === "SALE") {
        if (!item.primaryListing || item.primaryListing.listing_type !== marketCategory) return false;
      } else if (marketCategory === "AVAILABLE") {
        if (item.current_status !== "AVAILABLE") return false;
      } else if (marketCategory !== "ALL") {
        if (!String(item.property_type || "").toLowerCase().includes(marketCategory.toLowerCase())) {
          return false;
        }
      }

      if (!q) return true;
      return (
        String(item.address || "").toLowerCase().includes(q) ||
        String(item.unit || "").toLowerCase().includes(q) ||
        String(item.property_type || "").toLowerCase().includes(q) ||
        String(item.ownersText || "").toLowerCase().includes(q) ||
        String(item.property_id).includes(q)
      );
    });

    if (marketSort === "PRICE_ASC") {
      filtered.sort((a, b) => (Number(a.primaryListing?.offer_amount) || Infinity) - (Number(b.primaryListing?.offer_amount) || Infinity));
    } else if (marketSort === "PRICE_DESC") {
      filtered.sort((a, b) => (Number(b.primaryListing?.offer_amount) || 0) - (Number(a.primaryListing?.offer_amount) || 0));
    } else if (marketSort === "AREA_DESC") {
      filtered.sort((a, b) => Number(b.area || 0) - Number(a.area || 0));
    } else {
      filtered.sort((a, b) => b.property_id - a.property_id);
    }

    return filtered;
  }, [marketData, marketCategory, marketStatusFilter, marketSort, searchTerm]);

  const marketStats = useMemo(() => {
    const total = marketData.properties.length;
    const available = marketData.properties.filter((p) => p.current_status === "AVAILABLE").length;
    const leased = marketData.properties.filter((p) => p.current_status === "LEASED").length;
    const activeListings = marketData.listings.filter((l) => l.listing_status === "ACTIVE").length;
    return { total, available, leased, activeListings };
  }, [marketData]);

  const rows = useMemo(() => result?.data || [], [result]);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q))
    );
  }, [rows, searchTerm]);

  const currentTableMeta = TABLES.find((t) => t.key === selectedItem);
  const currentReportMeta = REPORTS.find((r) => r.key === selectedItem);
  const currentViewMeta = VIEWS.find((v) => v.key === selectedItem);
  const totalPages = result?.total_all_rows ? Math.max(1, Math.ceil(result.total_all_rows / PAGE_LIMIT)) : 1;
  const isFinancialLedger = activeTab === "tables" && selectedItem === "financial-entries";

  return (
    <div className="nhatot-app">
      {/* Header Vàng đặc trưng Nhà Tốt */}
      <header className="nt-header">
        <div className="nt-header-inner">
          <button type="button" className="nt-logo" onClick={() => handleSwitchTab("marketplace")}>
            <span className="nt-logo-badge">NT</span>
            <span className="nt-logo-text">
              <strong>Nhà Tốt</strong>
              <small>Real Estate Ledger</small>
            </span>
          </button>

          <div className="nt-search-wrap">
            <input
              type="search"
              className="nt-search-input"
              placeholder={
                activeTab === "marketplace"
                  ? "Tìm bất động sản theo địa chỉ, mã căn, loại hình..."
                  : "Lọc nhanh dữ liệu đang hiển thị theo bất kỳ cột nào..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button type="button" className="nt-search-clear" onClick={() => setSearchTerm("")}>
                ×
              </button>
            )}
            <span className="nt-search-btn" aria-hidden="true">
              🔍
            </span>
          </div>

          <div className="nt-header-actions">
            <button
              type="button"
              className="nt-cta-outline"
              onClick={() => openQuickCreateForResource("listings")}
            >
              + Đăng tin mới
            </button>
            <button
              type="button"
              className="nt-cta-primary"
              onClick={() => openQuickCreateForResource("properties")}
            >
              + Thêm BĐS
            </button>
          </div>
        </div>

        {/* Sub-Nav Bar trắng */}
        <nav className="nt-subnav" aria-label="Điều hướng hệ thống">
          <div className="nt-subnav-inner">
            <div className="nt-nav-tabs">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`nt-nav-tab ${activeTab === tab.key ? "is-active" : ""}`}
                  onClick={() => handleSwitchTab(tab.key)}
                >
                  <span>{tab.label}</span>
                  <span className="nt-nav-tag">{tab.tag}</span>
                </button>
              ))}
            </div>
            <div className="nt-api-pill">
              <span className="nt-dot" />
              <span>API: localhost:3000</span>
            </div>
          </div>
        </nav>
      </header>

      {/* Toast góc trên bên phải */}
      {toast && (
        <div className={`toast-floating ${toast.ok ? "toast-ok" : "toast-err"}`} role="status">
          <div className="toast-header">
            <strong>{toast.ok ? "Thành công" : "Thông báo lỗi"}</strong>
            <button type="button" className="toast-close" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
          <div className="toast-msg">{toast.msg}</div>
          {Array.isArray(toast.details) && toast.details.length > 0 && (
            <ul className="toast-notes">
              {toast.details.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Nội dung chính */}
      <main className="nt-container">
        {activeTab === "marketplace" ? (
          <div className="nt-marketplace">
            {/* Thanh danh mục kiểu Nhà Tốt */}
            <section className="nt-category-strip">
              {CATEGORY_CHIPS.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  className={`nt-cat-chip ${marketCategory === cat.key ? "is-active" : ""}`}
                  onClick={() => setMarketCategory(cat.key)}
                >
                  <span className="nt-cat-icon">{cat.icon}</span>
                  <span className="nt-cat-label">{cat.label}</span>
                </button>
              ))}
            </section>

            {/* Thanh tóm tắt + Bộ lọc */}
            <section className="nt-filter-bar">
              <div className="nt-stats-row">
                <div className="nt-stat-chip">
                  <span>Tổng BĐS:</span>
                  <strong>{marketStats.total}</strong>
                </div>
                <div className="nt-stat-chip stat-green">
                  <span>Đang trống:</span>
                  <strong>{marketStats.available}</strong>
                </div>
                <div className="nt-stat-chip stat-blue">
                  <span>Đang cho thuê:</span>
                  <strong>{marketStats.leased}</strong>
                </div>
                <div className="nt-stat-chip stat-orange">
                  <span>Tin ACTIVE:</span>
                  <strong>{marketStats.activeListings}</strong>
                </div>
                <div className="nt-stat-chip">
                  <span>SQL:</span>
                  <strong>{marketData.queryTimeMs} ms</strong>
                </div>
              </div>

              <div className="nt-filter-controls">
                <select
                  aria-label="Lọc trạng thái BĐS"
                  value={marketStatusFilter}
                  onChange={(e) => setMarketStatusFilter(e.target.value)}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="AVAILABLE">AVAILABLE (Sẵn sàng)</option>
                  <option value="LEASED">LEASED (Đang cho thuê)</option>
                  <option value="UNDER_MAINTENANCE">UNDER_MAINTENANCE (Bảo trì)</option>
                </select>
                <select
                  aria-label="Sắp xếp BĐS"
                  value={marketSort}
                  onChange={(e) => setMarketSort(e.target.value)}
                >
                  <option value="NEWEST">Mới nhất</option>
                  <option value="PRICE_ASC">Giá thấp → cao</option>
                  <option value="PRICE_DESC">Giá cao → thấp</option>
                  <option value="AREA_DESC">Diện tích lớn → nhỏ</option>
                </select>
                <button type="button" className="btn btn-ghost" onClick={fetchMarketplace} disabled={loading}>
                  Làm mới
                </button>
              </div>
            </section>

            {/* Danh sách thẻ BĐS kiểu Nhà Tốt */}
            {loading ? (
              <div className="nt-panel state-box">
                <div className="spinner" />
                <p>Đang tải danh sách bất động sản từ MySQL...</p>
              </div>
            ) : errorMsg ? (
              <div className="nt-panel state-box state-error">
                <strong>Không thể tải dữ liệu</strong>
                <p>{errorMsg}</p>
                <button type="button" className="btn btn-primary" onClick={fetchMarketplace}>
                  Thử lại
                </button>
              </div>
            ) : marketplaceCards.length === 0 ? (
              <div className="nt-panel state-box">
                <div className="empty-house-icon">🏘️</div>
                <strong>Chưa có bất động sản nào phù hợp</strong>
                <p>
                  {marketData.properties.length === 0
                    ? "Cơ sở dữ liệu hiện đang trống. Hãy thêm BĐS đầu tiên hoặc import mock data vào MySQL để hiển thị theo dạng thẻ Nhà Tốt."
                    : "Không có tin đăng nào khớp với bộ lọc hiện tại."}
                </p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openQuickCreateForResource("properties")}
                  >
                    + Thêm bất động sản mới
                  </button>
                  {marketCategory !== "ALL" || marketStatusFilter !== "ALL" || searchTerm ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setMarketCategory("ALL");
                        setMarketStatusFilter("ALL");
                        setSearchTerm("");
                      }}
                    >
                      Xóa bộ lọc
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="nt-card-grid">
                {marketplaceCards.map((item) => {
                  const visual = getPropertyCardVisual(item.property_type);
                  const lst = item.primaryListing;
                  const isRentable = item.current_status === "AVAILABLE";
                  const ownerNames = item.ownersText.replace(/ \(\d+(?:\.\d+)?%\)(?=, |$)/g, "");

                  return (
                    <article className="nt-prop-card" key={item.property_id}>
                      <div className={`nt-card-cover ${visual.cls}`}>
                        <span className="nt-cover-emoji" aria-hidden="true">
                          {visual.icon}
                        </span>
                        <div className="nt-cover-top">
                          <span className={`pill ${getBadgeTone("current_status", item.current_status)}`}>
                            {getStatusLabelVi(item.current_status)}
                          </span>
                          {lst ? (
                            <span className={`pill ${lst.listing_type === "RENT" ? "badge-blue" : "badge-amber"}`}>
                              {lst.listing_type === "RENT" ? "Cho thuê" : "Mua bán"}
                            </span>
                          ) : (
                            <span className="pill badge-slate">Chưa đăng tin</span>
                          )}
                        </div>
                        <div className="nt-cover-bottom">
                          <span className="nt-unit-tag">
                            #{item.property_id} {item.unit ? `• ${item.unit}` : ""}
                          </span>
                          <span className="nt-type-tag">{item.property_type}</span>
                        </div>
                      </div>

                      <div className="nt-card-body">
                        <h3 className="nt-card-title" title={item.address}>
                          {item.property_type}
                          {item.unit ? ` ${item.unit}` : ""} — {item.address}
                        </h3>

                        <div className="nt-card-specs">
                          <span>{new Intl.NumberFormat("vi-VN").format(Number(item.area))} m²</span>
                          <span>•</span>
                          <span>{item.bedrooms} phòng ngủ</span>
                          {lst && (
                            <>
                              <span>•</span>
                              <span className={`pill ${getBadgeTone("listing_status", lst.listing_status)}`}>
                                Tin {lst.listing_status}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="nt-card-price">
                          {lst ? formatNhatotPrice(lst.offer_amount, lst.listing_type) : "Chưa có giá niêm yết"}
                        </div>

                        <div className="nt-card-owner">
                          <span>Chủ sở hữu: </span>
                          <strong>{ownerNames || "Chưa gán chủ sở hữu"}</strong>
                        </div>

                        <div className="nt-card-actions">
                          {isRentable ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => openRentWorkflowModal(item)}
                            >
                              Cho thuê ngay
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setActiveTab("reports");
                                setSelectedItem("property-timeline");
                                setPropertyIdParam(String(item.property_id));
                                fetchData("reports", "property-timeline", 1, item.property_id);
                              }}
                            >
                              Xem timeline
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() =>
                              openQuickCreateForResource("listings", {
                                property_id: item.property_id,
                                listing_type: "RENT",
                              })
                            }
                          >
                            + Đăng tin
                          </button>

                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setActiveTab("reports");
                              setSelectedItem("property-ledger");
                              setPropertyIdParam(String(item.property_id));
                              fetchData("reports", "property-ledger", 1, item.property_id);
                            }}
                          >
                            Sổ cái
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab !== "triggers" ? (
          <div className="nt-workspace">
            {/* Sidebar chọn nhanh trong workspace */}
            <aside className="nt-side-menu">
              <div className="nt-side-title">
                {activeTab === "tables" && "9 Bảng Dữ Liệu"}
                {activeTab === "reports" && "12 Báo Cáo SQL"}
                {activeTab === "views" && "3 SQL Views"}
              </div>
              <div className="nt-side-list">
                {(activeTab === "tables" ? TABLES : activeTab === "views" ? VIEWS : REPORTS).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`nt-side-item ${selectedItem === item.key ? "is-active" : ""}`}
                    onClick={() => handleSelectItem(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </aside>

            {/* Vùng nội dung bảng / báo cáo / view */}
            <div className="nt-main-col">
              <section className="nt-panel nt-toolbar">
                <div className="nt-toolbar-head">
                  <div>
                    <h1 className="page-title">
                      {activeTab === "tables" && currentTableMeta?.label}
                      {activeTab === "reports" && currentReportMeta?.label}
                      {activeTab === "views" && currentViewMeta?.label}
                    </h1>
                    <p className="page-subtitle">
                      {activeTab === "tables" &&
                        `Endpoint: /api/${selectedItem}${isFinancialLedger ? " — Sổ cái bất biến (BR-26)" : ""}`}
                      {activeTab === "reports" && currentReportMeta?.desc}
                      {activeTab === "views" && currentViewMeta?.desc}
                    </p>
                  </div>

                  <div className="nt-toolbar-btns">
                    {activeTab === "reports" && currentReportMeta?.hasPropertyId && (
                      <div className="inline-input-group">
                        <label htmlFor="report-prop-id" className="sr-only">
                          Property ID
                        </label>
                        <input
                          id="report-prop-id"
                          type="number"
                          min="1"
                          placeholder="Property ID"
                          value={propertyIdParam}
                          onChange={(e) => setPropertyIdParam(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => fetchData("reports", selectedItem, 1, propertyIdParam)}
                        >
                          Truy vấn
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => fetchData(activeTab, selectedItem, page)}
                      disabled={loading}
                    >
                      Làm mới
                    </button>

                    {activeTab === "tables" && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={openCreateModal}
                        disabled={!schema}
                      >
                        + Thêm bản ghi
                      </button>
                    )}
                  </div>
                </div>

                {result && (
                  <div className="kpi-strip">
                    <div className="kpi-card kpi-highlight">
                      <span className="kpi-label">Thời gian SQL (query_time_ms)</span>
                      <strong className="kpi-value">{result.query_time_ms} ms</strong>
                    </div>
                    <div className="kpi-card">
                      <span className="kpi-label">Số dòng trả về (total_rows)</span>
                      <strong className="kpi-value">
                        {searchTerm ? `${filteredRows.length} / ${result.total_rows}` : result.total_rows}
                      </strong>
                    </div>
                    {result.total_all_rows !== undefined && (
                      <div className="kpi-card">
                        <span className="kpi-label">Tổng bản ghi DB (total_all_rows)</span>
                        <strong className="kpi-value">
                          {new Intl.NumberFormat("vi-VN").format(result.total_all_rows)}
                        </strong>
                      </div>
                    )}
                    {activeTab === "tables" && (
                      <div className="kpi-card">
                        <span className="kpi-label">Trang hiện tại</span>
                        <strong className="kpi-value">
                          {page} / {totalPages}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="nt-panel table-card">
                {loading ? (
                  <div className="state-box">
                    <div className="spinner" />
                    <p>Đang thực thi truy vấn trên MySQL...</p>
                  </div>
                ) : errorMsg ? (
                  <div className="state-box state-error">
                    <strong>Không thể tải dữ liệu</strong>
                    <p>{errorMsg}</p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => fetchData(activeTab, selectedItem, page)}
                    >
                      Thử lại
                    </button>
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="state-box">
                    <p>{searchTerm ? "Không có dòng nào khớp với từ khóa lọc." : "Bảng chưa có dữ liệu."}</p>
                  </div>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          {activeTab === "tables" && <th className="col-actions-head">Thao tác</th>}
                          {columns.map((col) => (
                            <th key={col}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, idx) => {
                          const rowPk = row[result.pk] ?? idx;
                          return (
                            <tr key={rowPk}>
                              {activeTab === "tables" && (
                                <td className="col-actions">
                                  {isFinancialLedger ? (
                                    <button
                                      type="button"
                                      className="btn btn-xs btn-warning"
                                      onClick={() =>
                                        setConfirmDialog({
                                          title: `Đảo bút toán #${row.entry_id}`,
                                          message: `Hệ thống sẽ tạo một bút toán mới có chiều ngược lại (${row.direction === "IN" ? "OUT" : "IN"}) với số tiền ${formatMoney(row.amount, row.currency)} và tham chiếu reversal_of_entry_id = #${row.entry_id}.`,
                                          confirmLabel: "Xác nhận đảo bút toán",
                                          tone: "primary",
                                          onConfirm: () => executeReverseEntry(row.entry_id),
                                        })
                                      }
                                    >
                                      Đảo bút toán
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-ghost"
                                        onClick={() => openEditModal(row)}
                                      >
                                        Sửa
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-danger-soft"
                                        onClick={() =>
                                          setConfirmDialog({
                                            title: `Xóa bản ghi #${rowPk}`,
                                            message: `Bạn có chắc chắn muốn xóa bản ghi #${rowPk} khỏi bảng ${currentTableMeta?.label}? Hành động này có thể bị MySQL từ chối nếu có dữ liệu liên kết khóa ngoại.`,
                                            confirmLabel: "Xóa bản ghi",
                                            tone: "danger",
                                            onConfirm: () => executeDeleteRecord(rowPk),
                                          })
                                        }
                                      >
                                        Xóa
                                      </button>
                                    </>
                                  )}
                                </td>
                              )}
                              {columns.map((col) => (
                                <td key={col}>{formatDisplayCell(col, row[col], row)}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === "tables" && result && result.total_all_rows > 0 && (
                  <div className="pagination-bar">
                    <span className="pagination-info">
                      Hiển thị {rows.length} / {result.total_all_rows} bản ghi (mỗi trang {PAGE_LIMIT})
                    </span>
                    <div className="pagination-controls">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={page <= 1 || loading}
                        onClick={() => {
                          const prev = page - 1;
                          setPage(prev);
                          fetchData("tables", selectedItem, prev);
                        }}
                      >
                        ← Trang trước
                      </button>
                      <span className="page-pill">
                        Trang {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={page >= totalPages || loading}
                        onClick={() => {
                          const next = page + 1;
                          setPage(next);
                          fetchData("tables", selectedItem, next);
                        }}
                      >
                        Trang sau →
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        ) : (
          /* Mục 4: Demo Nghiệp vụ & Sổ cái */
          <div className="demo-layout">
            <div className="nt-panel demo-intro">
              <h1 className="page-title">Demo Nghiệp vụ Đồng bộ &amp; Sổ cái Bất biến</h1>
              <p className="page-subtitle">
                Thử nghiệm 1-click các Trigger đồng bộ trạng thái (BR-19..22), kiểm tra tham chiếu (BR-25) và tính bất biến sổ cái (BR-26) phục vụ bảo vệ đồ án.
              </p>
            </div>

            <div className="demo-grid">
              {/* Demo 1A: Tạo BĐS mới -> Trigger 1 */}
              <form
                className="nt-panel demo-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  callTriggerApi("Tạo BĐS & Trigger khởi tạo lịch sử", `${API_BASE}/properties`, "POST", newProp);
                }}
              >
                <div className="demo-card-head">
                  <span className="pill badge-green">Trigger 1 • BR-20</span>
                  <h3>Tạo BĐS mới (Tự khởi tạo lịch sử)</h3>
                </div>
                <p className="demo-desc">
                  Khi thêm 1 BĐS mới, Trigger tự động tạo dòng trạng thái đầu tiên <code>AVAILABLE</code> trong <code>property_status_history</code>.
                </p>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Địa chỉ</label>
                    <input
                      value={newProp.address}
                      onChange={(e) => setNewProp({ ...newProp, address: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Mã căn hộ</label>
                    <input value={newProp.unit} onChange={(e) => setNewProp({ ...newProp, unit: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Loại BĐS</label>
                    <input
                      value={newProp.property_type}
                      onChange={(e) => setNewProp({ ...newProp, property_type: e.target.value })}
                      required
                    />
                  </div>
                  <div className="field">
                    <label>Diện tích (m²)</label>
                    <input
                      type="number"
                      min="1"
                      value={newProp.area}
                      onChange={(e) => setNewProp({ ...newProp, area: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={demoLoading}>
                  {demoLoading ? "Đang xử lý..." : "1-Click Tạo BĐS & Xem trigger_effect"}
                </button>
              </form>

              {/* Demo 1B: Bảo trì <-> Trạng thái BĐS */}
              <div className="nt-panel demo-card">
                <div className="demo-card-head">
                  <span className="pill badge-amber">Trigger 2 • BR-19, BR-22</span>
                  <h3>Đồng bộ Bảo trì ↔ Trạng thái BĐS</h3>
                </div>
                <p className="demo-desc">
                  Mở bảo trì cản trở (<code>blocking_flag = TRUE</code>) để chuyển BĐS sang <code>UNDER_MAINTENANCE</code> hoặc bấm hoàn tất để khôi phục <code>AVAILABLE/LEASED</code>.
                </p>

                <form
                  className="demo-subform"
                  onSubmit={(e) => {
                    e.preventDefault();
                    callTriggerApi("Mở yêu cầu bảo trì", `${API_BASE}/maintenance-requests`, "POST", maintForm);
                  }}
                >
                  <div className="form-grid-2">
                    <div className="field">
                      <label>Property ID</label>
                      <input
                        type="number"
                        min="1"
                        value={maintForm.property_id}
                        onChange={(e) => setMaintForm({ ...maintForm, property_id: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Mức độ ưu tiên</label>
                      <select
                        value={maintForm.priority}
                        onChange={(e) => setMaintForm({ ...maintForm, priority: e.target.value })}
                      >
                        <option value="URGENT">URGENT</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>
                  </div>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(maintForm.blocking_flag)}
                      onChange={(e) => setMaintForm({ ...maintForm, blocking_flag: e.target.checked ? 1 : 0 })}
                    />
                    <span>Gây cản trở sinh hoạt (blocking_flag = TRUE)</span>
                  </label>
                  <button type="submit" className="btn btn-warning" disabled={demoLoading}>
                    Mở bảo trì cản trở
                  </button>
                </form>

                <div className="divider" />

                <div className="demo-subform">
                  <div className="form-grid-2">
                    <div className="field">
                      <label>Maintenance ID</label>
                      <input
                        type="number"
                        min="1"
                        value={completeMaintId}
                        onChange={(e) => setCompleteMaintId(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Chi phí sửa (VND, tùy chọn)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="VD: 500000"
                        value={completeMaintCost}
                        onChange={(e) => setCompleteMaintCost(e.target.value)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={demoLoading}
                    onClick={() =>
                      callTriggerApi(
                        `Hoàn tất bảo trì #${completeMaintId}`,
                        `${API_BASE}/maintenance-requests/${completeMaintId}/complete`,
                        "PUT",
                        completeMaintCost ? { amount: Number(completeMaintCost), currency: "VND" } : {}
                      )
                    }
                  >
                    Hoàn tất bảo trì &amp; Xem trigger_effect
                  </button>
                </div>
              </div>

              {/* Demo 2: Chặn sửa/xóa Sổ cái (BR-26) & Tham chiếu chéo (BR-25) */}
              <div className="nt-panel demo-card">
                <div className="demo-card-head">
                  <span className="pill badge-red">BR-25 &amp; BR-26</span>
                  <h3>Kiểm thử Sổ cái Bất biến &amp; Tham chiếu chéo</h3>
                </div>
                <p className="demo-desc">
                  Thử gửi lệnh <code>PUT</code>/<code>DELETE</code> lên sổ cái để chứng minh cơ chế chặn chỉnh sửa (BR-26), hoặc ghi bút toán sai <code>lease_id</code> để test BR-25.
                </p>

                <div className="field">
                  <label>Entry ID mục tiêu (BR-26)</label>
                  <input
                    type="number"
                    min="1"
                    value={ledgerEntryId}
                    onChange={(e) => setLedgerEntryId(e.target.value)}
                  />
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={demoLoading}
                    onClick={() =>
                      callTriggerApi(
                        `Thử UPDATE Entry #${ledgerEntryId} (BR-26)`,
                        `${API_BASE}/financial-entries/${ledgerEntryId}`,
                        "PUT",
                        { amount: 999999 }
                      )
                    }
                  >
                    Thử UPDATE (PUT)
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={demoLoading}
                    onClick={() =>
                      callTriggerApi(
                        `Thử DELETE Entry #${ledgerEntryId} (BR-26)`,
                        `${API_BASE}/financial-entries/${ledgerEntryId}`,
                        "DELETE"
                      )
                    }
                  >
                    Thử DELETE
                  </button>
                </div>

                <div className="divider" />

                <form
                  className="demo-subform"
                  onSubmit={(e) => {
                    e.preventDefault();
                    callTriggerApi(
                      "Kiểm tra tham chiếu chéo (BR-25)",
                      `${API_BASE}/financial-entries`,
                      "POST",
                      ledgerForm
                    );
                  }}
                >
                  <div className="form-grid-2">
                    <div className="field">
                      <label>Property ID</label>
                      <input
                        type="number"
                        min="1"
                        value={ledgerForm.property_id}
                        onChange={(e) => setLedgerForm({ ...ledgerForm, property_id: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field">
                      <label>Lease ID (cố tình nhập sai để test)</label>
                      <input
                        type="number"
                        value={ledgerForm.lease_id ?? ""}
                        onChange={(e) =>
                          setLedgerForm({
                            ...ledgerForm,
                            lease_id: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-ghost" disabled={demoLoading}>
                    Ghi bút toán test BR-25 (IN)
                  </button>
                </form>
              </div>

              {/* Demo 3: Tạo bút toán đảo */}
              <div className="nt-panel demo-card">
                <div className="demo-card-head">
                  <span className="pill badge-blue">Reversal • BR-26</span>
                  <h3>Tạo Bút toán đảo (Reversal Entry)</h3>
                </div>
                <p className="demo-desc">
                  Cách sửa sai hợp lệ duy nhất trên Sổ cái là tạo bút toán đối ứng mới (<code>IN ↔ OUT</code>) tham chiếu tới <code>reversal_of_entry_id</code>.
                </p>

                <div className="field">
                  <label>Entry ID cần đảo</label>
                  <input
                    type="number"
                    min="1"
                    value={ledgerEntryId}
                    onChange={(e) => setLedgerEntryId(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={demoLoading}
                  onClick={() =>
                    callTriggerApi(
                      `Đảo bút toán #${ledgerEntryId}`,
                      `${API_BASE}/financial-entries/${ledgerEntryId}/reverse`,
                      "POST"
                    )
                  }
                >
                  {demoLoading ? "Đang tạo..." : "Tạo Bút toán đảo (POST /reverse)"}
                </button>
              </div>
            </div>

            {/* Khu vực hiển thị phản hồi trực tiếp */}
            <section className={`nt-panel demo-result-card ${triggerLog ? (triggerLog.ok ? "border-ok" : "border-err") : ""}`}>
              <div className="demo-result-head">
                <div>
                  <h3>Kết quả phản hồi từ Backend &amp; MySQL</h3>
                  <p className="demo-desc">
                    {triggerLog ? triggerLog.title : "Bấm bất kỳ nút Demo nào ở trên để xem bảng trigger_effect và JSON trả về."}
                  </p>
                </div>
                {triggerLog && (
                  <span className={`pill ${triggerLog.ok ? "badge-green" : "badge-red"}`}>
                    HTTP {triggerLog.status} {triggerLog.ok ? "OK" : "BLOCKED / ERROR"}
                  </span>
                )}
              </div>

              {triggerLog && (
                <div className="demo-result-body">
                  {Array.isArray(triggerLog.data?.audit_notes) && triggerLog.data.audit_notes.length > 0 && (
                    <div className="audit-banner">
                      <strong>Ghi chú nghiệp vụ (audit_notes):</strong>
                      <ul>
                        {triggerLog.data.audit_notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {Array.isArray(triggerLog.data?.trigger_effect) && triggerLog.data.trigger_effect.length > 0 && (
                    <div className="trigger-table-block">
                      <div className="block-title">Bảng lịch sử trạng thái cập nhật (trigger_effect → property_status_history)</div>
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              {Object.keys(triggerLog.data.trigger_effect[0]).map((col) => (
                                <th key={col}>{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {triggerLog.data.trigger_effect.map((row, idx) => (
                              <tr key={row.status_history_id ?? idx}>
                                {Object.keys(triggerLog.data.trigger_effect[0]).map((col) => (
                                  <td key={col}>{formatDisplayCell(col, row[col], row)}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="json-block">
                    <div className="block-title">Payload JSON chi tiết</div>
                    <pre>{JSON.stringify(triggerLog.data, null, 2)}</pre>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Modal Thêm / Sửa động theo Schema */}
      {modalOpen && schema && (
        <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId !== null ? `Chỉnh sửa #${editingId}` : "Thêm bản ghi mới"}</h3>
                <p>
                  Bảng dữ liệu: <code>{schema.table}</code>
                </p>
              </div>
              <button type="button" className="icon-close" onClick={() => !saving && setModalOpen(false)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="modal-body">
              <div className="modal-fields">
                {schema.columns
                  .filter((col) => !col.Extra?.includes("auto_increment") && !AUTO_HIDDEN_FIELDS.has(col.Field))
                  .map((col) => {
                    const colType = col.Type.toLowerCase();
                    const options = getSelectOptionsForColumn(modalResource, col.Field);
                    const isRequired = col.Null === "NO" && col.Default === null;
                    const isDateOnly = colType === "date";
                    const isNumeric = colType.includes("int") || colType.includes("decimal");

                    return (
                      <div className="field" key={col.Field}>
                        <label htmlFor={`field-${col.Field}`}>
                          {col.Field}
                          <span className="field-meta">
                            ({col.Type}
                            {isRequired ? ", bắt buộc" : ""})
                          </span>
                        </label>

                        {options ? (
                          <select
                            id={`field-${col.Field}`}
                            value={formData[col.Field] ?? ""}
                            onChange={(e) => setFormData({ ...formData, [col.Field]: e.target.value })}
                            required={isRequired}
                          >
                            {!isRequired && <option value="">-- Để trống (NULL) --</option>}
                            {options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`field-${col.Field}`}
                            type={isDateOnly ? "date" : isNumeric ? "number" : "text"}
                            step={colType.includes("decimal") ? "any" : undefined}
                            value={formData[col.Field] ?? ""}
                            onChange={(e) => setFormData({ ...formData, [col.Field]: e.target.value })}
                            required={isRequired}
                            placeholder={
                              colType.includes("timestamp") || colType.includes("datetime")
                                ? "YYYY-MM-DD HH:mm:ss"
                                : col.Default
                                  ? `Mặc định: ${col.Default}`
                                  : ""
                            }
                          />
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                  Hủy bỏ
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Đang lưu..." : editingId !== null ? "Lưu thay đổi" : "Tạo mới"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cho thuê nhanh (1-Transaction Workflow) */}
      {rentModalProp && (
        <div className="modal-overlay" onClick={() => !saving && setRentModalProp(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Cho thuê BĐS #{rentModalProp.property_id}</h3>
                <p>
                  {rentModalProp.property_type} {rentModalProp.unit ? `(${rentModalProp.unit})` : ""} — {rentModalProp.address}
                </p>
              </div>
              <button type="button" className="icon-close" onClick={() => !saving && setRentModalProp(null)}>
                ×
              </button>
            </div>

            <form onSubmit={handleSubmitRentWorkflow} className="modal-body">
              <div className="modal-fields">
                <div className="field">
                  <label>Họ tên khách thuê *</label>
                  <input
                    required
                    placeholder="Nguyễn Văn A"
                    value={rentForm.full_name}
                    onChange={(e) => setRentForm({ ...rentForm, full_name: e.target.value })}
                  />
                </div>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Email khách thuê *</label>
                    <input
                      type="email"
                      required
                      placeholder="tenant@example.com"
                      value={rentForm.email}
                      onChange={(e) => setRentForm({ ...rentForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Số điện thoại *</label>
                    <input
                      required
                      placeholder="0901234567"
                      value={rentForm.phone}
                      onChange={(e) => setRentForm({ ...rentForm, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Ngày bắt đầu *</label>
                    <input
                      type="date"
                      required
                      value={rentForm.start_date}
                      onChange={(e) => setRentForm({ ...rentForm, start_date: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Ngày kết thúc *</label>
                    <input
                      type="date"
                      required
                      value={rentForm.end_date}
                      onChange={(e) => setRentForm({ ...rentForm, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-grid-2">
                  <div className="field">
                    <label>Tiền thuê / tháng (VND) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={rentForm.monthly_rent}
                      onChange={(e) => setRentForm({ ...rentForm, monthly_rent: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Tiền cọc (VND)</label>
                    <input
                      type="number"
                      min="0"
                      value={rentForm.deposit}
                      onChange={(e) => setRentForm({ ...rentForm, deposit: e.target.value })}
                    />
                  </div>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={rentForm.record_first_rent}
                    onChange={(e) => setRentForm({ ...rentForm, record_first_rent: e.target.checked })}
                  />
                  <span>Ghi luôn tiền thuê kỳ đầu vào sổ cái tài chính (IN)</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setRentModalProp(null)} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Đang xử lý giao dịch..." : "Xác nhận cho thuê"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác nhận Xóa / Đảo bút toán */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-card modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{confirmDialog.title}</h3>
              <button type="button" className="icon-close" onClick={() => setConfirmDialog(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">{confirmDialog.message}</p>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmDialog(null)}>
                  Hủy
                </button>
                <button
                  type="button"
                  className={`btn ${confirmDialog.tone === "danger" ? "btn-danger" : "btn-primary"}`}
                  onClick={confirmDialog.onConfirm}
                >
                  {confirmDialog.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
