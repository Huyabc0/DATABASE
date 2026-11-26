import express from "express";
import dotenv from "dotenv";
import pool, { testDbConnection } from "./config/db.js";

// Import các Router tách riêng theo từng bảng trong property.sql & báo cáo
import ownerRoutes from "./routes/owner.routes.js";
import propertyRoutes from "./routes/property.routes.js";
import propertyOwnershipRoutes from "./routes/propertyOwnership.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import listingRoutes from "./routes/listing.routes.js";
import agentAssignmentRoutes from "./routes/agentAssignment.routes.js";
import tenantRoutes from "./routes/tenant.routes.js";
import leaseRoutes from "./routes/lease.routes.js";
import leaseTenantRoutes from "./routes/leaseTenant.routes.js";
import maintenanceRoutes from "./routes/maintenance.routes.js";
import propertyStatusHistoryRoutes from "./routes/propertyStatusHistory.routes.js";
import financialEntryRoutes from "./routes/financialEntry.routes.js";
import reportRoutes from "./routes/report.routes.js";

dotenv.config();

const app = express();

// =========================================================================
// CẤU HÌNH MIDDLEWARE & KẾT NỐI MYSQL
// =========================================================================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json());

// Kiểm tra kết nối MySQL khi khởi động
testDbConnection();

// =========================================================================
// PHẦN 1: API CHO 12 BẢNG CƠ SỞ DỮ LIỆU (TÁCH RIÊNG THEO property.sql)
// =========================================================================

// 1.1 Bảng owner (Chủ sở hữu): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/owners", ownerRoutes);

// 1.2 Bảng property (Bất động sản - đồng bộ trigger lịch sử trạng thái): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/properties", propertyRoutes);

// 1.3 Bảng property_ownership (Quyền sở hữu nhiều-nhiều, khóa chính kép): GET, GET /:ownerId/:propertyId, POST, PUT, DELETE
app.use("/api/property-ownerships", propertyOwnershipRoutes);

// 1.4 Bảng agent (Nhân viên môi giới): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/agents", agentRoutes);

// 1.5 Bảng listing (Tin đăng bán / cho thuê): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/listings", listingRoutes);

// 1.6 Bảng agent_assignment (Phân công môi giới theo tin đăng): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/agent-assignments", agentAssignmentRoutes);

// 1.7 Bảng tenant (Khách thuê): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/tenants", tenantRoutes);

// 1.8 Bảng lease (Hợp đồng thuê - đồng bộ trạng thái BĐS & đóng listing): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/leases", leaseRoutes);

// 1.9 Bảng lease_tenant (Khách thuê theo hợp đồng, khóa chính kép): GET, GET /:leaseId/:tenantId, POST, PUT, DELETE
app.use("/api/lease-tenants", leaseTenantRoutes);

// 1.10 Bảng maintenance_request (Yêu cầu bảo trì - đồng bộ UNDER_MAINTENANCE & /:id/complete): GET, GET /:id, POST, PUT /:id, PUT /:id/complete, DELETE /:id
app.use("/api/maintenance-requests", maintenanceRoutes);

// 1.11 Bảng property_status_history (Sổ cái lịch sử trạng thái BĐS): GET, GET /:id, POST, PUT /:id, DELETE /:id
app.use("/api/property-status-histories", propertyStatusHistoryRoutes);

// 1.12 Bảng financial_entry (Sổ cái tài chính bất biến BR-25/BR-26 & đảo bút toán /:id/reverse): GET, GET /:id, POST, POST /:id/reverse (chặn PUT/DELETE)
app.use("/api/financial-entries", financialEntryRoutes);

// =========================================================================
// PHẦN 2: API SCHEMA, 3 SQL VIEWS & 12 BÁO CÁO PHỨC TẠP
// =========================================================================
// - GET /api/schema/:resource
// - GET /api/views/property-current-status | property-ledger-balance | active-leases-detail
// - GET /api/reports/* (12 báo cáo phân tích & đối soát)
app.use("/api", reportRoutes);

// =========================================================================
// KHỞI ĐỘNG SERVER & ĐÓNG KẾT NỐI AN TOÀN
// =========================================================================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  await pool.end();
  server.close(() => process.exit(0));
});