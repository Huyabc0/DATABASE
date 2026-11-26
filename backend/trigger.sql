
USE real_estate_ledger;

DELIMITER $$

-- ============================================================================
-- TRIGGER 1: Khi thêm mới PROPERTY -> Tự khởi tạo lịch sử AVAILABLE (BR-20, BR-21)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_property_init_status$$
CREATE TRIGGER trg_property_init_status
AFTER INSERT ON property
FOR EACH ROW
BEGIN
    INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason)
    VALUES (NEW.property_id, NEW.current_status, CURRENT_TIMESTAMP, NULL, 'Khởi tạo bất động sản mới');
END$$


-- ============================================================================
-- TRIGGER 1B: Khi UPDATE trực tiếp cột current_status trên PROPERTY
-- Tự động: Đóng lịch sử cũ + Mở lịch sử mới + Tạm dừng/Kích hoạt lại listing theo trạng thái
-- ============================================================================
DROP TRIGGER IF EXISTS trg_property_status_update$$
CREATE TRIGGER trg_property_status_update
AFTER UPDATE ON property
FOR EACH ROW
BEGIN
    IF OLD.current_status <> NEW.current_status THEN
        -- Đóng dòng lịch sử hiện hành
        UPDATE property_status_history
        SET valid_to = CURRENT_TIMESTAMP
        WHERE property_id = NEW.property_id AND valid_to IS NULL;

        -- Mở dòng lịch sử trạng thái mới
        INSERT INTO property_status_history (property_id, status, valid_from, valid_to, reason)
        VALUES (NEW.property_id, NEW.current_status, CURRENT_TIMESTAMP, NULL,
                CONCAT('Cập nhật trạng thái BĐS từ ', OLD.current_status, ' sang ', NEW.current_status));

        -- Nếu BĐS không còn trống (AVAILABLE) -> Tạm dừng các tin đăng đang ACTIVE
        -- Nếu BĐS quay về AVAILABLE -> Kích hoạt lại các tin đăng đang PAUSED
        IF NEW.current_status <> 'AVAILABLE' THEN
            UPDATE listing
            SET listing_status = 'PAUSED'
            WHERE property_id = NEW.property_id AND listing_status = 'ACTIVE';
        ELSE
            UPDATE listing
            SET listing_status = 'ACTIVE'
            WHERE property_id = NEW.property_id AND listing_status = 'PAUSED';
        END IF;
    END IF;
END$$


-- ============================================================================
-- TRIGGER 2: Đồng bộ trạng thái BĐS khi mở/đóng BẢO TRÌ CẢN TRỞ (BR-07, BR-19, BR-22)
-- Lưu ý: Chỉ cần UPDATE bảng property, Trigger 1B sẽ tự động ghi history & pause listing!
-- ============================================================================
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
        -- Mở sự cố cản trở -> Chuyển property sang UNDER_MAINTENANCE
        IF p_new_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS') THEN
            UPDATE property
            SET current_status = 'UNDER_MAINTENANCE'
            WHERE property_id = p_property_id AND current_status <> 'UNDER_MAINTENANCE';

        -- Đóng sự cố cản trở -> Kiểm tra còn sự cố cản trở nào khác không
        ELSEIF p_is_update = TRUE
           AND p_old_status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
           AND p_new_status IN ('COMPLETED', 'CANCELLED') THEN

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

                UPDATE property
                SET current_status = v_next_status
                WHERE property_id = p_property_id AND current_status <> v_next_status;
            END IF;
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_maintenance_status_sync_insert$$
CREATE TRIGGER trg_maintenance_status_sync_insert
AFTER INSERT ON maintenance_request
FOR EACH ROW
BEGIN
    CALL sp_sync_maintenance_property_status(
        FALSE, NULL, NEW.status, NEW.blocking_flag, NEW.property_id, NEW.maintenance_id
    );
END$$

DROP TRIGGER IF EXISTS trg_maintenance_status_sync_update$$
CREATE TRIGGER trg_maintenance_status_sync_update
AFTER UPDATE ON maintenance_request
FOR EACH ROW
BEGIN
    CALL sp_sync_maintenance_property_status(
        TRUE, OLD.status, NEW.status, NEW.blocking_flag, NEW.property_id, NEW.maintenance_id
    );
END$$


-- ============================================================================
-- TRIGGER 2B: Đồng bộ trạng thái BĐS & Tin đăng khi HỢP ĐỒNG THUÊ (LEASE) đổi trạng thái
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_sync_lease_property_status$$
CREATE PROCEDURE sp_sync_lease_property_status(
    IN p_lease_status VARCHAR(25),
    IN p_property_id INT,
    IN p_origin_listing_id INT
)
BEGIN
    DECLARE v_other_active_lease INT DEFAULT 0;
    DECLARE v_open_blocking INT DEFAULT 0;

    -- Khi hợp đồng kích hoạt (ACTIVE) -> BĐS thành LEASED, đóng tin đăng nguồn
    IF p_lease_status = 'ACTIVE' THEN
        UPDATE property
        SET current_status = 'LEASED'
        WHERE property_id = p_property_id AND current_status <> 'LEASED';

        IF p_origin_listing_id IS NOT NULL THEN
            UPDATE listing
            SET listing_status = 'CLOSED', end_date = CURRENT_DATE
            WHERE listing_id = p_origin_listing_id AND listing_status IN ('ACTIVE', 'PAUSED');
        END IF;

    -- Khi hợp đồng kết thúc/hủy -> Trả BĐS về AVAILABLE (nếu không còn HĐ khác & không đang bảo trì)
    ELSEIF p_lease_status IN ('EXPIRED', 'TERMINATED', 'CANCELLED') THEN
        SELECT COUNT(*) INTO v_other_active_lease
        FROM lease
        WHERE property_id = p_property_id AND lease_status = 'ACTIVE';

        SELECT COUNT(*) INTO v_open_blocking
        FROM maintenance_request
        WHERE property_id = p_property_id
          AND blocking_flag = TRUE
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS');

        IF v_other_active_lease = 0 AND v_open_blocking = 0 THEN
            UPDATE property
            SET current_status = 'AVAILABLE'
            WHERE property_id = p_property_id AND current_status <> 'AVAILABLE';
        END IF;
    END IF;
END$$

DROP TRIGGER IF EXISTS trg_lease_status_sync_insert$$
CREATE TRIGGER trg_lease_status_sync_insert
AFTER INSERT ON lease
FOR EACH ROW
BEGIN
    CALL sp_sync_lease_property_status(NEW.lease_status, NEW.property_id, NEW.origin_listing_id);
END$$

DROP TRIGGER IF EXISTS trg_lease_status_sync_update$$
CREATE TRIGGER trg_lease_status_sync_update
AFTER UPDATE ON lease
FOR EACH ROW
BEGIN
    IF OLD.lease_status <> NEW.lease_status THEN
        CALL sp_sync_lease_property_status(NEW.lease_status, NEW.property_id, NEW.origin_listing_id);
    END IF;
END$$


-- ============================================================================
-- TRIGGER 3: Bảo vệ tính bất biến (Append-Only) & Tham chiếu chéo Sổ cái (BR-25, BR-26)
-- ============================================================================
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

DROP TRIGGER IF EXISTS trg_financial_ledger_guard_update$$
CREATE TRIGGER trg_financial_ledger_guard_update
BEFORE UPDATE ON financial_entry
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'BR-26 Violation: Sổ cái tài chính là bất biến, không được phép UPDATE bản ghi đã ghi sổ.';
END$$

DROP TRIGGER IF EXISTS trg_financial_ledger_guard_delete$$
CREATE TRIGGER trg_financial_ledger_guard_delete
BEFORE DELETE ON financial_entry
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'BR-26 Violation: Sổ cái tài chính là bất biến, không được phép DELETE bản ghi đã ghi sổ.';
END$$

DELIMITER ;