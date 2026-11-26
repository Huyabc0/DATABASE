# Giảng viên
Lê Hà Thanh <br/>

# Giới thiệu thành viên

thien511 Phạm Tâm Phúc Thiện <br/>
ngminhtri0609-svg Nguyễn Ngọc Minh Trí <br/>
Huyabc0 Trương Nhật Huy <br/>

# Hệ Thống Sổ Quản Lý Bất Động Sản & Tài Chính (Real Estate Ledger)

Dự án quản lý bất động sản, hợp đồng thuê, bảo trì và sổ cái tài chính bất biến (Append-Only Financial Ledger) sử dụng **MySQL 8.0**, **Node.js (Express)** và **React (Vite)**.

---

## 1. Yêu cầu môi trường (Prerequisites)

Trước khi chạy dự án, hãy đảm bảo máy tính đã cài đặt:

- **Git**
- **Node.js** (bản LTS mới nhất) — kiểm tra bằng lệnh `node -v`
- **MySQL Server 8.0** & **MySQL Workbench**

---

## 2. Clone dự án từ GitHub

Mở Terminal / Git Bash và chạy lệnh sau:

```bash
git clone <đường-dẫn-repo-github-của-bạn>
cd real-estate-project
```

---

## 3. Thiết lập Cơ sở dữ liệu (MySQL Workbench)

1. **Mở MySQL Workbench** và kết nối vào `Local instance MySQL80`.

2. **Import database và data mẫu:**
   - Tại giao diện làm việc của kết nối MySQL hiện tại, nhìn lên thanh menu trên cùng, chọn **Server > Data Import**.
   - Chọn **Import from Self-Contained File**, sau đó nhấn nút **...** và chọn file `real_estate_ledger.sql`.
   - Tại mục **Default Target Schema**, nhấp vào danh sách thả xuống và chọn `real_estate_ledger`.
   - Sau đó, nhấn nút **Start Import** ở góc dưới cùng bên phải màn hình.
   - Tương tự các bước trên, import thêm file `trigger.sql`.

3. **Kiểm tra xem import đã thành công chưa:**
   - Dùng thanh menu: Nhìn lên góc trên cùng bên trái màn hình, nhấn vào **File > chọn New Query Tab**.
   - Dán đoạn lệnh sau vào:

```sql
USE real_estate_ledger;

SHOW TRIGGERS;
SHOW PROCEDURE STATUS WHERE Db = DATABASE();

SELECT * FROM owner;
SELECT * FROM property_ownership;
SELECT * FROM property;
SELECT * FROM agent;
SELECT * FROM listing;
SELECT * FROM agent_assignment;
SELECT * FROM tenant;
SELECT * FROM lease;
SELECT * FROM lease_tenant;
SELECT * FROM maintenance_request;
SELECT * FROM property_status_history;
SELECT * FROM financial_entry;
```

   - Sau đó, ấn biểu tượng tia sét (**Execute**) để chạy; bạn sẽ thấy tất cả các bảng kèm dữ liệu và các trigger hiện ra.
> **Lưu ý:** Nếu khi chạy Backend gặp lỗi `Access denied for user 'root'@'localhost'`, hãy chạy 2 dòng lệnh sau trong MySQL Workbench để đồng bộ chuẩn xác thực mật khẩu:
>
> ```sql
> ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
> FLUSH PRIVILEGES;
> ```

---

## 4. Cài đặt & Chạy Backend (Node.js + Express)

1. Di chuyển vào thư mục `backend` và cài đặt các thư viện cần thiết:
   ```bash
   cd backend
   npm install
   ```
2. Tạo file `.env` trong thư mục `backend/` (nếu chưa có) với nội dung sau và chỉnh lại `DB_PASSWORD` cho khớp với MySQL của bạn:
   ```env
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=123456
   DB_NAME=real_estate_ledger
   PORT=3000
   ```
3. Khởi động server Backend:
   ```bash
   node index.js
   ```
   _(Thấy thông báo `Server chạy tại http://localhost:3000` và `Kết nối MySQL thành công!` là thành công. Giữ nguyên cửa sổ Terminal này)._

---

## 5. Cài đặt & Chạy Frontend (React + Vite)

Mở một cửa sổ **Terminal thứ 2** tại thư mục gốc `real-estate-project`, sau đó chạy:

```bash
cd frontend
npm install
npm run dev
```

Mở trình duyệt và truy cập địa chỉ: **`http://localhost:5173`**

---

## 6. Chạy nhanh cho các lần sau

Từ lần thứ 2 trở đi, bạn không cần cài đặt lại hay mở MySQL Workbench, chỉ cần mở 2 Terminal song song:

- **Terminal 1 (Backend):** `cd backend && node index.js`
- **Terminal 2 (Frontend):** `cd frontend && npm run dev`
