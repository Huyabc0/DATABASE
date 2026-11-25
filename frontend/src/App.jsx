import { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "http://localhost:3000/api";

const TABLES = [
  { key: "properties", label: "Property (BĐS)" },
  { key: "owners", label: "Owner (Chủ sở hữu)" },
  { key: "agents", label: "Agent (Môi giới)" },
  { key: "tenants", label: "Tenant (Khách thuê)" },
  { key: "listings", label: "Listing (Tin đăng)" },
  { key: "leases", label: "Lease (Hợp đồng)" },
  { key: "financial-entries", label: "Financial Entry (Sổ cái)" },
  { key: "maintenance-requests", label: "Maintenance (Bảo trì)" },
  { key: "property-status-histories", label: "Status History (Lịch sử)" },
];

const REPORTS = [
  { key: "property-cash-flow", label: "1. Dòng tiền thuần theo BĐS" },
  { key: "agent-performance", label: "2. Xếp hạng hiệu suất Môi giới" },
  { key: "owner-entitlement", label: "3. Phân bổ thu nhập Chủ sở hữu" },
  { key: "property-ledger", label: "4. Sổ cái & Số dư lũy kế (theo BĐS)", hasPropertyId: true, defaultId: 6 },
  { key: "above-avg-rent-leases", label: "5. Hợp đồng giá thuê > Trung bình" },
  { key: "ownership-discrepancies", label: "6. Kiểm toán tỷ lệ sở hữu != 100%" },
  { key: "unmonetized-active-listings", label: "7. Tin đăng ACTIVE chưa có giao dịch" },
  { key: "maintenance-by-property-type", label: "8. Thống kê bảo trì theo loại BĐS" },
  { key: "property-timeline", label: "9. Dòng thời gian sự kiện (theo BĐS)", hasPropertyId: true, defaultId: 1 },
  { key: "tenant-lease-summary", label: "10. Tổng hợp danh mục khách thuê" },
  { key: "rent-price-variance", label: "11. Chênh lệch giá chào & giá chốt" },
  { key: "property-occupancy", label: "12. Tỷ lệ lấp đầy (Occupancy Rate)" },
];

const VIEWS = [
  { key: "property-current-status", label: "View 1: Hiện trạng BĐS & Chủ sở hữu" },
  { key: "property-ledger-balance", label: "View 2: Bảng cân đối thu chi BĐS" },
  { key: "active-leases-detail", label: "View 3: Chi tiết hợp đồng đang hiệu lực" },
];

function formatInputValue(val, type) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string" && type.includes("date") && !type.includes("datetime")) {
    return val.slice(0, 10);
  }
  return String(val);
}

export default function App() {
  const [activeTab, setActiveTab] = useState("tables");
  const [selectedItem, setSelectedItem] = useState("properties");
  const [propertyIdParam, setPropertyIdParam] = useState(6);
  const [page, setPage] = useState(1);

  const [result, setResult] = useState(null);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null); // { ok: boolean, msg: string }

  // Modal Thêm / Sửa cho 9 bảng
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  // State riêng cho tab Demo 3 Triggers
  const [newProp, setNewProp] = useState({ address: "123 Nguyễn Huệ, Q1", unit: "A-101", city: "TP.HCM", property_type: "Căn hộ", area: 75, bedrooms: 2 });
  const [maintForm, setMaintForm] = useState({ property_id: 1, priority: "URGENT", blocking_flag: 1, status: "OPEN" });
  const [completeMaintId, setCompleteMaintId] = useState(1);
  const [ledgerForm, setLedgerForm] = useState({
    property_id: 1,
    lease_id: 9999, // Cố tình nhập sai để test Trigger 3a (BR-25)
    entry_type: "RENT",
    direction: "CREDIT",
    amount: 15000000,
    currency: "VND",
    occurred_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  });
  const [ledgerEntryId, setLedgerEntryId] = useState(1);
  const [triggerLog, setTriggerLog] = useState(null);

  const showToast = (ok, msg) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchData = async (tab, key, currentPage = 1, propId = propertyIdParam) => {
    setLoading(true);
    try {
      let url = "";
      if (tab === "tables") {
        url = `${API_BASE}/${key}?page=${currentPage}&limit=50`;
        const schemaRes = await fetch(`${API_BASE}/schema/${key}`);
        if (schemaRes.ok) setSchema(await schemaRes.json());
      } else if (tab === "views") {
        url = `${API_BASE}/views/${key}`;
      } else if (tab === "reports") {
        const rep = REPORTS.find((r) => r.key === key);
        url = `${API_BASE}/reports/${key}${rep?.hasPropertyId ? `?property_id=${propId}` : ""}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Lỗi truy vấn");
      setResult(json);
    } catch (err) {
      showToast(false, err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "tables") {
      setSelectedItem("properties");
      setPage(1);
      fetchData("tables", "properties", 1);
    } else if (activeTab === "reports") {
      setSelectedItem("property-cash-flow");
      fetchData("reports", "property-cash-flow");
    } else if (activeTab === "views") {
      setSelectedItem("property-current-status");
      fetchData("views", "property-current-status");
    }
  }, [activeTab]);

  // Mở modal Thêm mới
  const openCreateModal = () => {
    if (!schema) return;
    const initial = {};
    schema.columns.forEach((col) => {
      if (col.Extra?.includes("auto_increment")) return;
      initial[col.Field] = col.Default && col.Default !== "CURRENT_TIMESTAMP" ? col.Default : "";
    });
    setEditingId(null);
    setFormData(initial);
    setModalOpen(true);
  };

  // Mở modal Sửa dòng
  const openEditModal = (row) => {
    if (!schema) return;
    const initial = {};
    schema.columns.forEach((col) => {
      if (col.Extra?.includes("auto_increment")) return;
      initial[col.Field] = formatInputValue(row[col.Field], col.Type.toLowerCase());
    });
    setEditingId(row[schema.pk]);
    setFormData(initial);
    setModalOpen(true);
  };

  // Lưu Thêm / Sửa
  const handleSaveRecord = async (e) => {
    e.preventDefault();
    const isEdit = editingId !== null;
    const url = isEdit ? `${API_BASE}/${selectedItem}/${editingId}` : `${API_BASE}/${selectedItem}`;
    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(false, json.error || "Thao tác thất bại");
    } else {
      showToast(true, json.message);
      setModalOpen(false);
      fetchData("tables", selectedItem, page);
    }
  };

  // Xóa dòng
  const handleDeleteRecord = async (id) => {
    if (!window.confirm(`Bạn chắc chắn muốn xóa bản ghi #${id}?`)) return;
    const res = await fetch(`${API_BASE}/${selectedItem}/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      showToast(false, json.error);
    } else {
      showToast(true, json.message);
      fetchData("tables", selectedItem, page);
    }
  };

  // Các hàm Demo Triggers
  const callTriggerApi = async (url, method = "POST", body = null) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    setTriggerLog({ ok: res.ok, status: res.status, data });
  };

  const currentReport = REPORTS.find((r) => r.key === selectedItem);
  const rows = result?.data || [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="container">
      <header className="header">
        <h1>Sổ Quản Lý Bất Động Sản & Tài Chính</h1>
        <p>Full CRUD (9 bảng) • 12 Báo cáo Benchmark • 3 Views • 3 Triggers (BR-20..26)</p>
      </header>

      {toast && <div className={`toast ${toast.ok ? "toast-ok" : "toast-err"}`}>{toast.msg}</div>}

      <nav className="tabs">
        <button className={activeTab === "tables" ? "active" : ""} onClick={() => setActiveTab("tables")}>
          Quản lý 9 Bảng (Full CRUD)
        </button>
        <button className={activeTab === "reports" ? "active" : ""} onClick={() => setActiveTab("reports")}>
          12 Báo cáo phức tạp
        </button>
        <button className={activeTab === "views" ? "active" : ""} onClick={() => setActiveTab("views")}>
          3 SQL Views
        </button>
        <button className={activeTab === "triggers" ? "active" : ""} onClick={() => setActiveTab("triggers")}>
          Demo 3 Triggers & Sổ cái
        </button>
      </nav>

      {activeTab !== "triggers" ? (
        <div className="panel">
          <div className="controls">
            <select
              value={selectedItem}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedItem(val);
                setPage(1);
                const rep = REPORTS.find((r) => r.key === val);
                const nextPropId = rep?.defaultId || propertyIdParam;
                if (rep?.defaultId) setPropertyIdParam(rep.defaultId);
                fetchData(activeTab, val, 1, nextPropId);
              }}
            >
              {(activeTab === "tables" ? TABLES : activeTab === "views" ? VIEWS : REPORTS).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>

            {activeTab === "tables" && (
              <button className="success" onClick={openCreateModal}>
                + Thêm bản ghi mới
              </button>
            )}

            {activeTab === "reports" && currentReport?.hasPropertyId && (
              <div className="inline-input">
                <label>Property ID:</label>
                <input type="number" value={propertyIdParam} onChange={(e) => setPropertyIdParam(e.target.value)} />
                <button onClick={() => fetchData("reports", selectedItem, 1, propertyIdParam)}>Truy vấn</button>
              </div>
            )}

            {result && (
              <div className="metrics">
                <span className="badge">Thời gian: {result.query_time_ms} ms</span>
                <span className="badge">Hiển thị: {result.total_rows} dòng</span>
                {result.total_all_rows !== undefined && (
                  <span className="badge">Tổng DB: {result.total_all_rows} dòng</span>
                )}
              </div>
            )}
          </div>

          {activeTab === "tables" && result && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => { setPage(page - 1); fetchData("tables", selectedItem, page - 1); }}>
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button
                disabled={page * 50 >= result.total_all_rows}
                onClick={() => { setPage(page + 1); fetchData("tables", selectedItem, page + 1); }}
              >
                Trang sau
              </button>
            </div>
          )}

          {loading ? (
            <p className="loading">Đang chạy truy vấn MySQL...</p>
          ) : rows.length === 0 ? (
            <p className="empty">Không có dữ liệu.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {activeTab === "tables" && <th>Hành động</th>}
                    {columns.map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      {activeTab === "tables" && (
                        <td className="actions">
                          <button className="btn-sm" onClick={() => openEditModal(row)}>Sửa</button>
                          <button className="btn-sm danger" onClick={() => handleDeleteRecord(row[result.pk])}>Xóa</button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col}>{row[col] !== null && row[col] !== undefined ? String(row[col]) : "NULL"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="trigger-grid">
          {/* Trigger 1 */}
          <form className="card" onSubmit={(e) => { e.preventDefault(); callTriggerApi(`${API_BASE}/properties`, "POST", newProp); }}>
            <h3>Trigger 1: Tự khởi tạo AVAILABLE (BR-20)</h3>
            <p>Thêm BĐS mới → Tự động tạo dòng trạng thái đầu tiên trong <code>property_status_history</code>.</p>
            <input placeholder="Địa chỉ" value={newProp.address} onChange={(e) => setNewProp({ ...newProp, address: e.target.value })} required />
            <input placeholder="Mã căn hộ" value={newProp.unit} onChange={(e) => setNewProp({ ...newProp, unit: e.target.value })} />
            <input placeholder="Loại hình" value={newProp.property_type} onChange={(e) => setNewProp({ ...newProp, property_type: e.target.value })} required />
            <input type="number" placeholder="Diện tích (m²)" value={newProp.area} onChange={(e) => setNewProp({ ...newProp, area: e.target.value })} required />
            <button type="submit">Thêm Bất Động Sản</button>
          </form>

          {/* Trigger 2 */}
          <div className="card">
            <h3>Trigger 2: Đồng bộ trạng thái Bảo trì (BR-19, 22)</h3>
            <p>Mở bảo trì cản trở → Chuyển BĐS sang <code>UNDER_MAINTENANCE</code> & tạm dừng tin đăng.</p>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); callTriggerApi(`${API_BASE}/maintenance-requests`, "POST", maintForm); }}>
              <input type="number" placeholder="Property ID" value={maintForm.property_id} onChange={(e) => setMaintForm({ ...maintForm, property_id: Number(e.target.value) })} />
              <label className="checkbox">
                <input type="checkbox" checked={Boolean(maintForm.blocking_flag)} onChange={(e) => setMaintForm({ ...maintForm, blocking_flag: e.target.checked ? 1 : 0 })} />
                Gây cản trở sinh hoạt (blocking_flag = TRUE)
              </label>
              <button type="submit">Mở yêu cầu bảo trì</button>
            </form>
            <hr />
            <div className="inline-input">
              <input type="number" placeholder="Maint ID" value={completeMaintId} onChange={(e) => setCompleteMaintId(e.target.value)} />
              <button className="success" onClick={() => callTriggerApi(`${API_BASE}/maintenance-requests/${completeMaintId}/complete`, "PUT")}>
                Hoàn tất bảo trì
              </button>
            </div>
          </div>

          {/* Trigger 3a */}
          <form className="card" onSubmit={(e) => { e.preventDefault(); callTriggerApi(`${API_BASE}/financial-entries`, "POST", ledgerForm); }}>
            <h3>Trigger 3a: Kiểm tra tham chiếu chéo (BR-25)</h3>
            <p>Thử ghi bút toán có <code>lease_id</code> không thuộc <code>property_id</code> → MySQL sẽ chặn lỗi.</p>
            <div className="inline-input">
              <label>Prop ID:</label>
              <input type="number" value={ledgerForm.property_id} onChange={(e) => setLedgerForm({ ...ledgerForm, property_id: Number(e.target.value) })} />
              <label>Lease ID:</label>
              <input type="number" value={ledgerForm.lease_id} onChange={(e) => setLedgerForm({ ...ledgerForm, lease_id: e.target.value ? Number(e.target.value) : null })} />
            </div>
            <input type="number" placeholder="Số tiền" value={ledgerForm.amount} onChange={(e) => setLedgerForm({ ...ledgerForm, amount: Number(e.target.value) })} />
            <button type="submit">Ghi bút toán (Test BR-25)</button>
          </form>

          {/* Trigger 3b, 3c & Reversal */}
          <div className="card">
            <h3>Trigger 3b/3c: Sổ cái bất biến (BR-26) & Đảo bút toán</h3>
            <p>Thử UPDATE/DELETE sẽ bị Trigger chặn. Cách sửa sai hợp lệ duy nhất là tạo <b>Bút toán đảo</b>.</p>
            <input type="number" placeholder="Entry ID" value={ledgerEntryId} onChange={(e) => setLedgerEntryId(e.target.value)} />
            <div className="btn-row">
              <button className="danger" onClick={() => callTriggerApi(`${API_BASE}/financial-entries/${ledgerEntryId}`, "PUT", { amount: 999 })}>
                Thử UPDATE
              </button>
              <button className="danger" onClick={() => callTriggerApi(`${API_BASE}/financial-entries/${ledgerEntryId}`, "DELETE")}>
                Thử DELETE
              </button>
              <button className="success" onClick={() => callTriggerApi(`${API_BASE}/financial-entries/${ledgerEntryId}/reverse`, "POST")}>
                Tạo Bút toán đảo
              </button>
            </div>
          </div>

          {/* Log phản hồi MySQL */}
          {triggerLog && (
            <div className={`card full-width ${triggerLog.ok ? "log-ok" : "log-err"}`}>
              <h3>Phản hồi từ MySQL (HTTP {triggerLog.status})</h3>
              <pre>{JSON.stringify(triggerLog.data, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* Modal Thêm / Sửa động theo Schema MySQL */}
      {modalOpen && schema && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? `Sửa bảng ${schema.table} (#${editingId})` : `Thêm mới vào ${schema.table}`}</h3>
            <form onSubmit={handleSaveRecord} className="modal-form">
              {schema.columns
                .filter((col) => !col.Extra?.includes("auto_increment"))
                .map((col) => (
                  <div className="form-group" key={col.Field}>
                    <label>
                      {col.Field} <span className="col-type">({col.Type}{col.Null === "NO" ? ", bắt buộc" : ""})</span>
                    </label>
                    <input
                      value={formData[col.Field] ?? ""}
                      onChange={(e) => setFormData({ ...formData, [col.Field]: e.target.value })}
                      required={col.Null === "NO" && col.Default === null}
                      placeholder={col.Default ? `Mặc định: ${col.Default}` : ""}
                    />
                  </div>
                ))}
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setModalOpen(false)}>Hủy</button>
                <button type="submit" className="success">{editingId ? "Lưu thay đổi" : "Tạo mới"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}