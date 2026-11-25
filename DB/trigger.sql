-- ============================================================================
-- TRIGGERS (3 TRIGGERS)
-- ============================================================================
USE `real_estate_ledger`;

DELIMITER $$

-- TRIGGER 1: Tự động khởi tạo trạng thái AVAILABLE khi đăng ký mới PROPERTY (BR-20, BR-21)
DROP TRIGGER IF EXISTS trg_property_init_status$$
CREATE TRIGGER trg_property_init_status
AFTER INSERT ON property
FOR EACH ROW
BEGIN
    INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason)
    VALUES (NEW.property_id, 'AVAILABLE', CURRENT_TIMESTAMP, NULL, 'Khởi tạo bất động sản mới');
END$$


-- TRIGGER 2: Điều phối trạng thái BĐS khi có bảo trì gây cản trở hoặc hoàn tất bảo trì (BR-07, BR-19, BR-22)

DROP PROCEDURE IF EXISTS sp_sync_maintenance_property_status$$
CREATE PROCEDURE sp_sync_maintenance_property_status(
    IN p_is_update BOOLEAN,
    IN p_old_status VARCHAR(25),
    IN p_new_status VARCHAR(25),
    IN p_blocking_flag BOOLEAN,
    IN p_property_id INT,
    IN p_maintenance_id INT
)
BEGIN
    DECLARE v_open_blocking INT DEFAULT 0;
    DECLARE v_active_lease  INT DEFAULT 0;
    DECLARE v_next_status   VARCHAR(25);

    IF p_blocking_flag = TRUE THEN
        -- Khi mở sự cố gây cản trở -> Tạm dừng tin đăng ACTIVE & chuyển BĐS sang UNDER_MAINTENANCE
        IF p_new_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS') THEN
            UPDATE listing
            SET listing_status = 'PAUSED'
            WHERE property_id = p_property_id AND listing_status = 'ACTIVE';

            UPDATE property_status_history
            SET valid_to = CURRENT_TIMESTAMP
            WHERE property_id = p_property_id AND valid_to IS NULL AND status <> 'UNDER_MAINTENANCE';

            IF ROW_COUNT() > 0 THEN
                INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason)
                VALUES (p_property_id, 'UNDER_MAINTENANCE', CURRENT_TIMESTAMP, NULL, CONCAT('Mở bảo trì cản trở #', p_maintenance_id));
            END IF;

        -- Khi đóng sự cố gây cản trở -> Khôi phục LEASED (nếu còn HĐ) hoặc AVAILABLE (BR-22)
        ELSEIF p_is_update = TRUE AND p_old_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS') AND p_new_status IN ('COMPLETED', 'CANCELLED') THEN
            SELECT COUNT(*) INTO v_open_blocking
            FROM maintenance_request
            WHERE property_id = p_property_id
              AND maintenance_id <> p_maintenance_id
              AND blocking_flag = TRUE
              AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS');

            IF v_open_blocking = 0 THEN
                SELECT COUNT(*) INTO v_active_lease
                FROM lease
                WHERE property_id = p_property_id AND lease_status = 'ACTIVE';

                SET v_next_status = IF(v_active_lease > 0, 'LEASED', 'AVAILABLE');

                UPDATE property_status_history
                SET valid_to = CURRENT_TIMESTAMP
                WHERE property_id = p_property_id AND valid_to IS NULL AND status <> v_next_status;

                IF ROW_COUNT() > 0 THEN
                    INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason)
                    VALUES (p_property_id, v_next_status, CURRENT_TIMESTAMP, NULL, CONCAT('Hoàn tất bảo trì cản trở cuối #', p_maintenance_id));
                END IF;
            END IF;
        END IF;
    END IF;
END$$

-- Trigger 2a: Kích hoạt khi INSERT
DROP TRIGGER IF EXISTS trg_maintenance_status_sync_insert$$
CREATE TRIGGER trg_maintenance_status_sync_insert
AFTER INSERT ON maintenance_request
FOR EACH ROW
BEGIN
    CALL sp_sync_maintenance_property_status(
        FALSE, NULL, NEW.status, NEW.blocking_flag, NEW.property_id, NEW.maintenance_id
    );
END$$

-- Trigger 2b: Kích hoạt khi UPDATE
DROP TRIGGER IF EXISTS trg_maintenance_status_sync_update$$
CREATE TRIGGER trg_maintenance_status_sync_update
AFTER UPDATE ON maintenance_request
FOR EACH ROW
BEGIN
    CALL sp_sync_maintenance_property_status(
        TRUE, OLD.status, NEW.status, NEW.blocking_flag, NEW.property_id, NEW.maintenance_id
    );
END$$


-- TRIGGER 3: Bảo vệ tính bất biến (Append-Only) và tham chiếu chéo của Sổ cái tài chính (BR-25, BR-26)

-- Trigger 3a: Kiểm tra tham chiếu chéo khi INSERT
DROP TRIGGER IF EXISTS trg_financial_ledger_guard_insert$$
CREATE TRIGGER trg_financial_ledger_guard_insert
BEFORE INSERT ON financial_entry
FOR EACH ROW
BEGIN
    DECLARE v_prop_id INT;
    DECLARE v_err_msg VARCHAR(255);

    IF NEW.lease_id IS NOT NULL THEN
        SELECT property_id INTO v_prop_id FROM lease WHERE lease_id = NEW.lease_id;
        IF v_prop_id IS NULL OR v_prop_id <> NEW.property_id THEN
            SET v_err_msg = CONCAT('BR-25 Violation: lease_id=', NEW.lease_id, ' không thuộc property_id=', NEW.property_id);
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_err_msg;
        END IF;
    END IF;

    IF NEW.maintenance_id IS NOT NULL THEN
        SELECT property_id INTO v_prop_id FROM maintenance_request WHERE maintenance_id = NEW.maintenance_id;
        IF v_prop_id IS NULL OR v_prop_id <> NEW.property_id THEN
            SET v_err_msg = CONCAT('BR-25 Violation: maintenance_id=', NEW.maintenance_id, ' không thuộc property_id=', NEW.property_id);
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_err_msg;
        END IF;
    END IF;
END$$

-- Trigger 3b: Chặn UPDATE
DROP TRIGGER IF EXISTS trg_financial_ledger_guard_update$$
CREATE TRIGGER trg_financial_ledger_guard_update
BEFORE UPDATE ON financial_entry
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'BR-26 Violation: Sổ cái tài chính là bất biến, không được phép UPDATE bản ghi đã ghi sổ.';
END$$

-- Trigger 3c: Chặn DELETE
DROP TRIGGER IF EXISTS trg_financial_ledger_guard_delete$$
CREATE TRIGGER trg_financial_ledger_guard_delete
BEFORE DELETE ON financial_entry
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' 
    SET MESSAGE_TEXT = 'BR-26 Violation: Sổ cái tài chính là bất biến, không được phép DELETE bản ghi đã ghi sổ.';
END$$

DELIMITER ;

-- ============================================================================
-- VIEWS (3 VIEWS)
-- ============================================================================

-- VIEW 1: Tổng quan hiện trạng bất động sản & chủ sở hữu hiện hành
CREATE OR REPLACE VIEW v_property_current_status AS
SELECT
    p.property_id,
    p.address,
    p.unit,
    p.property_type,
    p.area,
    psh.status AS current_status,
    psh.valid_from AS status_since,
    GROUP_CONCAT(
        CONCAT(o.full_name, ' (', po.ownership_share, '%)') 
        ORDER BY po.ownership_share DESC 
        SEPARATOR ', '
    ) AS current_owners
FROM property p
JOIN property_status_history psh
    ON p.property_id = psh.property_id AND psh.valid_to IS NULL
LEFT JOIN property_ownership po
    ON p.property_id = po.property_id AND po.valid_to IS NULL
LEFT JOIN owner o
    ON po.owner_id = o.owner_id
GROUP BY p.property_id, p.address, p.unit, p.property_type, p.area, psh.status, psh.valid_from;


-- VIEW 2: Bảng cân đối thu chi (Sổ cái tổng hợp) theo từng bất động sản
CREATE OR REPLACE VIEW v_property_ledger_balance AS
SELECT
    p.property_id,
    p.address,
    p.unit,
    fe.currency,
    SUM(CASE WHEN fe.direction = 'CREDIT' THEN fe.amount ELSE 0 END) AS total_credit,
    SUM(CASE WHEN fe.direction = 'DEBIT'  THEN fe.amount ELSE 0 END) AS total_debit,
    SUM(CASE WHEN fe.direction = 'CREDIT' THEN fe.amount ELSE -fe.amount END) AS net_balance
FROM property p
JOIN financial_entry fe ON p.property_id = fe.property_id
GROUP BY p.property_id, p.address, p.unit, fe.currency;


-- VIEW 3: Chi tiết hợp đồng thuê đang hiệu lực kèm thông tin khách thuê chính
CREATE OR REPLACE VIEW v_active_leases_detail AS
SELECT
    l.lease_id,
    p.property_id,
    p.address,
    p.unit,
    t.full_name AS primary_tenant_name,
    t.phone AS primary_tenant_phone,
    l.start_date,
    l.end_date,
    l.monthly_rent,
    l.deposit
FROM lease l
JOIN property p ON l.property_id = p.property_id
JOIN lease_tenant lt ON l.lease_id = lt.lease_id AND lt.tenant_role = 'PRIMARY' AND lt.left_on IS NULL
JOIN tenant t ON lt.tenant_id = t.tenant_id
WHERE l.lease_status = 'ACTIVE';