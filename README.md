# ED4U

Nền tảng vận hành trường học cho một trường (nhưng ranh giới tenant vẫn được giữ trong kiến
trúc): định danh và cấp tài khoản, thời khóa biểu, lịch hợp nhất, đơn từ học sinh, lịch hẹn giáo
viên, ghép mentor, lập kế hoạch phòng ốc, câu lạc bộ và sổ sách, diễn đàn, và sự kiện trường.

Nguyên tắc sản phẩm mà mọi thứ được xây dựng trên đó:

> **AI đề xuất → mã nguồn tất định kiểm chứng → con người phê duyệt → transaction thay đổi trạng
> thái.**

Một gợi ý không bao giờ là một chỗ đã đặt. Điểm xếp hạng không bao giờ là xác suất. Không có
fallback âm thầm giả vờ là kết quả thật — nếu dịch vụ trí tuệ không khả dụng, luồng thủ công vẫn
hoạt động và hệ thống nói rõ điều đó.

---

## Mục lục

- [Hai engine](#hai-engine)
- [Tính năng sản phẩm](#tính-năng-sản-phẩm)
- [Cài đặt cục bộ](#cài-đặt-cục-bộ)
- [Biến môi trường](#biến-môi-trường)
- [Các lệnh](#các-lệnh)
- [Tài khoản demo](#tài-khoản-demo)
- [Dữ liệu demo](#dữ-liệu-demo)
- [Kiến trúc](#kiến-trúc)
- [Cổng chất lượng](#cổng-chất-lượng)

---

## Hai engine

Cả hai engine đều là package TypeScript thuần, tất định, không chạm cơ sở dữ liệu, không gọi
mạng, không import framework. Chúng nhận vào một ảnh chụp trạng thái và trả ra kết quả đã xếp
hạng kèm giải thích. Đó là lý do chúng benchmark được, và là lý do tầng web vẫn giữ trọn trách
nhiệm phân quyền và lưu trữ.

### 1. Mentor Intelligence Engine — `packages/mentor-engine`

Ghép mục tiêu ngôn ngữ tự nhiên của học sinh với các mentor là cựu học sinh.

**Pipeline**

| Giai đoạn | Thư mục             | Nhiệm vụ                                                                                                                                          |
| --------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse     | `src/parsing`       | Ngôn ngữ tự nhiên → yêu cầu _ứng viên_. Che thông tin cá nhân trước khi bất kỳ parser từ xa nào nhìn thấy văn bản, và chạy dưới timeout cứng.     |
| Normalize | `src/normalization` | Giải nghĩa alias và ontology (`ielts writing` → `IELTS.WRITING`). Thứ gì không giải được sẽ báo là **mảnh chưa xử lý**, tuyệt đối không đoán bừa. |
| Filter    | `src/filtering`     | Ràng buộc cứng. Mentor vi phạm một ràng buộc là bị loại thẳng — không điểm xếp hạng nào mua lại được suất.                                        |
| Feature   | `src/features`      | Mỗi tín hiệu (độ khớp mục tiêu, chuyên môn, lịch rảnh, giá, chứng chỉ, kinh nghiệm, đánh giá) thành một giá trị có biên trong `[0, 1]`.           |
| Rank      | `src/ranking`       | Kết hợp có trọng số thành **match score**, với quy tắc phá hòa tất định.                                                                          |
| Explain   | `src/explanation`   | Lý do và đánh đổi cho từng mentor, bảng phân rã điểm, và báo cáo trung thực về độ phủ dữ liệu.                                                    |

**Những quyết định thiết kế quan trọng**

- **Ngữ nghĩa chứng chỉ ba trạng thái, giữ nguyên từ đầu đến cuối.** Với mỗi nhóm chứng chỉ:
  thiếu khóa = `UNKNOWN` (chưa ai kiểm tra), `null` = `KNOWN ABSENT` (đã kiểm tra, mentor không
  có), object = `KNOWN PRESENT`. Thiếu điểm IELTS **không phải** là điểm 0, và phần xếp hạng nói
  rõ điều đó.
- **Schema chuẩn tắc nghiêm ngặt.** Các trường chỉ dùng cho giao diện (`ratingCount`, `headline`,
  `graduationYear`) bị schema đầu vào của engine từ chối, nên dữ liệu trình bày không bao giờ rò
  rỉ vào chấm điểm.
- **Tất định.** Cùng một yêu cầu trên cùng một tập mentor luôn cho ra cùng một thứ hạng, kể cả
  thứ tự khi hòa điểm — được kiểm chứng trên toàn bộ benchmark, không phải khẳng định bằng tay.
- **Hình học Match Space là thật.** Học sinh nằm ở trung tâm và khoảng cách là hàm của match score
  **thật** từ một lần chạy đã lưu. Nó không được gọi là bản đồ embedding, bởi vì embedding không
  quyết định hình học ở đây. Tọa độ làm tròn sáu chữ số thập phân để số thực phía server và phía
  trình duyệt khớp nhau.

**Benchmark** (`npm run benchmark:mentor`, kết quả được commit vào `benchmark/reports/`)

| Chỉ số                     | Giá trị           |
| -------------------------- | ----------------- |
| Số yêu cầu × số mentor     | 1000 × 500        |
| Vi phạm ràng buộc cứng     | **0** (0%)        |
| Tỷ lệ tất định             | **100%**          |
| Tỷ lệ kết quả hợp lệ       | 100%              |
| Sự cố không bắt được       | 0                 |
| Độ trễ p50 / p95           | 0,29 ms / 0,40 ms |
| NDCG / Precision với người | `NOT_MEASURED`    |

`NOT_MEASURED` là cố ý và sẽ giữ nguyên cho tới khi có dữ liệu gán nhãn độ liên quan độc lập. Báo
một con số chất lượng-với-người mà dự án không bảo vệ được còn tệ hơn là không báo gì.

### 2. Facility Planning Intelligence Engine — `packages/facility-engine`

Lập kế hoạch phòng cho một sự kiện dựa trên trạng thái sống của trường.

- **Loại cứng trước** (`src/hard.ts`) — sức chứa, tính năng bắt buộc, loại phòng, giờ hoạt động
  (bao gồm cả đệm setup/dọn dẹp), và mọi dạng chiếm dụng: thời khóa biểu, booking đã xác nhận,
  lịch bảo trì, và các soft hold đang hiệu lực.
- **Rồi mới chấm điểm** (`src/score.ts`) — độ vừa sức chứa, độ khớp tính năng, ưu tiên tòa nhà và
  tầng.
- **Khung giờ linh hoạt** — yêu cầu chính xác cho ra một khung; yêu cầu linh hoạt dò ±2 giờ theo
  bước 30 phút, không bao giờ vượt ra ngoài giờ hoạt động của trường sau khi tính đệm.
- **Mỗi phương án đều mang theo lý do bị loại**, để giao diện giải thích được _vì sao_ một phòng
  bị loại thay vì đưa ra một danh sách không lời.

**Benchmark:** vi phạm ràng buộc cứng **0**, tỷ lệ khả thi **1,0**, chỉ số với người
`NOT_MEASURED`.

### Thuộc tính an toàn mà engine không thể tự bảo đảm

Một gợi ý không giữ chỗ gì cả. Chính luồng đặt chỗ mới làm nó an toàn:

- Một yêu cầu phòng đang chờ là **soft hold**, không phải chỗ đã đặt.
- Việc phê duyệt **kiểm tra lại trạng thái sống** — thế giới có thể đã đổi kể từ lúc gợi ý.
- Transaction xác nhận **tuần tự hóa theo phòng** (advisory lock của PostgreSQL), nên hai lượt
  phê duyệt đồng thời cho cùng một khung giờ không thể cùng thành công. Điều này được chứng minh
  bằng một integration test dùng hai kết nối PostgreSQL thật.
- Một booking đã xác nhận **không bao giờ** bị tự động đẩy ra bởi một yêu cầu ưu tiên cao hơn đến
  sau.

Booking mentor dùng đúng hình mẫu đó: advisory lock trên `(tenant, mentor)`, kiểm tra lại điều
kiện và giá của mentor ngay trong transaction, rồi mới ghi.

---

## Tính năng sản phẩm

**Ghép mentor** — tìm kiếm bằng ngôn ngữ tự nhiên với bước xác nhận rõ ràng của con người về các
ràng buộc đã phân tích trước khi engine chạy; luồng khám phá thủ công qua URL làm phương án dự
phòng; ảnh chụp `MentorMatchRequest` / `MentorRecommendationRun` bất biến đã lưu; Match Space chỉ
chủ sở hữu xem được, kèm lý do, đánh đổi và bảng phân rã điểm thật; đặt buổi học cụ thể có kiểm
tra lại trạng thái sống.

**Lịch** — Ngày / Tuần / Tháng theo giờ địa phương của trường. Thời khóa biểu **không** được sao
chép thành bản ghi lịch; lịch là một _phép chiếu_ trên các buổi học theo thời khóa biểu, sự kiện
trường và câu lạc bộ, lịch hẹn đã chấp nhận, booking mentor và booking phòng đã xác nhận. Trên di
động là dạng agenda chứ không bóp méo lưới desktop.

**Phòng ốc** — phân tích yêu cầu bằng ngôn ngữ tự nhiên với ràng buộc đã xác nhận, adapter cơ sở
dữ liệu bao gồm chiếm dụng theo thời khóa biểu / booking đã xác nhận / bảo trì / soft hold đang
hiệu lực, học sinh tạo yêu cầu soft hold, quản trị viên phê duyệt trong transaction, luồng yêu cầu
chỉnh sửa và từ chối, và trang `/rooms/schedule` tách bạch chiếm dụng cứng với rủi ro soft hold.

**Điều phối giáo viên** — tất định, và cố ý **không** gắn nhãn là AI engine. Nó giải yêu cầu của
học sinh theo ba tín hiệu, mạnh trước:

1. **Tên** — "em muốn gặp thầy Nguyễn Văn Bình", "Cô Lan", hoặc mã thành viên như `GV000013`.
   Không phân biệt dấu, hiểu được kính ngữ.
2. **Môn học** — "môn Hóa" trả về giáo viên Hóa, không phải bất kỳ ai đang giữ nhiệm vụ chung
   `ACADEMIC`. Cố ý dè dặt: `văn`, `lý`, `anh` đứng một mình **không** được coi là tên môn, vì
   chúng là thành phần tên người thường xuyên hơn nhiều.
3. **Trách nhiệm** — mục đích đã phân loại (giấy tờ, sức khỏe tinh thần, học bổng, câu lạc bộ,
   nghề nghiệp, học tập).

Những ai còn lại sẽ được xếp hạng theo khối lượng công việc thật (đơn và lịch hẹn đang mở). Một
yêu cầu mơ hồ sẽ ở trạng thái `UNRESOLVED` thay vì bịa ra một danh mục.

**Đơn từ và lịch hẹn** — nộp PDF có phiên bản, giáo viên review và chuyển tiếp đều được phân quyền
phía server; lịch hẹn hỗ trợ gửi yêu cầu → chấp nhận / đổi giờ / từ chối, và chat riêng chỉ mở sau
khi đã chấp nhận.

**Câu lạc bộ** — đề xuất và phê duyệt của quản trị, quản trị thành viên theo cấp bậc
`PRESIDENT > VP > CORE > MEMBER`, bối cảnh giáo viên cố vấn, tài liệu, và sự kiện gắn phòng dùng
lại Facility Engine thay vì đẻ ra engine thứ hai. Tài chính chỉ là ghi sổ, không giữ tiền: bút
toán đã duyệt là **bất biến**, và sửa sai là VOID cộng một bút toán điều chỉnh.

**Diễn đàn** — tên thật, chủ đề, trả lời, LIKE/HELPFUL (không có downvote), báo cáo và kiểm duyệt
bởi con người.

**Sự kiện trường** — phạm vi SCHOOL / GRADE / CLASS với chuyển đổi múi giờ trường tường minh;
người xem chỉ nhận được sự kiện trong phạm vi hiển thị của mình.

**Bảo mật và vận hành** — phân quyền phía server theo từng permission cụ thể (không có
`requireAdmin()` chung chung), một bản đồ route→permission duy nhất dùng chung cho hiển thị giao
diện và guard phía server, chặn đăng nhập dồn dập có lưu trong cơ sở dữ liệu, session cookie
HTTP-only `SameSite=Lax`, security header và CSP nền tảng, cùng `/api/health/live` và
`/api/health/ready`.

---

## Cài đặt cục bộ

**Yêu cầu:** Node ≥ 20 (repo đang phát triển trên 24), Docker (cho PostgreSQL 17), npm.

```bash
git clone <repo> && cd ED4U
cp .env.example .env          # rồi sửa SESSION_SECRET
npm install
npm run services:up           # PostgreSQL 17 trong Docker tại localhost:5434
npm run db:migrate:deploy     # áp dụng migration
npm run db:seed               # dữ liệu demo tất định
npm run dev
```

Mở <http://127.0.0.1:3000> và đăng nhập bằng một mã ở phần [Tài khoản demo](#tài-khoản-demo).

> **Lưu ý về cổng.** Playwright chạy ứng dụng trên cổng **3020** với `reuseExistingServer: false`.
> Next 16 từ chối chạy `next dev` lần thứ hai trong cùng thư mục bất kể cổng nào, nên hãy tắt mọi
> dev server thủ công trước khi chạy E2E hoặc `npm run verify`.

Để xóa sạch và dựng lại mọi thứ một cách tất định — kể cả sau khi đã đổi mật khẩu bằng tay:

```bash
npm run db:demo:reset         # XÓA CƠ SỞ DỮ LIỆU, migrate lại, seed lại
```

---

## Biến môi trường

Sao chép `.env.example` thành `.env`. Không có gì ở đây là secret thật; và đừng bao giờ commit một
secret thật.

| Biến                        | Bắt buộc | Mặc định                                           | Mục đích                                                                                                                                              |
| --------------------------- | -------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | có       | `postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u` | Kết nối PostgreSQL. Cổng 5434 để tránh ứng dụng cũ không liên quan đang chiếm 5432/3000.                                                              |
| `SESSION_SECRET`            | có       | giá trị tạm cho dev                                | Khóa ký session cookie. **Bắt buộc** ≥ 32 byte ngẫu nhiên thật khi ra khỏi môi trường phát triển.                                                     |
| `NODE_ENV`                  | không    | `development`                                      | Bật cờ `Secure` cho session cookie ở production.                                                                                                      |
| `DEMO_SKIP_PASSWORD_CHANGE` | không    | `false`                                            | **Chỉ dùng khi phát triển.** Khi `true`, tài khoản seed bỏ qua bước bắt buộc đổi mật khẩu lần đầu. Bộ E2E cũng dùng cờ này để không làm đổi mật khẩu. |
| `DEMO_MENTOR_WAITLIST`      | không    | `true`                                             | **Chỉ dùng để demo.** Khi bật, một booking mentor không hoàn tất được sẽ hiện với học sinh là "đã vào danh sách chờ, mentor đã được thông báo".       |
| `GEMINI_API_KEY`            | không    | —                                                  | LLM tùy chọn để phân tích yêu cầu mentor bằng ngôn ngữ tự nhiên. Đọc từ `apps/web/.env.local`.                                                        |
| `GEMINI_MODEL`              | không    | mặc định có sẵn                                    | Ghi đè model id của Gemini.                                                                                                                           |
| `OPENAI_API_KEY`            | không    | —                                                  | LLM tùy chọn để phân tích yêu cầu phòng bằng ngôn ngữ tự nhiên.                                                                                       |

**Các khóa LLM thực sự là tùy chọn.** Khi không đặt khóa nào, parser tất định và các form nhập
ràng buộc thủ công đều hoạt động, và ứng dụng nói rõ là parser không khả dụng thay vì âm thầm thay
bằng một kết quả giả.

### `DEMO_MENTOR_WAITLIST`

Đây là một **tiện ích tạm thời phục vụ demo**, có cờ riêng để gỡ bỏ sạch sẽ. Khi một booking thất
bại vì bất kỳ lý do gì, học sinh thấy hộp thoại danh sách chờ thay vì lỗi, còn mentor nhận được
một thông báo `MENTOR_WAITLIST_INTEREST` thật và đọc được sau khi đăng nhập.

Nó làm mềm những gì **học sinh** nhìn thấy; nó không làm mềm những gì cơ sở dữ liệu ghi lại:

- Không có bản ghi `MentorBooking` nào được tạo. Không có gì bị giữ chỗ.
- `AuditEvent` ghi `booked: false` cùng lý do thất bại **thật**.
- Nếu ngay cả tín hiệu quan tâm đó cũng không ghi được (mentor không tồn tại, mất kết nối cơ sở dữ
  liệu), lỗi thật sẽ được hiển thị — giao diện không bao giờ tuyên bố mentor đã được thông báo
  trong khi không có ai được thông báo cả.

Đặt `DEMO_MENTOR_WAITLIST=false` để quay lại báo lỗi bình thường. Cài đặt nằm ở
`apps/web/src/lib/mentor/waitlist.ts`.

---

## Các lệnh

| Lệnh                                    | Tác dụng                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                           | Next dev server trên cổng 3000.                                                                                                                  |
| `npm run build`                         | Build production cho mọi workspace.                                                                                                              |
| `npm run start`                         | Chạy bản build production.                                                                                                                       |
| `npm run verify`                        | **Cổng chất lượng.** Format, lint, typecheck, Prisma validate, unit test, integration test với DB thật, benchmark đầy đủ, build production, E2E. |
| `npm run format` / `format:write`       | Prettier kiểm tra / ghi.                                                                                                                         |
| `npm run lint`                          | ESLint trên các workspace.                                                                                                                       |
| `npm run typecheck`                     | `tsc --noEmit` trên các workspace.                                                                                                               |
| `npm run test:unit`                     | Chỉ unit test.                                                                                                                                   |
| `npm run test:integration`              | Integration test với PostgreSQL thật.                                                                                                            |
| `npm run test:e2e` (trong `apps/web`)   | Playwright, chạy trên cổng 3020.                                                                                                                 |
| `npm run services:up` / `services:down` | Bật / tắt PostgreSQL trong Docker.                                                                                                               |
| `npm run db:migrate:deploy`             | Áp dụng các migration đã commit.                                                                                                                 |
| `npm run db:seed`                       | Seed dữ liệu demo (upsert, chạy lại được nhiều lần).                                                                                             |
| `npm run db:demo:reset`                 | **Phá hủy dữ liệu.** Xóa, migrate lại và seed lại.                                                                                               |
| `npm run db:studio`                     | Prisma Studio.                                                                                                                                   |
| `npm run benchmark:mentor`              | Benchmark mentor đầy đủ 1000×500, ghi vào `benchmark/reports/`.                                                                                  |
| `npm run benchmark:facility`            | Benchmark facility đầy đủ.                                                                                                                       |

> **Bẫy benchmark.** Các biến thể `:smoke` ghi đè báo cáo đã commit bằng một khối lượng bị cắt
> ngắn, khiến lần `verify` sau đó thất bại. Luôn chạy bộ đầy đủ. Báo cáo có nhúng commit git, độ
> trễ của máy và phiên bản Node, nên chúng luôn bị "bẩn" sau khi chạy — đó là bình thường, vì test
> kiểm tra kích thước khối lượng chứ không kiểm tra thời gian.

> **Bẫy migration.** `prisma migrate dev` có thể từ chối các thay đổi có cảnh báo khi chạy không
> tương tác. Hãy sinh SQL để review bằng `prisma migrate diff` rồi áp dụng bằng `migrate deploy`.

---

## Tài khoản demo

Tên đăng nhập là `school_member_code` bất biến. Mọi tài khoản seed dùng chung một mật khẩu tạm:

```text
TempPass1!
```

| Vai trò        | Mã         | Tên                 |
| -------------- | ---------- | ------------------- |
| ADMIN_IT       | `IT000001` | Nguyễn Hữu Tín      |
| SCHOOL_ADMIN   | `AD000001` | Lê Thanh Minh       |
| TEACHER        | `GV000001` | Cô Lan (Tiếng Anh)  |
| STUDENT        | `HS000001` | Nguyễn An           |
| GRADUATED      | `HS990001` | Trần Tuấn Kiệt      |
| CLUB PRESIDENT | `HS000010` | Phạm Ngọc Quỳnh Anh |
| MENTOR         | `HS990002` | Nguyễn Thu Hà       |

**Cả 24 giáo viên (`GV000001`–`GV000024`) và cả 24 mentor (`HS990002`–`HS990025`) đều là tài khoản
đăng nhập thật.** Điều này quan trọng khi demo thông báo: sau khi một học sinh đặt lịch hoặc vào
danh sách chờ của một mentor cụ thể, bạn có thể đăng nhập đúng mentor đó và đọc tin ở
`/notifications`. Mỗi lần chạy, seed đều in ra toàn bộ danh sách kèm tên.

`ADMIN_IT` và `SCHOOL_ADMIN` là hai vai trò thực sự khác nhau với quyền hạn khác nhau — ADMIN_IT
phụ trách cấp tài khoản, vai trò, cấu hình hệ thống và nhật ký; SCHOOL_ADMIN phụ trách thời khóa
biểu, phòng, phê duyệt, kiểm duyệt và vận hành câu lạc bộ. Hai vai trò chỉ cố ý trùng nhau ở
`audit.read`.

Lần đăng nhập đầu tiên **bắt buộc đổi mật khẩu**. Để bỏ qua bước đó khi demo:

```bash
DEMO_SKIP_PASSWORD_CHANGE=true npm run dev
```

Đừng bao giờ commit mật khẩu đã đổi bằng tay ở máy cục bộ; hãy chạy `npm run db:demo:reset` để
khôi phục đúng bảng ở trên.

---

## Dữ liệu demo

`prisma/seed.ts` là tất định — mọi id, tên và ngày sinh đều được suy ra từ một chuỗi seed, nên chạy
lại không bao giờ xáo trộn lại ngôi trường.

- **1 tenant**, múi giờ `Asia/Ho_Chi_Minh`, năm học 2026–2027, Học kỳ 1.
- **12 lớp** (10A1–12A4), **6 môn**, **8 tiết** (P1–P5 buổi sáng, P6–P8 buổi chiều).
- **24 giáo viên**, mỗi người phụ trách đúng một môn, có trách nhiệm và giờ tư vấn công bố.
- **~150 học sinh và cựu học sinh** với tên tiếng Việt thật, giới tính và ngày sinh.
- **24 mentor** trải trên IELTS / SAT / HSK, cố ý khác biệt theo mọi trục mà engine cân nhắc — bao
  gồm cả ba trạng thái hiểu biết về chứng chỉ, để chính bản demo cũng kiểm chứng cách engine xử lý
  dữ liệu thiếu.
- **24 phòng** với tính năng thực tế theo từng loại phòng và thiết bị khan hiếm, cùng trạng thái
  vận hành sống: một booking đã xác nhận, một lịch bảo trì và một soft hold đang hiệu lực.

**Thời khóa biểu tuần** gồm 300 bản ghi, được dựng sao cho bốn bất biến sau đúng _theo cấu trúc_,
và seed sẽ kiểm chứng lại trước khi kết thúc:

- một giáo viên chỉ dạy đúng môn của mình;
- không giáo viên nào ở hai lớp trong cùng một thứ + tiết;
- không phòng nào chứa hai lớp trong cùng một thứ + tiết;
- mỗi lớp học đủ sáu môn mỗi tuần, và không môn nào lặp lại hai lần trong một ngày.

Các lớp ở cố định một phòng chủ nhiệm còn giáo viên di chuyển giữa các lớp — vừa đúng cách các
trường THPT Việt Nam vận hành, vừa là điều khiến xung đột phòng trở thành bất khả thi. Các tiết
học chỉ diễn ra buổi sáng để Facility Engine có sức chứa buổi chiều liền mạch thật sự mà lập kế
hoạch: một ngôi trường trên danh nghĩa kín lịch cả ngày sẽ biến mọi gợi ý phòng thành một lời từ
chối.

---

## Kiến trúc

```
apps/web                  Ứng dụng Next.js 16: route, server action, phân quyền, truy cập Prisma
packages/mentor-engine    Engine ghép mentor thuần + benchmark 1000×500
packages/facility-engine  Engine lập kế hoạch phòng thuần + benchmark
packages/domain           Quy tắc miền dùng chung: permission, vai trò, tư cách thành viên, mẫu khung giờ
packages/ui               Các primitive thiết kế dùng chung
packages/config           Cấu hình công cụ dùng chung
prisma/                   schema.prisma, migrations, seed.ts
benchmark/reports/        Kết quả benchmark đã commit
docs/                     AUDIT.md, PRODUCTION_READINESS.md
```

**Định danh.** `User.id` là UUID ngẫu nhiên bất biến; `school_member_code` là tên đăng nhập bất
biến và cũng là định danh nghiệp vụ. V1 không có đăng nhập bằng email — quản trị viên cấp tài
khoản với mật khẩu tạm và lần đăng nhập đầu tiên bắt buộc đổi. Học sinh đã tốt nghiệp giữ lại lịch
sử, được đọc diễn đàn, không thể hành động như học sinh đang học, và có thể đăng ký làm mentor.
`TEACHER + SCHOOL_ADMIN` được phép; `TEACHER + MENTOR` và `học sinh đang học + MENTOR` thì không.

**Thời gian.** Timestamp trong cơ sở dữ liệu là thời điểm thật. Thời khóa biểu và giờ hoạt động là
giờ dân dụng **địa phương của trường**, được chuyển đổi tường minh qua `tenant.timezone`. Không
bao giờ phụ thuộc vào múi giờ cục bộ của server, và không bao giờ "sửa" logic UTC bằng cách đổi
hàm truy cập UTC thành hàm giờ địa phương.

**Phân quyền.** Kiểm tra phía server theo từng permission cụ thể trong
`apps/web/src/lib/authz.ts`. Mọi mutation nhạy cảm còn kiểm tra thêm tenant cùng quyền sở hữu /
quan hệ / người được giao. Việc hiển thị trên thanh điều hướng không phải là phân quyền.
`apps/web/src/lib/routePermissions.ts` là bản đồ route→permission duy nhất, dùng chung cho giao
diện và guard phía server.

**Đánh đổi đã biết.** `forbidden()` của Next 16 trả về đúng mã 403, nhưng ranh giới
`authInterrupts` của nó không hiển thị được trong ứng dụng này, nên hiện tại các trường hợp từ
chối sẽ chuyển hướng sang `/403`. Thuộc tính bảo mật vẫn y hệt — trang bị bảo vệ không bao giờ
được chạy.

**Tài liệu.** `CLAUDE.md` là hợp đồng vận hành và trạng thái dự án đã kiểm chứng. `PLAN.md` là tài
liệu tham chiếu yêu cầu, **không phải** sự thật về hiện trạng cài đặt. `DESIGN.md` là ngôn ngữ
thiết kế thị giác. `docs/PRODUCTION_READINESS.md` là nguồn sự thật về những gì đã làm so với những
gì thuộc về môi trường triển khai.

---

## Cổng chất lượng

```bash
npm run verify
```

Chạy format, lint, typecheck, Prisma validate, unit test, integration test với PostgreSQL thật,
benchmark **đầy đủ**, build production, và Playwright E2E trên các vai trò STUDENT / TEACHER /
SCHOOL_ADMIN / ADMIN_IT / MENTOR.

Những quy tắc luôn đúng bất kể deadline:

- Không bao giờ làm yếu một test để cho phần cài đặt đi qua.
- "Integration" nghĩa là có một ranh giới cơ sở dữ liệu hoặc dịch vụ thật.
- Một tính năng hoàn thành khi **luồng người dùng** đi trọn, không phải khi route tồn tại.

### Chưa sẵn sàng cho production

Đây là một sản phẩm hoàn chỉnh ở mức hackathon, không phải một hệ thống doanh nghiệp đã triển
khai. Đừng mô tả một bản demo trên laptop là đã sẵn sàng cho production. Những việc còn lại, được
theo dõi trong `docs/PRODUCTION_READINESS.md`: PostgreSQL có quản lý với TLS/pooling/PITR và một
lần diễn tập khôi phục thật; lưu trữ đối tượng riêng tư có quét mã độc cho tệp tải lên; log tập
trung, metric, trace, SLO và cảnh báo; quản lý secret và biên chỉ dùng TLS kèm WAF; transactional
outbox khi việc bảo đảm gửi thông báo trở thành cam kết hợp đồng; quản trị quyền riêng tư cho trẻ
vị thành niên và chính sách lưu trữ; ngữ cảnh tenant hoạt động tường minh trước khi cho phép một
tài khoản thuộc nhiều trường; và kỷ luật phát hành staging/production bao gồm diễn tập migration
và kiểm thử tải.

---

## Thương hiệu

Tên sản phẩm là **ED4U**. 
