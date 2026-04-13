<p align="center">
  <img src="build/icon.png" width="120" alt="Moyin Creator Logo" />
</p>
<h1 align="center">魔因漫创 Moyin Creator</h1>

<p align="center">
  <strong>🎬 Công cụ sản xuất phim AI chuyên nghiệp · Hỗ trợ Seedance 2.0 · Toàn bộ quy trình từ kịch bản đến thành phẩm theo lô</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="Giấy phép" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/releases"><img src="https://img.shields.io/github/v/release/MemeCalculate/moyin-creator" alt="Phiên bản" /></a>
  <a href="https://github.com/MemeCalculate/moyin-creator/stargazers"><img src="https://img.shields.io/github/stars/MemeCalculate/moyin-creator" alt="Số sao" /></a>
</p>

<p align="center">
  <a href="README.md">🇨🇳 Tiếng Trung</a> | <a href="README_EN.md">🇬🇧 Tiếng Anh</a> | <strong>🇻🇳 Tiếng Việt</strong>
</p>

<p align="center">
  <a href="docs/WORKFLOW_GUIDE.md"><strong>📖 Hướng dẫn quy trình làm việc</strong></a> •
  <a href="#tính-năng">Tính năng</a> •
  <a href="#bắt-đầu-nhanh">Bắt đầu nhanh</a> •
  <a href="#kiến-trúc-kỹ-thuật">Kiến trúc kỹ thuật</a> •
  <a href="#giấy-phép">Giấy phép</a> •
  <a href="#đóng-góp">Đóng góp</a>
</p>

---

<!-- Ảnh chụp màn hình: thay thế bằng ảnh thực tế sau
<p align="center">
  <img src="docs/images/screenshot.png" width="800" alt="Screenshot" />
</p>
-->

![1771428968476_3nkjdd](https://github.com/user-attachments/assets/582ee70f-f0dc-433b-9d5c-2ddb8f463450)

## Giới thiệu

**Moyin Creator** là công cụ sản xuất cấp chuyên nghiệp dành cho các nhà sáng tạo phim AI. Năm mô-đun liên kết chặt chẽ, bao phủ toàn bộ chuỗi sáng tạo từ kịch bản đến thành phẩm:

> **📝 Kịch bản → 🎭 Nhân vật → 🌄 Cảnh quay → 🎬 Đạo diễn → ⭐ Hạng S (Seedance 2.0)**

Đầu ra của mỗi bước tự động chuyển sang bước tiếp theo, không cần thao tác thủ công. Hỗ trợ nhiều mô hình AI hàng đầu, phù hợp cho sản xuất hàng loạt phim ngắn, anime, trailer và nhiều thể loại khác.

Hướng dẫn cài đặt cơ bản: https://www.bilibili.com/video/BV1FsZDBHExJ/?vd_source=802462c0708e775ce81f95b2e486f175


## Tính năng

### ⭐ Mô-đun Hạng S — Tạo nội dung đa phương thức Seedance 2.0 / SkyReels-V4
- **Tạo video tường thuật đa cảnh kết hợp**: Nhóm và kết hợp nhiều phân cảnh để tạo video tường thuật liên tục
- Hỗ trợ tham chiếu đa phương thức @Image / @Video / @Audio (ảnh tham chiếu nhân vật, ảnh cảnh, ảnh khung đầu tiên được thu thập tự động)
- Xây dựng prompt thông minh: Tự động hợp nhất 3 lớp (hành động + ngôn ngữ máy quay + đồng bộ khẩu hình lời thoại)
- Ghép lưới ảnh khung đầu tiên (chiến lược N×N)
- Tự động kiểm tra ràng buộc tham số Seedance 2.0 (≤9 ảnh + ≤3 video + ≤3 âm thanh, prompt≤5000 ký tự)
- <img width="578" height="801" alt="eecf9d3e210cb52066025a0d1b48b54" src="https://github.com/user-attachments/assets/34b623a3-9be9-4eb5-ae52-a6a9553598ea" />
<img width="584" height="802" alt="59e57c230f67e2c5aaa425a09332d2e" src="https://github.com/user-attachments/assets/54c6036b-c545-45c0-a32b-de71b8138484" />

<img width="1602" height="835" alt="1b23b9abde0cc651ecb06d49576119b" src="https://github.com/user-attachments/assets/2b5af973-98c9-4708-bf53-02d11321d86d" />

### 🎬 Bộ máy phân tích kịch bản
- Phân tách kịch bản thông minh thành cảnh, phân cảnh, lời thoại
- Tự động nhận diện nhân vật, cảnh quay, cảm xúc, ngôn ngữ máy quay
- Hỗ trợ cấu trúc kịch bản nhiều tập/nhiều màn
<img width="1384" height="835" alt="d37f36356961edcda06edee6382d2fe" src="https://github.com/user-attachments/assets/e42266c2-aaeb-4cc3-a734-65516774d495" />

### 🎭 Hệ thống nhất quán nhân vật
- **6 lớp neo danh tính**: Đảm bảo ngoại hình nhất quán của cùng một nhân vật trong các phân cảnh khác nhau
- Quản lý Hồ sơ nhân vật (Character Bible)
- Hỗ trợ liên kết ảnh tham chiếu nhân vật
<img width="1384" height="835" alt="ffcddeeda0e1aa012529ed26c850a65" src="https://github.com/user-attachments/assets/763e6ced-43e2-4c7b-a5ea-b13535af5b2e" />

### 🖼️ Tạo cảnh quay
- Tạo ảnh đa góc nhìn kết hợp
- Tự động chuyển đổi mô tả cảnh thành prompt trực quan
<img width="1384" height="835" alt="8a5f019882995cd573b614d1e403ab3" src="https://github.com/user-attachments/assets/f301d91e-c826-499f-b3dd-79e69613a5e8" />

### 🎞️ Hệ thống phân cảnh chuyên nghiệp
- Thông số máy quay cấp điện ảnh (cỡ cảnh, góc máy, kiểu di chuyển)
- Tự động dàn trang và xuất bản
- Chuyển đổi phong cách hình ảnh một chạm (2D/3D/thực tế/stop-motion v.v.)
<img width="1602" height="835" alt="916ad7c32920260c7f3ac89fbeb8f30" src="https://github.com/user-attachments/assets/94562cee-3827-4645-82fe-2123fdd86897" />

### 🚀 Quy trình sản xuất hàng loạt
- **Toàn bộ quy trình một chạm**: Phân tích kịch bản → Tạo nhân vật/cảnh → Cắt phân cảnh → Tạo ảnh hàng loạt → Tạo video hàng loạt
- Hàng đợi đa nhiệm song song, tự động thử lại tác vụ thất bại
- Phù hợp cho sản xuất hàng loạt phim ngắn/anime

### 🤖 Điều phối AI đa nhà cung cấp
- Hỗ trợ nhiều nhà cung cấp dịch vụ tạo ảnh/video AI
- Cân bằng tải luân phiên API Key
- Quản lý hàng đợi tác vụ, tự động thử lại

### Tải về
Phiên bản chương trình đóng gói 0.1.7, tương ứng với mã nguồn mở
Liên kết: https://pan.baidu.com/s/1ImH6tOIiuFxIDXC0fC-6Lg Mã trích xuất: 8888


## Bắt đầu nhanh

### Yêu cầu môi trường

- **Node.js** >= 18
- **npm** >= 9

### Cài đặt và chạy

```bash
# Sao chép kho lưu trữ
git clone https://github.com/MemeCalculate/moyin-creator.git
cd moyin-creator

# Cài đặt phụ thuộc
npm install

# Khởi động chế độ phát triển
npm run dev
```

### Cấu hình API Key

Sau khi khởi động, vào **Cài đặt → Cấu hình API**, điền API Key của nhà cung cấp AI để bắt đầu sử dụng.

### Xây dựng

```bash
# Biên dịch + đóng gói trình cài đặt Windows
npm run build

# Chỉ biên dịch (không đóng gói)
npx electron-vite build
```

## Kiến trúc kỹ thuật

| Tầng | Công nghệ |
|------|-----------|
| Khung máy tính để bàn | Electron 30 |
| Khung giao diện | React 18 + TypeScript |
| Công cụ xây dựng | electron-vite (Vite 5) |
| Quản lý trạng thái | Zustand 5 |
| Thành phần UI | Radix UI + Tailwind CSS 4 |
| Lõi AI | `@opencut/ai-core` (biên dịch prompt, hồ sơ nhân vật, thăm dò tác vụ) |

### Cấu trúc dự án

```
moyin-creator/
├── electron/              # Tiến trình chính Electron + Preload
│   ├── main.ts            # Tiến trình chính (quản lý lưu trữ, hệ thống file, xử lý giao thức)
│   └── preload.ts         # Lớp cầu nối bảo mật
├── src/
│   ├── components/        # Thành phần UI React
│   │   ├── panels/        # Panel chính (kịch bản, nhân vật, cảnh, phân cảnh, đạo diễn)
│   │   └── ui/            # Thư viện thành phần UI cơ bản
│   ├── stores/            # Trạng thái toàn cục Zustand
│   ├── lib/               # Thư viện tiện ích (điều phối AI, quản lý ảnh, định tuyến)
│   ├── packages/          # Gói nội bộ
│   │   └── ai-core/       # Bộ máy lõi AI
│   └── types/             # Định nghĩa kiểu TypeScript
├── build/                 # Tài nguyên xây dựng (biểu tượng)
└── scripts/               # Script công cụ
```

## Giấy phép

Dự án này áp dụng mô hình **giấy phép kép**:

### Sử dụng mã nguồn mở — AGPL-3.0

Dự án này được mở mã nguồn theo giấy phép [GNU AGPL-3.0](LICENSE). Bạn có thể tự do sử dụng, chỉnh sửa và phân phối, nhưng mã đã chỉnh sửa phải được mở mã nguồn theo cùng giấy phép.

### Sử dụng thương mại

Nếu bạn cần sử dụng đóng nguồn hoặc tích hợp vào sản phẩm thương mại, vui lòng liên hệ chúng tôi để nhận [Giấy phép thương mại](COMMERCIAL_LICENSE.md).

## Đóng góp

Chào mừng đóng góp! Vui lòng đọc [Hướng dẫn đóng góp](CONTRIBUTING.md) để biết thêm chi tiết.

## Liên hệ

- 📧 Email: [memecalculate@gmail.com](mailto:memecalculate@gmail.com)
- 🐙 GitHub: [https://github.com/MemeCalculate/moyin-creator](https://github.com/MemeCalculate/moyin-creator)

### Liên hệ chúng tôi



<img src="https://github.com/user-attachments/assets/351713eb-79c7-4616-8416-397a9398e6e4" width="200" alt="Nhóm trao đổi" />

<img src="docs/images/wechat-contact.png" width="200" alt="Liên hệ WeChat" />


---

<p align="center">Made with ❤️ by <a href="https://github.com/MemeCalculate">MemeCalculate</a></p>

















