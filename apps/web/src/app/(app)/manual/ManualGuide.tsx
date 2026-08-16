"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/icons";

type ManualEntry = {
  title: string;
  summary: string;
  steps: readonly string[];
  note?: string;
};

type ManualSection = {
  id: string;
  title: string;
  description: string;
  roles: readonly string[];
  entries: readonly ManualEntry[];
};

const SECTIONS: readonly ManualSection[] = [
  {
    id: "bat-dau",
    title: "Bắt đầu và tài khoản",
    description: "Đăng nhập an toàn, hiểu vai trò và quản lý thông tin cá nhân.",
    roles: ["Mọi vai trò"],
    entries: [
      {
        title: "Đăng nhập lần đầu",
        summary: "Sử dụng mã thành viên và mật khẩu tạm thời do nhà trường cấp.",
        steps: [
          "Mở trang Đăng nhập và nhập đúng mã thành viên trường.",
          "Nhập mật khẩu tạm thời; nút sẽ hiển thị trạng thái đang xác thực.",
          "Đặt mật khẩu mới khi hệ thống yêu cầu, sau đó tiếp tục vào Tổng quan.",
        ],
        note: "Không chia sẻ mật khẩu. Nếu mất quyền truy cập, liên hệ ADMIN_IT của trường.",
      },
      {
        title: "Hồ sơ và bảo mật",
        summary: "Kiểm tra thông tin cá nhân, vai trò và các phiên đăng nhập đang hoạt động.",
        steps: [
          "Mở Hồ sơ để xem mã thành viên, lớp, trạng thái và quyền hiện tại.",
          "Mở Bảo mật để đổi mật khẩu hoặc xem các phiên đăng nhập.",
          "Thu hồi phiên lạ; hệ thống không cho thu hồi chính phiên đang sử dụng.",
        ],
      },
    ],
  },
  {
    id: "tong-quan",
    title: "Tổng quan, tìm kiếm và thông báo",
    description: "Nắm việc cần làm trước, sau đó đi thẳng đến dữ liệu liên quan.",
    roles: ["Mọi vai trò"],
    entries: [
      {
        title: "Đọc bảng Tổng quan",
        summary: "Nội dung thay đổi theo vai trò và chỉ hiển thị công việc liên quan đến bạn.",
        steps: [
          "Xem dải chỉ số đầu trang để nhận biết lịch, đơn, thông báo hoặc phê duyệt đang chờ.",
          "Chọn một chỉ số để mở đúng màn hình chi tiết.",
          "Dùng các khối bên dưới để xem việc sắp tới và hành động ưu tiên.",
        ],
      },
      {
        title: "Tìm kiếm và thông báo",
        summary: "Tìm phòng, lớp, câu lạc bộ, chủ đề và theo dõi thay đổi quan trọng.",
        steps: [
          "Nhập từ khóa ở thanh tìm kiếm trên cùng hoặc mở trang Tìm kiếm.",
          "Chọn kết quả để đi đến bản ghi gốc; quyền truy cập vẫn được kiểm tra ở máy chủ.",
          "Mở Thông báo, đánh dấu từng mục hoặc tất cả là đã đọc.",
        ],
      },
    ],
  },
  {
    id: "lich",
    title: "Lịch và thời khóa biểu",
    description: "Một lịch thống nhất cho học tập, sự kiện, lịch hẹn và đặt phòng.",
    roles: ["Học sinh", "Giáo viên", "Quản trị"],
    entries: [
      {
        title: "Xem lịch ngày, tuần, tháng",
        summary: "Tất cả thời gian được hiển thị theo múi giờ của nhà trường.",
        steps: [
          "Mở Lịch và chọn chế độ Ngày, Tuần hoặc Tháng.",
          "Dùng nút trước/sau hoặc Hôm nay để đổi khoảng thời gian.",
          "Chọn một mục để xem loại, thời gian, địa điểm và nguồn dữ liệu.",
        ],
      },
      {
        title: "Quản lý thời khóa biểu",
        summary: "SCHOOL_ADMIN chỉnh sửa; ADMIN_IT nhập dữ liệu học kỳ từ tệp.",
        steps: [
          "Kiểm tra môn, lớp, giáo viên, tiết và phòng trước khi lưu.",
          "Khi nhập CSV, tải đúng mẫu và xử lý toàn bộ lỗi được liệt kê.",
          "Xác nhận lịch sau khi lưu bằng chế độ tuần và Lịch phòng.",
        ],
        note: "Nhập thời khóa biểu và chỉnh sửa thời khóa biểu là hai quyền riêng biệt.",
      },
    ],
  },
  {
    id: "mentor",
    title: "Cố vấn và Không gian ghép nối",
    description:
      "Biến mục tiêu học tập thành đề xuất có ràng buộc, bằng chứng và quyền quyết định.",
    roles: ["Học sinh", "Cố vấn"],
    entries: [
      {
        title: "Tìm cố vấn phù hợp",
        summary: "Mô tả mục tiêu bằng ngôn ngữ tự nhiên rồi xác nhận các ràng buộc đã trích xuất.",
        steps: [
          "Nêu mục tiêu, môn/chuyên môn, lịch rảnh, hình thức và ngân sách nếu có.",
          "Kiểm tra từng điều kiện; sửa lại trước khi yêu cầu hệ thống xếp hạng.",
          "So sánh lý do phù hợp, đánh đổi, độ phủ dữ liệu và điểm thành phần.",
          "Chọn cố vấn và một phiên còn trống để gửi yêu cầu đặt lịch.",
        ],
        note: "Điểm ghép nối là điểm xếp hạng, không phải xác suất thành công.",
      },
      {
        title: "Đọc Không gian ghép nối",
        summary: "Khoảng cách đến học sinh phản ánh điểm ghép nối thực của cùng một lần chạy.",
        steps: [
          "Mở một lần đề xuất đã lưu để giữ nguyên dữ liệu và lý do tại thời điểm chạy.",
          "Chọn từng nút cố vấn để xem bằng chứng và ràng buộc.",
          "Dùng danh sách/bảng thay thế nếu không muốn xem sơ đồ.",
        ],
      },
    ],
  },
  {
    id: "ho-tro-hoc-sinh",
    title: "Đơn từ và lịch hẹn",
    description: "Gửi hồ sơ đúng phiên bản và trao đổi riêng tư với giáo viên phụ trách.",
    roles: ["Học sinh", "Giáo viên"],
    entries: [
      {
        title: "Nộp và theo dõi đơn",
        summary: "Mỗi lần nộp tạo một phiên bản PDF có lịch sử rõ ràng.",
        steps: [
          "Chọn loại đơn, tải tệp PDF đúng mẫu và kiểm tra nội dung trước khi gửi.",
          "Theo dõi trạng thái Đã gửi, Đang xem xét, Được duyệt hoặc Từ chối.",
          "Nếu giáo viên yêu cầu sửa, tạo phiên bản mới thay vì thay đổi bản đã nộp.",
        ],
      },
      {
        title: "Đặt lịch với giáo viên",
        summary: "Học sinh đề nghị; giáo viên chấp nhận, đổi lịch hoặc từ chối.",
        steps: [
          "Chọn giáo viên, nêu mục đích và đề xuất các khung giờ phù hợp.",
          "Theo dõi phản hồi; kiểm tra thời gian mới trước khi chấp nhận đổi lịch.",
          "Sau khi lịch được chấp nhận, dùng vùng trao đổi riêng trong lịch hẹn.",
        ],
      },
    ],
  },
  {
    id: "phong",
    title: "Phòng và tiện ích",
    description: "Tìm phòng phù hợp, gửi giữ chỗ mềm và chờ phê duyệt trên trạng thái trực tiếp.",
    roles: ["Học sinh", "SCHOOL_ADMIN"],
    entries: [
      {
        title: "Yêu cầu sử dụng phòng",
        summary: "Đề xuất của hệ thống không đồng nghĩa với đã đặt phòng.",
        steps: [
          "Mô tả ngày, giờ, sức chứa, thiết bị và mục đích sử dụng.",
          "Xác nhận ràng buộc trước khi xem danh sách phòng được xếp hạng.",
          "Chọn một phòng để tạo yêu cầu; yêu cầu chỉ là giữ chỗ mềm khi đang chờ.",
          "Theo dõi phê duyệt, yêu cầu chỉnh sửa, từ chối hoặc hủy trong trang Phòng học.",
        ],
      },
      {
        title: "Phê duyệt phòng",
        summary: "Trạng thái trực tiếp được kiểm tra lại trong giao dịch trước khi xác nhận.",
        steps: [
          "Mở Trung tâm phê duyệt và xem mục đích, mức ưu tiên, thời gian, thiết bị.",
          "Kiểm tra Lịch phòng để phân biệt lịch cứng và rủi ro giữ chỗ mềm.",
          "Phê duyệt, yêu cầu chỉnh sửa hoặc từ chối kèm lý do rõ ràng.",
        ],
        note: "Phòng đã được xác nhận không tự động bị thay thế bởi yêu cầu đến sau.",
      },
    ],
  },
  {
    id: "cong-dong",
    title: "Câu lạc bộ, sự kiện và diễn đàn",
    description: "Cộng tác có quản trị, vai trò rõ ràng và kiểm duyệt bởi con người.",
    roles: ["Học sinh", "Giáo viên", "SCHOOL_ADMIN"],
    entries: [
      {
        title: "Vận hành câu lạc bộ",
        summary: "Theo dõi thành viên, tài liệu, sự kiện và sổ thu chi trong cùng một không gian.",
        steps: [
          "Gửi đề xuất thành lập; SCHOOL_ADMIN xem xét và phê duyệt.",
          "Chủ nhiệm phân vai PRESIDENT, VP, CORE và MEMBER theo đúng thẩm quyền.",
          "Tạo sự kiện qua quy trình Phòng; ghi sổ thu chi và gửi phê duyệt.",
          "Nếu cần sửa khoản đã duyệt, tạo bút toán VOID và bút toán điều chỉnh.",
        ],
      },
      {
        title: "Thảo luận an toàn",
        summary: "Dùng tên thật, phản hồi hữu ích và báo cáo nội dung cần xem xét.",
        steps: [
          "Chọn chuyên mục, tạo chủ đề với tiêu đề mô tả đúng vấn đề.",
          "Trả lời, đánh dấu Thích/Hữu ích khi nội dung có giá trị.",
          "Báo cáo nội dung vi phạm; SCHOOL_ADMIN quyết định sau khi xem ngữ cảnh.",
        ],
      },
    ],
  },
  {
    id: "quan-tri",
    title: "Quản trị nhà trường",
    description: "Phân quyền riêng cho vận hành trường và quản trị hệ thống.",
    roles: ["SCHOOL_ADMIN", "ADMIN_IT"],
    entries: [
      {
        title: "SCHOOL_ADMIN",
        summary: "Điều hành thời khóa biểu, phòng, phê duyệt, sự kiện và kiểm duyệt.",
        steps: [
          "Xử lý công việc đang chờ từ Tổng quan và Trung tâm phê duyệt.",
          "Quản lý phòng, tiện ích, giờ hoạt động và lịch bảo trì liên quan.",
          "Kiểm tra diễn đàn, câu lạc bộ và sự kiện theo quy trình của trường.",
          "Dùng Nhật ký hệ thống để truy vết thay đổi nhạy cảm.",
        ],
      },
      {
        title: "ADMIN_IT",
        summary: "Cấp tài khoản, nhập dữ liệu, đặt lại mật khẩu và quản lý cấu hình hệ thống.",
        steps: [
          "Tạo hoặc nhập thành viên với mã định danh bất biến và đúng vai trò.",
          "Đặt lại mật khẩu tạm thời khi được yêu cầu; người dùng phải đổi ở lần đăng nhập sau.",
          "Nhập thời khóa biểu theo mẫu và xử lý lỗi xác thực trước khi áp dụng.",
          "Theo dõi sức khỏe vận hành và Nhật ký hệ thống.",
        ],
        note: "ADMIN_IT và SCHOOL_ADMIN không thay thế cho nhau; quyền chỉ giao nhau khi có chủ ý.",
      },
    ],
  },
];

const ROLE_FILTERS = ["Tất cả", "Học sinh", "Giáo viên", "Cố vấn", "SCHOOL_ADMIN", "ADMIN_IT"];

export function ManualGuide() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("Tất cả");
  const normalized = query.trim().toLocaleLowerCase("vi");

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => {
          const roleMatches =
            role === "Tất cả" ||
            section.roles.includes("Mọi vai trò") ||
            section.roles.includes(role);
          const text =
            `${section.title} ${section.description} ${entry.title} ${entry.summary} ${entry.steps.join(" ")} ${entry.note ?? ""}`.toLocaleLowerCase(
              "vi",
            );
          return roleMatches && (!normalized || text.includes(normalized));
        }),
      })).filter((section) => section.entries.length > 0),
    [normalized, role],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[var(--brand-100)] bg-[linear-gradient(135deg,var(--brand-50),white_65%)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge tone="brand">Trung tâm trợ giúp</Badge>
            <h2 className="mt-4 text-xl font-extrabold tracking-[-0.03em] text-[var(--ink)] sm:text-2xl">
              Bạn muốn thực hiện công việc nào?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Tìm theo tên tính năng, hành động hoặc trạng thái. Nội dung chỉ mô tả quy trình thực
              sự có trong ED4U.
            </p>
          </div>
          <label className="relative block w-full lg:max-w-md">
            <span className="sr-only">Tìm trong hướng dẫn</span>
            <Icons.search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ví dụ: đặt phòng, đổi mật khẩu…"
              className="h-12 w-full rounded-2xl border border-[var(--hairline)] bg-white pl-12 pr-4 text-sm text-[var(--ink)] shadow-[var(--shadow-sm)] placeholder:text-[var(--muted)] focus:border-[var(--brand-600)] focus:outline-none focus:ring-4 focus:ring-blue-500/10"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Lọc theo vai trò">
          {ROLE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRole(item)}
              aria-pressed={role === item}
              className={`min-h-9 cursor-pointer rounded-xl border px-3 text-xs font-semibold transition-colors ${
                role === item
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--hairline)] bg-white text-[var(--body)] hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="sticky top-24 hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-sm)] lg:block">
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Trong hướng dẫn
          </p>
          <nav aria-label="Mục lục hướng dẫn" className="space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block rounded-xl px-3 py-2 text-xs font-semibold leading-5 text-[var(--body)] transition-colors hover:bg-[var(--brand-50)] hover:text-[var(--primary)]"
              >
                {section.title}
              </a>
            ))}
          </nav>
        </aside>

        <div className="space-y-6" aria-live="polite">
          {sections.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--hairline)] bg-white px-6 py-16 text-center">
              <Icons.help className="mx-auto h-8 w-8 text-[var(--muted)]" />
              <h2 className="mt-4 text-base font-bold text-[var(--ink)]">
                Chưa tìm thấy hướng dẫn
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Thử từ khóa ngắn hơn hoặc chọn “Tất cả” vai trò.
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)] sm:p-7"
              >
                <div className="border-b border-[var(--hairline-soft)] pb-5">
                  <h2 className="text-xl font-extrabold tracking-[-0.03em] text-[var(--ink)]">
                    {section.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
                    {section.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {section.roles.map((item) => (
                      <Badge key={item} tone="neutral" size="sm">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="divide-y divide-[var(--hairline-soft)]">
                  {section.entries.map((entry) => (
                    <article key={entry.title} className="py-6 last:pb-0">
                      <h3 className="text-base font-bold text-[var(--ink)]">{entry.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">
                        {entry.summary}
                      </p>
                      <ol className="mt-4 space-y-3">
                        {entry.steps.map((step, index) => (
                          <li
                            key={step}
                            className="flex gap-3 text-sm leading-6 text-[var(--body)]"
                          >
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[11px] font-bold tabular-nums text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
                              {index + 1}
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                      {entry.note && (
                        <div className="mt-4 flex gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 text-xs leading-5 text-[var(--body)]">
                          <Icons.info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                          <p>{entry.note}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-[24px] bg-[var(--surface-dark)] p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="text-lg font-bold text-white">Vẫn cần hỗ trợ?</h2>
          <p className="mt-1 text-sm leading-6 text-slate-300">
            Liên hệ quản trị viên trường và mô tả màn hình, thời điểm cùng thao tác đã thực hiện.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[var(--ink)] transition-transform hover:-translate-y-px active:translate-y-0"
        >
          Về Tổng quan
          <Icons.arrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}
