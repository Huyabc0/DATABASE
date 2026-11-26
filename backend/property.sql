-- =============================================================================
-- CƠ SỞ DỮ LIỆU | CHỦ ĐỀ 10: SỔ QUẢN LÝ BẤT ĐỘNG SẢN VÀ CHO THUÊ, BÁN
-- Kịch bản DDL chuẩn hóa MySQL 8.0 (Khớp 100% với index.js và trigger.sql)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS real_estate_ledger
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE real_estate_ledger;

-- Tắt kiểm tra khóa ngoại tạm thời để tạo/làm mới bảng không bị vướng thứ tự
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- 1. BẢNG: owner
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS owner;
CREATE TABLE owner (
    owner_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của chủ sở hữu',
    full_name VARCHAR(100) NOT NULL COMMENT 'Họ và tên đầy đủ của chủ sở hữu',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'Địa chỉ email duy nhất dùng để liên hệ',
    phone VARCHAR(20) NOT NULL COMMENT 'Số điện thoại liên lạc',
    CONSTRAINT pk_owner PRIMARY KEY (owner_id)
) ENGINE=InnoDB COMMENT='Bảng thông tin chủ sở hữu bất động sản';

-- -----------------------------------------------------------------------------
-- 2. BẢNG: property
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS property;
CREATE TABLE property (
    property_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của bất động sản',
    address VARCHAR(255) NOT NULL COMMENT 'Địa chỉ chuẩn hóa (Số nhà, đường, phường/xã, quận/huyện)',
    unit VARCHAR(50) NULL COMMENT 'Mã căn hộ hoặc số phòng (VD: A-1204)',
    property_type VARCHAR(50) NOT NULL COMMENT 'Loại hình BĐS (Căn hộ, Nhà phố, Biệt thự, Mặt bằng)',
    area DECIMAL(10, 2) NOT NULL COMMENT 'Diện tích tính bằng mét vuông (m²)',
    bedrooms INT NOT NULL DEFAULT 0 COMMENT 'Số lượng phòng ngủ',
    current_status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE' COMMENT 'Trạng thái hiện tại (AVAILABLE, LEASED, UNDER_MAINTENANCE)',
    CONSTRAINT pk_property PRIMARY KEY (property_id),
    CONSTRAINT chk_property_area CHECK (area > 0),
    CONSTRAINT chk_property_bedrooms CHECK (bedrooms >= 0),
    CONSTRAINT chk_property_status CHECK (current_status IN ('AVAILABLE', 'LEASED', 'UNDER_MAINTENANCE'))
) ENGINE=InnoDB COMMENT='Bảng quản lý thông tin tài sản bất động sản';

-- -----------------------------------------------------------------------------
-- 3. BẢNG: property_ownership
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS property_ownership;
CREATE TABLE property_ownership (
    owner_id INT NOT NULL COMMENT 'Mã chủ sở hữu (Khóa ngoại)',
    property_id INT NOT NULL COMMENT 'Mã bất động sản (Khóa ngoại)',
    ownership_share DECIMAL(5, 2) NOT NULL COMMENT 'Tỷ lệ sở hữu phần trăm (VD: 50.00%)',
    valid_from TIMESTAMP NOT NULL COMMENT 'Thời điểm bắt đầu quyền sở hữu',
    valid_to TIMESTAMP NULL COMMENT 'Thời điểm kết thúc sở hữu (NULL nếu đang sở hữu)',
    CONSTRAINT pk_property_ownership PRIMARY KEY (owner_id, property_id, valid_from),
    CONSTRAINT fk_po_owner FOREIGN KEY (owner_id) REFERENCES owner (owner_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_po_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_ownership_share CHECK (ownership_share > 0 AND ownership_share <= 100)
) ENGINE=InnoDB COMMENT='Bảng phân rã quan hệ sở hữu nhiều - nhiều giữa Owner và Property';

-- -----------------------------------------------------------------------------
-- 4. BẢNG: agent
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS agent;
CREATE TABLE agent (
    agent_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của nhân viên môi giới',
    license_no VARCHAR(50) NOT NULL UNIQUE COMMENT 'Số chứng chỉ hành nghề duy nhất',
    full_name VARCHAR(100) NOT NULL COMMENT 'Họ và tên nhân viên môi giới',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'Email làm việc',
    agent_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'Trạng thái hoạt động (ACTIVE, SUSPENDED, INACTIVE)',
    CONSTRAINT pk_agent PRIMARY KEY (agent_id),
    CONSTRAINT chk_agent_status CHECK (agent_status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
) ENGINE=InnoDB COMMENT='Bảng hồ sơ nhân viên môi giới bất động sản';

-- -----------------------------------------------------------------------------
-- 5. BẢNG: listing
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS listing;
CREATE TABLE listing (
    listing_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của tin đăng',
    property_id INT NOT NULL COMMENT 'Mã bất động sản được chào (Khóa ngoại)',
    listing_type VARCHAR(10) NOT NULL COMMENT 'Loại tin đăng (SALE: Bán, RENT: Cho thuê)',
    offer_amount DECIMAL(15, 2) NOT NULL COMMENT 'Giá chào bán hoặc tiền thuê định kỳ đề xuất',
    start_date DATE NOT NULL COMMENT 'Ngày bắt đầu công bố tin đăng',
    end_date DATE NULL COMMENT 'Ngày đóng tin đăng',
    listing_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'Trạng thái tin đăng (ACTIVE, CLOSED, CANCELLED, PAUSED)',
    CONSTRAINT pk_listing PRIMARY KEY (listing_id),
    CONSTRAINT fk_listing_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_listing_type CHECK (listing_type IN ('SALE', 'RENT')),
    CONSTRAINT chk_listing_offer CHECK (offer_amount > 0),
    CONSTRAINT chk_listing_status CHECK (listing_status IN ('ACTIVE', 'CLOSED', 'CANCELLED', 'PAUSED'))
) ENGINE=InnoDB COMMENT='Bảng danh sách các tin đăng chào bán hoặc cho thuê';

-- -----------------------------------------------------------------------------
-- 6. BẢNG: agent_assignment
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS agent_assignment;
CREATE TABLE agent_assignment (
    assignment_id INT AUTO_INCREMENT COMMENT 'Mã phân công làm việc',
    listing_id INT NOT NULL COMMENT 'Mã tin đăng được phân công (Khóa ngoại)',
    agent_id INT NOT NULL COMMENT 'Mã môi giới đảm nhận (Khóa ngoại)',
    assignment_role VARCHAR(20) NOT NULL DEFAULT 'LEAD' COMMENT 'Vai trò phụ trách (LEAD: Trưởng nhóm, SUPPORT: Hỗ trợ)',
    assigned_from TIMESTAMP NOT NULL COMMENT 'Thời điểm bắt đầu phân công',
    assigned_to TIMESTAMP NULL COMMENT 'Thời điểm kết thúc phân công (NULL nếu đang đảm nhận)',
    CONSTRAINT pk_agent_assignment PRIMARY KEY (assignment_id),
    CONSTRAINT fk_assign_listing FOREIGN KEY (listing_id) REFERENCES listing (listing_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_assign_agent FOREIGN KEY (agent_id) REFERENCES agent (agent_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_assign_role CHECK (assignment_role IN ('LEAD', 'SUPPORT'))
) ENGINE=InnoDB COMMENT='Bảng ghi nhận phân công trách nhiệm môi giới theo tin đăng';

-- -----------------------------------------------------------------------------
-- 7. BẢNG: tenant
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS tenant;
CREATE TABLE tenant (
    tenant_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của người thuê',
    full_name VARCHAR(100) NOT NULL COMMENT 'Họ và tên khách thuê',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'Email cá nhân khách thuê',
    phone VARCHAR(20) NOT NULL COMMENT 'Số điện thoại liên hệ',
    CONSTRAINT pk_tenant PRIMARY KEY (tenant_id)
) ENGINE=InnoDB COMMENT='Bảng danh mục thông tin khách thuê';

-- -----------------------------------------------------------------------------
-- 8. BẢNG: lease
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS lease;
CREATE TABLE lease (
    lease_id INT AUTO_INCREMENT COMMENT 'Mã định danh duy nhất của hợp đồng thuê',
    property_id INT NOT NULL COMMENT 'Mã bất động sản được thuê (Khóa ngoại)',
    origin_listing_id INT NULL COMMENT 'Mã tin đăng nguồn dẫn đến hợp đồng (Khóa ngoại, tùy chọn)',
    start_date DATE NOT NULL COMMENT 'Ngày bắt đầu hiệu lực hợp đồng',
    end_date DATE NOT NULL COMMENT 'Ngày hết hạn hợp đồng',
    monthly_rent DECIMAL(15, 2) NOT NULL COMMENT 'Số tiền thuê cố định hàng tháng',
    deposit DECIMAL(15, 2) NOT NULL DEFAULT 0.00 COMMENT 'Số tiền cọc đảm bảo hợp đồng',
    lease_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'Trạng thái vòng đời (DRAFT, ACTIVE, EXPIRED, TERMINATED, CANCELLED)',
    CONSTRAINT pk_lease PRIMARY KEY (lease_id),
    CONSTRAINT fk_lease_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_lease_listing FOREIGN KEY (origin_listing_id) REFERENCES listing (listing_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_lease_dates CHECK (end_date >= start_date),
    CONSTRAINT chk_lease_rent CHECK (monthly_rent > 0),
    CONSTRAINT chk_lease_deposit CHECK (deposit >= 0),
    CONSTRAINT chk_lease_status CHECK (lease_status IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED'))
) ENGINE=InnoDB COMMENT='Bảng quản lý hợp đồng thuê bất động sản';

-- -----------------------------------------------------------------------------
-- 9. BẢNG: lease_tenant
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS lease_tenant;
CREATE TABLE lease_tenant (
    lease_id INT NOT NULL COMMENT 'Mã hợp đồng thuê (Khóa ngoại)',
    tenant_id INT NOT NULL COMMENT 'Mã khách thuê (Khóa ngoại)',
    tenant_role VARCHAR(30) NOT NULL DEFAULT 'PRIMARY' COMMENT 'Vai trò (PRIMARY: Khách chính, CO_SIGNER: Người đồng ký)',
    joined_on DATE NOT NULL COMMENT 'Ngày bắt đầu tham gia ở',
    left_on DATE NULL COMMENT 'Ngày kết thúc rời đi (NULL nếu đang ở)',
    CONSTRAINT pk_lease_tenant PRIMARY KEY (lease_id, tenant_id),
    CONSTRAINT fk_lt_lease FOREIGN KEY (lease_id) REFERENCES lease (lease_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_lt_tenant FOREIGN KEY (tenant_id) REFERENCES tenant (tenant_id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Bảng liên kết khách thuê với hợp đồng thuê';

-- -----------------------------------------------------------------------------
-- 10. BẢNG: maintenance_request
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS maintenance_request;
CREATE TABLE maintenance_request (
    maintenance_id INT AUTO_INCREMENT COMMENT 'Mã định danh yêu cầu bảo trì',
    property_id INT NOT NULL COMMENT 'Mã bất động sản phát sinh sự cố (Khóa ngoại)',
    reporter_tenant_id INT NULL COMMENT 'Mã người thuê gửi báo cáo (Khóa ngoại, tùy chọn)',
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM' COMMENT 'Mức độ ưu tiên (LOW, MEDIUM, HIGH, URGENT)',
    blocking_flag BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'TRUE: Cản trở sinh hoạt (đổi trạng thái BĐS sang UNDER_MAINTENANCE)',
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT 'Trạng thái (OPEN, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED)',
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm tiếp nhận yêu cầu',
    closed_at TIMESTAMP NULL COMMENT 'Thời điểm nghiệm thu hoàn thành hoặc hủy',
    CONSTRAINT pk_maintenance PRIMARY KEY (maintenance_id),
    CONSTRAINT fk_maint_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_maint_tenant FOREIGN KEY (reporter_tenant_id) REFERENCES tenant (tenant_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_maint_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    CONSTRAINT chk_maint_status CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
) ENGINE=InnoDB COMMENT='Bảng quản lý yêu cầu bảo trì và sự cố tài sản';

-- -----------------------------------------------------------------------------
-- 11. BẢNG: property_status_history
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS property_status_history;
CREATE TABLE property_status_history (
    status_history_id INT AUTO_INCREMENT COMMENT 'Mã lịch sử trạng thái',
    property_id INT NOT NULL COMMENT 'Mã bất động sản (Khóa ngoại)',
    status VARCHAR(30) NOT NULL COMMENT 'Trạng thái ghi nhận (AVAILABLE, LEASED, UNDER_MAINTENANCE)',
    valid_from TIMESTAMP NOT NULL COMMENT 'Thời điểm bắt đầu hiệu lực trạng thái',
    valid_to TIMESTAMP NULL COMMENT 'Thời điểm kết thúc (NULL đại diện cho trạng thái hiện hành)',
    reason TEXT NULL COMMENT 'Lý do diễn giải thay đổi trạng thái',
    CONSTRAINT pk_status_history PRIMARY KEY (status_history_id),
    CONSTRAINT fk_psh_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_psh_status CHECK (status IN ('AVAILABLE', 'LEASED', 'UNDER_MAINTENANCE'))
) ENGINE=InnoDB COMMENT='Sổ cái lịch sử trạng thái vận hành bất động sản';

-- -----------------------------------------------------------------------------
-- 12. BẢNG: financial_entry
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS financial_entry;
CREATE TABLE financial_entry (
    entry_id INT AUTO_INCREMENT COMMENT 'Mã bút toán tài chính duy nhất',
    property_id INT NOT NULL COMMENT 'Mã bất động sản phát sinh tài chính (Khóa ngoại)',
    listing_id INT NULL COMMENT 'Mã tin đăng tham chiếu (Khóa ngoại tùy chọn)',
    lease_id INT NULL COMMENT 'Mã hợp đồng thuê tham chiếu (Khóa ngoại tùy chọn)',
    maintenance_id INT NULL COMMENT 'Mã yêu cầu bảo trì tham chiếu (Khóa ngoại tùy chọn)',
    entry_type VARCHAR(50) NOT NULL COMMENT 'Loại hình (RENT, DEPOSIT, DEPOSIT_REFUND, REPAIR_FEE, COMMISSION, MANAGEMENT_FEE)',
    direction VARCHAR(10) NOT NULL COMMENT 'Chiều dòng tiền (IN: Thu vào, OUT: Chi ra)',
    amount DECIMAL(15, 2) NOT NULL COMMENT 'Số tiền giao dịch (luôn dương)',
    currency VARCHAR(3) NOT NULL DEFAULT 'VND' COMMENT 'Mã tiền tệ ISO 4217 (VND, USD, EUR)',
    occurred_at TIMESTAMP NOT NULL COMMENT 'Thời điểm phát sinh thực tế theo chứng từ',
    posted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Thời điểm ghi nhận vào sổ cái hệ thống',
    reversal_of_entry_id INT NULL COMMENT 'Self-reference FK: Mã bút toán gốc bị đảo/sửa sai (nếu có)',
    CONSTRAINT pk_financial_entry PRIMARY KEY (entry_id),
    CONSTRAINT fk_fe_property FOREIGN KEY (property_id) REFERENCES property (property_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fe_listing FOREIGN KEY (listing_id) REFERENCES listing (listing_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fe_lease FOREIGN KEY (lease_id) REFERENCES lease (lease_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fe_maint FOREIGN KEY (maintenance_id) REFERENCES maintenance_request (maintenance_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_fe_reversal FOREIGN KEY (reversal_of_entry_id) REFERENCES financial_entry (entry_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT chk_fe_direction CHECK (direction IN ('IN', 'OUT')),
    CONSTRAINT chk_fe_amount CHECK (amount > 0)
) ENGINE=InnoDB COMMENT='Sổ cái tài chính bất biến (Append-Only Financial Ledger)';

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- KHỞI TẠO CÁC INDEX TỐI ƯU TRUY VẤN
-- =============================================================================
CREATE INDEX idx_property_status ON property (current_status);
CREATE INDEX idx_psh_current ON property_status_history (property_id, valid_to);
CREATE INDEX idx_listing_active ON listing (property_id, listing_status);
CREATE INDEX idx_lease_active ON lease (property_id, lease_status);
CREATE INDEX idx_fe_property_ledger ON financial_entry (property_id, posted_at);

-- =============================================================================
-- KHỞI TẠO 3 SQL VIEWS PHỤC VỤ API /api/views/*
-- =============================================================================
CREATE OR REPLACE VIEW v_property_current_status AS
SELECT
    p.property_id,
    p.address,
    p.unit,
    p.property_type,
    p.area,
    p.bedrooms,
    p.current_status,
    psh.valid_from AS status_since,
    psh.reason AS status_reason,
    po_agg.current_owners,
    COALESCE(po_agg.total_ownership_share, 0.00) AS total_ownership_share
FROM property p
LEFT JOIN property_status_history psh
    ON psh.property_id = p.property_id AND psh.valid_to IS NULL
LEFT JOIN (
    SELECT
        po.property_id,
        GROUP_CONCAT(
            CONCAT(o.full_name, ' (', po.ownership_share, '%)')
            ORDER BY po.ownership_share DESC, o.full_name ASC
            SEPARATOR ', '
        ) AS current_owners,
        SUM(po.ownership_share) AS total_ownership_share
    FROM property_ownership po
    JOIN owner o ON o.owner_id = po.owner_id
    WHERE po.valid_to IS NULL
    GROUP BY po.property_id
) po_agg ON po_agg.property_id = p.property_id;

CREATE OR REPLACE VIEW v_property_ledger_balance AS
SELECT
    p.property_id,
    p.address,
    p.unit,
    COALESCE(fe.currency, 'VND') AS currency,
    COUNT(fe.entry_id) AS entry_count,
    COALESCE(SUM(CASE WHEN fe.direction = 'IN' THEN fe.amount ELSE 0 END), 0.00) AS total_in,
    COALESCE(SUM(CASE WHEN fe.direction = 'OUT' THEN fe.amount ELSE 0 END), 0.00) AS total_out,
    COALESCE(SUM(CASE WHEN fe.direction = 'IN' THEN fe.amount WHEN fe.direction = 'OUT' THEN -fe.amount ELSE 0 END), 0.00) AS net_balance
FROM property p
LEFT JOIN financial_entry fe ON fe.property_id = p.property_id
GROUP BY p.property_id, p.address, p.unit, COALESCE(fe.currency, 'VND');

CREATE OR REPLACE VIEW v_active_leases_detail AS
SELECT
    l.lease_id,
    l.property_id,
    p.address,
    p.unit,
    l.origin_listing_id,
    l.start_date,
    l.end_date,
    l.monthly_rent,
    l.deposit,
    l.lease_status,
    GROUP_CONCAT(
        CONCAT(t.full_name, ' [', lt.tenant_role, ']')
        ORDER BY lt.tenant_role ASC, t.full_name ASC
        SEPARATOR ', '
    ) AS tenants
FROM lease l
JOIN property p ON p.property_id = l.property_id
LEFT JOIN lease_tenant lt ON lt.lease_id = l.lease_id AND lt.left_on IS NULL
LEFT JOIN tenant t ON t.tenant_id = lt.tenant_id
WHERE l.lease_status = 'ACTIVE'
GROUP BY
    l.lease_id, l.property_id, p.address, p.unit, l.origin_listing_id,
    l.start_date, l.end_date, l.monthly_rent, l.deposit, l.lease_status;