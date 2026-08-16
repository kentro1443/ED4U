import type { Metadata } from "next";
import Link from "next/link";
import { currentActor } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { LandingMotion } from "@/components/LandingMotion";
import { Icons, type IconType } from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Hybrid Neuro-Symbolic Intelligence cho vận hành trường học",
  description:
    "ED4U tích hợp AI với Hybrid Neuro-Symbolic Intelligence để ghép nối cố vấn, tối ưu phòng học và hỗ trợ quyết định có thể kiểm chứng.",
};

const OPERATIONS = [
  {
    icon: "calendar" as IconType,
    title: "Lịch thống nhất",
    description:
      "Thời khóa biểu, lịch hẹn, sự kiện và phòng học cùng xuất hiện theo giờ của trường.",
  },
  {
    icon: "rooms" as IconType,
    title: "Phòng và tiện ích",
    description: "Đề xuất dựa trên sức chứa, thiết bị và trạng thái trực tiếp trước khi phê duyệt.",
  },
  {
    icon: "applications" as IconType,
    title: "Hồ sơ học sinh",
    description: "Đơn PDF có phiên bản, chuyển giáo viên phụ trách và lịch sử xử lý rõ ràng.",
  },
  {
    icon: "clubs" as IconType,
    title: "Cộng đồng nhà trường",
    description: "Câu lạc bộ, sự kiện, diễn đàn và kiểm duyệt trong cùng một cấu trúc quản trị.",
  },
];

const BENEFITS = [
  {
    title: "Ít phân mảnh hơn",
    description:
      "Người dùng không phải ghép thông tin từ nhiều bảng tính, nhóm chat và công cụ rời rạc để hiểu việc đang xảy ra.",
  },
  {
    title: "Quyết định có thể giải thích",
    description:
      "Mỗi đề xuất thông minh đi kèm ràng buộc, lý do, đánh đổi và dữ liệu còn thiếu—không chỉ một con số.",
  },
  {
    title: "Đúng người, đúng quyền",
    description:
      "Học sinh, giáo viên, cố vấn, quản trị trường và quản trị hệ thống có không gian và quyền hạn riêng.",
  },
  {
    title: "Theo dõi được toàn bộ hành trình",
    description:
      "Trạng thái, phê duyệt, phiên bản và nhật ký giúp nhà trường biết ai đã làm gì và bước tiếp theo là gì.",
  },
];

const TECHNOLOGY_FEATURES = [
  {
    icon: "search" as IconType,
    title: "AI hiểu nhu cầu tự nhiên",
    description:
      "Diễn giải mục tiêu học tập hoặc yêu cầu phòng từ ngôn ngữ đời thường thành dữ liệu có cấu trúc để người dùng xác nhận.",
  },
  {
    icon: "adminSettings" as IconType,
    title: "Symbolic Constraint Engine",
    description:
      "Mã hóa sức chứa, thiết bị, thời gian, chuyên môn, ngân sách và điều kiện bắt buộc thành ràng buộc có thể kiểm chứng.",
  },
  {
    icon: "matchSpace" as IconType,
    title: "Xếp hạng đa tiêu chí",
    description:
      "So sánh các phương án hợp lệ trên nhiều tín hiệu, trong khi ràng buộc cứng không bao giờ bị điểm số cao bù trừ.",
  },
  {
    icon: "info" as IconType,
    title: "Explainable by design",
    description:
      "Mỗi kết quả trình bày lý do phù hợp, đánh đổi, dữ liệu còn thiếu và nguyên nhân một phương án bị loại.",
  },
  {
    icon: "calendar" as IconType,
    title: "Live-state validation",
    description:
      "Trước khi đặt lịch hoặc duyệt phòng, hệ thống truy vấn lại lịch rảnh, thời khóa biểu, giữ chỗ và trạng thái mới nhất.",
  },
  {
    icon: "security" as IconType,
    title: "Human-governed execution",
    description:
      "AI tạo đề xuất; phần mềm kiểm tra; người có thẩm quyền phê duyệt; giao dịch mới được phép thay đổi trạng thái.",
  },
] as const;

const ROLES = [
  ["Học sinh", "Lịch học, cố vấn, đơn từ, phòng, câu lạc bộ và thảo luận."],
  ["Giáo viên", "Đơn được phân công, lịch hẹn, thời khóa biểu và hỗ trợ học sinh."],
  ["Cố vấn", "Hồ sơ chuyên môn, lịch rảnh và các phiên ghép nối phù hợp."],
  ["Quản trị trường", "Phòng, phê duyệt, sự kiện, kiểm duyệt và vận hành học vụ."],
  ["Quản trị hệ thống", "Tài khoản, nhập dữ liệu, cấu hình, bảo mật và nhật ký."],
] as const;

export default async function LandingPage() {
  const actor = await currentActor();
  const appHref = actor ? "/dashboard" : "/login";
  const appLabel = actor ? "Mở không gian ED4U" : "Đăng nhập";

  return (
    <div data-landing className="min-h-dvh overflow-hidden bg-white text-[var(--ink)]">
      <LandingMotion />
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between rounded-2xl border border-white/70 bg-white/90 px-4 shadow-[0_16px_48px_-28px_rgba(15,23,42,.38)] backdrop-blur-xl sm:px-5">
          <BrandLogo href="/" className="w-[7.5rem] sm:w-[8.5rem]" priority />
          <nav
            aria-label="Điều hướng trang giới thiệu"
            className="hidden items-center gap-1 md:flex"
          >
            <LandingNavLink href="#tinh-nang">Nền tảng</LandingNavLink>
            <LandingNavLink href="#tri-tue">Công nghệ lõi</LandingNavLink>
            <LandingNavLink href="#loi-ich">Lợi ích</LandingNavLink>
            <LandingNavLink href="#vai-tro">Vai trò</LandingNavLink>
          </nav>
          <Link
            href={appHref}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-xs font-bold text-white shadow-[var(--shadow-brand)] transition-[transform,background-color] hover:-translate-y-px hover:bg-[var(--primary-hover)] active:translate-y-0 sm:text-sm"
          >
            {appLabel}
            <Icons.arrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative isolate px-4 pb-20 pt-32 sm:px-6 sm:pb-28 sm:pt-40 lg:pb-36">
          <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_15%_10%,rgba(37,99,235,.15),transparent_26%),radial-gradient(circle_at_85%_30%,rgba(96,165,250,.16),transparent_30%),linear-gradient(#fff,#f8fafc)]" />
          <div className="absolute inset-x-0 top-0 -z-10 h-[38rem] opacity-[0.35] [background-image:linear-gradient(rgba(148,163,184,.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.14)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(32rem,.9fr)] lg:gap-16">
            <div data-reveal="left" className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--brand-100)] bg-white/85 px-3 py-2 text-xs font-bold text-[var(--primary)] shadow-[var(--shadow-sm)]">
                <span className="h-2 w-2 rounded-full bg-[var(--brand-600)] shadow-[0_0_0_5px_var(--brand-50)]" />
                Hybrid Neuro-Symbolic Intelligence for Education
              </div>
              <h1 className="mt-7 text-balance text-4xl font-extrabold leading-[1.08] tracking-[-0.055em] text-[var(--ink)] sm:text-6xl lg:text-[4.25rem]">
                AI hiểu nhu cầu. Logic kiểm chứng quyết định.
              </h1>
              <p className="mt-7 max-w-2xl text-pretty text-base leading-8 text-[var(--body)] sm:text-lg">
                ED4U tích hợp AI với{" "}
                <strong className="font-extrabold text-[var(--ink)]">
                  Hybrid Neuro-Symbolic Intelligence
                </strong>{" "}
                để ghép nối đúng cố vấn và tối ưu đúng phòng học—vừa hiểu ngôn ngữ tự nhiên, vừa
                tuân thủ ràng buộc cứng, vừa giải thích được vì sao một phương án được đề xuất.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={appHref}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition-[transform,background-color] hover:-translate-y-px hover:bg-[var(--primary-hover)] active:translate-y-0"
                >
                  {actor ? "Tiếp tục vào ED4U" : "Đăng nhập vào trường"}
                  <Icons.arrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#tinh-nang"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--hairline)] bg-white px-6 text-sm font-bold text-[var(--ink)] shadow-[var(--shadow-sm)] transition-[transform,border-color,background-color] hover:-translate-y-px hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)] active:translate-y-0"
                >
                  Khám phá nền tảng
                </a>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[var(--muted)] sm:text-sm">
                <TrustPoint>AI + logic biểu tượng</TrustPoint>
                <TrustPoint>Kết quả có thể giải thích</TrustPoint>
                <TrustPoint>Con người giữ quyền quyết định</TrustPoint>
              </div>
            </div>

            <ProductPreview />
          </div>
        </section>

        <section
          id="tinh-nang"
          className="scroll-mt-28 border-y border-[var(--hairline)] bg-[var(--canvas)] px-4 py-20 sm:px-6 sm:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <SectionLead
              eyebrow="Một nền tảng vận hành"
              title="Thông tin đi cùng công việc, từ đầu đến cuối."
              description="ED4U không gom các đường dẫn vào một dashboard. Nền tảng nối dữ liệu, trạng thái và trách nhiệm thành quy trình mà từng vai trò có thể thực hiện."
            />

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-[1.15fr_.85fr]">
              <article
                data-reveal="left"
                className="rounded-[32px] bg-[var(--surface-dark)] p-7 text-white shadow-[var(--shadow-lg)] sm:p-10 md:row-span-2"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-300/20">
                  <Icons.dashboard className="h-6 w-6" />
                </div>
                <h3 className="mt-8 max-w-md text-2xl font-extrabold tracking-[-0.035em] text-white sm:text-3xl">
                  Mỗi vai trò nhìn thấy đúng việc cần làm.
                </h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                  Tổng quan thay đổi theo học sinh, giáo viên, cố vấn và quản trị. Việc chờ xử lý,
                  lịch sắp tới và thông báo quan trọng xuất hiện trước nội dung tham khảo.
                </p>
                <div className="mt-10 grid gap-3 sm:grid-cols-2">
                  {[
                    "Thông báo theo người nhận",
                    "Tìm kiếm trong phạm vi quyền",
                    "Trạng thái rõ bước tiếp theo",
                    "Lịch sử thay đổi có thể truy vết",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] p-3 text-xs font-semibold text-slate-100 ring-1 ring-inset ring-white/10"
                    >
                      <Icons.check className="h-4 w-4 shrink-0 text-blue-300" />
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              {OPERATIONS.map((item) => {
                const Icon = Icons[item.icon];
                return (
                  <article
                    key={item.title}
                    data-reveal
                    className="rounded-[28px] border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--brand-100)] hover:shadow-[var(--shadow-md)] sm:p-7"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-extrabold tracking-[-0.025em] text-[var(--ink)]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="tri-tue" className="scroll-mt-28 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <SectionLead
              eyebrow="Công nghệ lõi của ED4U"
              title="Hybrid Neuro-Symbolic Intelligence"
              description="ED4U kết hợp khả năng diễn giải ý định của AI với sức mạnh kiểm chứng của logic biểu tượng. Cùng một kiến trúc lõi giúp Mentor Matching và Room Optimization tạo ra kết quả phù hợp, minh bạch và an toàn để đưa vào vận hành thực tế."
            />

            <div
              data-reveal
              className="mt-12 overflow-hidden rounded-[32px] bg-[var(--surface-dark)] p-6 text-white shadow-[var(--shadow-lg)] sm:p-8 lg:p-10"
            >
              <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
                <div>
                  <TechnologyConstellation />
                  <span className="inline-flex rounded-xl bg-blue-500/15 px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-blue-200 ring-1 ring-inset ring-blue-300/20">
                    Neural understanding × Symbolic reasoning
                  </span>
                  <h3 className="mt-6 text-balance text-2xl font-extrabold tracking-[-0.04em] text-white sm:text-4xl">
                    Hiểu điều người dùng muốn. Bảo đảm điều hệ thống làm là hợp lệ.
                  </h3>
                  <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                    Lớp AI chuyển lời mô tả thành ý định và tiêu chí. Lớp symbolic reasoning áp dụng
                    quy tắc miền, loại mọi phương án vi phạm và tạo lời giải thích có thể kiểm tra.
                    Con người xác nhận trước khi bất kỳ giao dịch nào diễn ra.
                  </p>
                </div>
                <TechnologyPipeline />
              </div>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <IntelligenceCard
                number="01"
                icon="mentor"
                title="AI Mentor Matching"
                description="Hiểu mục tiêu học tập, chuyển thành ràng buộc có thể xác nhận, xếp hạng cố vấn bằng dữ liệu thật và giải thích lý do phù hợp, đánh đổi cùng độ phủ dữ liệu."
                items={[
                  "Yêu cầu bằng ngôn ngữ tự nhiên",
                  "Ràng buộc cứng không bị điểm số bù trừ",
                  "Lần đề xuất được lưu để xem lại",
                  "Đặt một phiên cụ thể trên trạng thái trực tiếp",
                ]}
              />
              <IntelligenceCard
                number="02"
                icon="rooms"
                title="AI Room Optimization"
                description="Tối ưu phòng theo thời gian, sức chứa, thiết bị và lịch sử dụng thực. Yêu cầu chờ chỉ là giữ chỗ mềm; phê duyệt luôn kiểm tra lại trạng thái trực tiếp."
                items={[
                  "Lịch học và đặt phòng trong cùng ngữ cảnh",
                  "Giải thích phòng bị loại hoặc xếp hạng",
                  "Phân biệt giữ chỗ mềm và lịch đã xác nhận",
                  "Giao dịch phê duyệt ngăn xung đột",
                ]}
              />
            </div>

            <div className="mt-16">
              <div className="max-w-2xl">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                  Năng lực công nghệ đột phá
                </p>
                <h3 className="mt-4 text-balance text-2xl font-extrabold tracking-[-0.04em] text-[var(--ink)] sm:text-4xl">
                  Không chỉ tạo câu trả lời—tạo quyết định có căn cứ.
                </h3>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {TECHNOLOGY_FEATURES.map((feature, index) => {
                  const Icon = Icons[feature.icon];
                  return (
                    <article
                      key={feature.title}
                      data-reveal
                      style={{ "--reveal-delay": `${(index % 3) * 70}ms` } as React.CSSProperties}
                      className="rounded-[24px] border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--brand-100)] hover:shadow-[var(--shadow-md)]"
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h4 className="mt-5 text-base font-extrabold tracking-[-0.025em] text-[var(--ink)]">
                        {feature.title}
                      </h4>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {feature.description}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 rounded-[28px] border border-[var(--hairline)] bg-[var(--canvas)] p-5 sm:p-7">
              <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Nguyên tắc xuyên suốt ED4U
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                {[
                  ["01", "AI đề xuất"],
                  ["02", "Mã xác thực"],
                  ["03", "Con người phê duyệt"],
                  ["04", "Giao dịch thay đổi trạng thái"],
                ].map(([number, label], index) => (
                  <div
                    key={label}
                    className="relative flex items-center gap-3 rounded-2xl bg-white p-4 shadow-[var(--shadow-sm)]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-50)] text-xs font-extrabold text-[var(--primary)]">
                      {number}
                    </span>
                    <span className="text-xs font-bold leading-5 text-[var(--body)]">{label}</span>
                    {index < 3 && (
                      <Icons.chevronRight className="absolute -right-2.5 hidden h-5 w-5 text-[var(--brand-100)] sm:block" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          id="loi-ich"
          className="scroll-mt-28 bg-[var(--surface-dark)] px-4 py-20 text-white sm:px-6 sm:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 lg:grid-cols-[.75fr_1.25fr] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-300">
                  Điều nổi bật đem lại
                </p>
                <h2 className="mt-5 text-balance text-3xl font-extrabold tracking-[-0.045em] text-white sm:text-5xl">
                  Công việc nhẹ hơn vì hệ thống giữ được ngữ cảnh.
                </h2>
                <p className="mt-5 text-sm leading-7 text-slate-300 sm:text-base">
                  Giá trị không nằm ở số màn hình. Giá trị nằm ở việc mỗi người hiểu tình trạng,
                  trách nhiệm và bước tiếp theo mà không cần hỏi lại từ đầu.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {BENEFITS.map((benefit, index) => (
                  <article
                    key={benefit.title}
                    data-reveal
                    style={{ "--reveal-delay": `${(index % 2) * 70}ms` } as React.CSSProperties}
                    className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 backdrop-blur-sm sm:p-7"
                  >
                    <span className="text-xs font-extrabold tabular-nums text-blue-300">
                      0{index + 1}
                    </span>
                    <h3 className="mt-8 text-xl font-extrabold tracking-[-0.03em] text-white">
                      {benefit.title}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{benefit.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="vai-tro" className="scroll-mt-28 px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <SectionLead
              eyebrow="Một trường học, nhiều trách nhiệm"
              title="Mỗi vai trò có một trải nghiệm phù hợp."
              description="Navigation, dữ liệu và hành động được điều chỉnh theo quyền ở cả giao diện lẫn máy chủ. Việc một mục bị ẩn không bao giờ được xem là cơ chế bảo mật duy nhất."
            />
            <div className="mt-12 overflow-hidden rounded-[32px] border border-[var(--hairline)] bg-white shadow-[var(--shadow-md)]">
              {ROLES.map(([name, description], index) => (
                <div
                  key={name}
                  data-reveal
                  style={{ "--reveal-delay": `${(index % 3) * 60}ms` } as React.CSSProperties}
                  className="grid gap-3 border-b border-[var(--hairline-soft)] p-5 last:border-b-0 sm:grid-cols-[12rem_1fr] sm:items-center sm:p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-50)] text-xs font-extrabold tabular-nums text-[var(--primary)]">
                      0{index + 1}
                    </span>
                    <h3 className="text-sm font-extrabold text-[var(--ink)]">{name}</h3>
                  </div>
                  <p className="text-sm leading-6 text-[var(--muted)]">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 sm:pb-28">
          <div
            data-reveal
            className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] bg-[var(--primary)] px-6 py-12 text-white shadow-[0_30px_90px_-40px_rgba(23,73,200,.8)] sm:px-10 sm:py-16 lg:px-16"
          >
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-400/25 blur-3xl" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-100">
                  Sẵn sàng vào ED4U
                </p>
                <h2 className="mt-4 max-w-3xl text-balance text-3xl font-extrabold tracking-[-0.045em] text-white sm:text-5xl">
                  Bắt đầu từ công việc nhà trường đang cần giải quyết.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100 sm:text-base">
                  Đăng nhập bằng mã thành viên do trường cấp. Sau khi vào hệ thống, Trung tâm hướng
                  dẫn sẽ giải thích từng quy trình theo đúng vai trò của bạn.
                </p>
              </div>
              <Link
                href={appHref}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-extrabold text-[var(--primary)] shadow-xl transition-transform hover:-translate-y-px active:translate-y-0"
              >
                {appLabel}
                <Icons.arrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] bg-[var(--canvas)] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo className="w-28" />
          <nav
            className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[var(--muted)]"
            aria-label="Liên kết cuối trang"
          >
            <a href="#tinh-nang" className="hover:text-[var(--ink)]">
              Nền tảng
            </a>
            <a href="#tri-tue" className="hover:text-[var(--ink)]">
              Công nghệ lõi
            </a>
            <a href="#loi-ich" className="hover:text-[var(--ink)]">
              Lợi ích
            </a>
            <Link href={appHref} className="text-[var(--primary)] hover:underline">
              {appLabel}
            </Link>
          </nav>
          <p className="text-xs text-[var(--muted)]">ED4U · Nền tảng vận hành trường học</p>
        </div>
      </footer>
    </div>
  );
}

function LandingNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-xl px-3 py-2 text-xs font-bold text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
    >
      {children}
    </a>
  );
}

function TrustPoint({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icons.check className="h-4 w-4 text-[var(--primary)]" aria-hidden="true" />
      {children}
    </span>
  );
}

function SectionLead({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div data-reveal className="max-w-3xl">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
        {eyebrow}
      </p>
      <h2 className="mt-4 text-balance text-3xl font-extrabold tracking-[-0.045em] text-[var(--ink)] sm:text-5xl">
        {title}
      </h2>
      <p className="mt-5 text-pretty text-sm leading-7 text-[var(--muted)] sm:text-base">
        {description}
      </p>
    </div>
  );
}

function ProductPreview() {
  return (
    <div data-reveal="right" className="relative mx-auto w-full max-w-xl lg:mx-0">
      <div
        data-parallax="0.34"
        className="absolute -inset-8 -z-10 rounded-full bg-blue-400/25 blur-3xl"
      />
      <div className="rounded-[32px] border border-white/90 bg-white/90 p-2.5 shadow-[0_38px_90px_-34px_rgba(30,64,175,.42)] backdrop-blur-xl sm:p-3">
        <div className="rounded-[24px] border border-[var(--hairline)] bg-[var(--canvas)] p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-soft)] pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Bản xem trước minh họa
              </p>
              <p className="mt-1 text-sm font-extrabold text-[var(--ink)]">
                Không gian làm việc giáo viên
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden rounded-lg bg-[var(--brand-50)] px-2 py-1 text-[9px] font-bold text-[var(--primary)] sm:inline-flex">
                Thứ Hai · 08:00
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)] text-white shadow-[var(--shadow-brand)]">
                <Icons.dashboard className="h-4 w-4" />
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <PreviewMetric icon="clubs" value="04" label="Lớp phụ trách" />
            <PreviewMetric icon="notifications" value="07" label="Việc cần xử lý" accent />
            <PreviewMetric icon="appointments" value="05" label="Lịch hẹn tuần" />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-2xl border border-[var(--hairline)] bg-white p-3.5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--primary)]">
                    <Icons.calendar className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-extrabold text-[var(--ink)]">Lịch hôm nay</p>
                    <p className="text-[9px] text-[var(--muted)]">Lịch dạy và hẹn hỗ trợ</p>
                  </div>
                </div>
                <span className="text-[9px] font-bold text-[var(--primary)]">Xem lịch</span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1">
                {["T2", "T3", "T4", "T5", "T6"].map((day, index) => (
                  <div
                    key={day}
                    className={`rounded-lg px-1 py-1.5 text-center ${index === 0 ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-soft)] text-[var(--muted)]"}`}
                  >
                    <p className="text-[8px] font-bold">{day}</p>
                    <p className="mt-0.5 text-[9px] font-extrabold">{18 + index}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                <PreviewSchedule time="08:00" title="Toán 11A1" detail="Phòng B.204" />
                <PreviewSchedule time="10:30" title="Hẹn hỗ trợ học sinh" detail="Trực tuyến" />
                <PreviewSchedule time="14:00" title="Duyệt đơn được giao" detail="03 hồ sơ" />
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--surface-dark)] p-3.5 text-white shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-extrabold text-white">Thông báo ưu tiên</p>
                  <p className="mt-0.5 text-[9px] text-slate-400">Theo vai trò và thời hạn</p>
                </div>
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200">
                  <Icons.notifications className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-3 space-y-2">
                <PreviewNotice title="Đơn mới cần xem" detail="2 phút trước" tone="blue" />
                <PreviewNotice title="Lịch hẹn đã xác nhận" detail="10:30 hôm nay" tone="green" />
                <PreviewNotice title="Thay đổi phòng học" detail="Lớp 11A1 · B.204" tone="amber" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-[var(--brand-100)] bg-[var(--brand-50)] p-3 text-[var(--primary)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-[var(--shadow-sm)]">
              <Icons.aiBrain className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold">Hybrid Intelligence đang hỗ trợ</p>
              <p className="mt-0.5 truncate text-[9px] text-blue-700/70">
                Ưu tiên công việc và giải thích đề xuất theo dữ liệu trực tiếp.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({
  icon,
  value,
  label,
  accent = false,
}: {
  icon: IconType;
  value: string;
  label: string;
  accent?: boolean;
}) {
  const Icon = Icons[icon];
  return (
    <div
      className={`rounded-2xl border p-2.5 shadow-[var(--shadow-sm)] ${accent ? "border-[var(--brand-100)] bg-[var(--brand-50)]" : "border-[var(--hairline)] bg-white"}`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="text-lg font-extrabold tabular-nums tracking-[-0.04em] text-[var(--ink)]">
          {value}
        </p>
        <Icon
          className={`h-3.5 w-3.5 ${accent ? "text-[var(--primary)]" : "text-[var(--muted)]"}`}
        />
      </div>
      <p className="mt-1 text-[8px] font-semibold leading-3 text-[var(--muted)]">{label}</p>
    </div>
  );
}

function PreviewSchedule({ time, title, detail }: { time: string; title: string; detail: string }) {
  return (
    <div className="grid grid-cols-[2.4rem_1fr] items-start gap-2">
      <span className="pt-0.5 text-[8px] font-extrabold tabular-nums text-[var(--primary)]">
        {time}
      </span>
      <div className="border-l-2 border-[var(--brand-100)] pl-2">
        <p className="text-[9px] font-extrabold leading-3 text-[var(--ink)]">{title}</p>
        <p className="mt-0.5 text-[8px] text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

function PreviewNotice({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: "blue" | "green" | "amber";
}) {
  const dotClass = {
    blue: "bg-blue-400",
    green: "bg-emerald-400",
    amber: "bg-amber-400",
  }[tone];

  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-white/[0.06] p-2.5 ring-1 ring-inset ring-white/10">
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      <div className="min-w-0">
        <p className="truncate text-[9px] font-bold text-slate-100">{title}</p>
        <p className="mt-0.5 text-[8px] text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

function TechnologyPipeline() {
  const steps = [
    {
      label: "Hiểu ý định",
      detail: "Ngôn ngữ tự nhiên → mục tiêu có cấu trúc",
      icon: "search" as IconType,
    },
    {
      label: "Suy luận biểu tượng",
      detail: "Ràng buộc cứng → tập phương án hợp lệ",
      icon: "adminSettings" as IconType,
    },
    {
      label: "Tối ưu & giải thích",
      detail: "Xếp hạng → lý do, đánh đổi, độ phủ",
      icon: "matchSpace" as IconType,
    },
  ];

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4 sm:p-5">
      <div className="space-y-3">
        {steps.map((step, index) => {
          const Icon = Icons[step.icon];
          return (
            <div
              key={step.label}
              className="relative flex gap-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200 ring-1 ring-inset ring-blue-300/20">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold tabular-nums text-blue-300">
                    0{index + 1}
                  </span>
                  <p className="text-sm font-extrabold text-white">{step.label}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{step.detail}</p>
              </div>
              {index < steps.length - 1 && (
                <span className="absolute -bottom-3 left-[2.1rem] z-10 h-3 w-px bg-blue-300/30" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-blue-500/15 p-4 ring-1 ring-inset ring-blue-300/20">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-400/20 text-blue-100">
          <Icons.security className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-extrabold text-white">Human authorization layer</p>
          <p className="mt-1 text-[11px] leading-4 text-blue-100/70">
            Người có thẩm quyền xác nhận trước khi giao dịch thay đổi trạng thái.
          </p>
        </div>
      </div>
    </div>
  );
}

function TechnologyConstellation() {
  return (
    <div data-parallax="0.45" aria-hidden="true" className="relative mb-7 h-24 max-w-sm sm:h-28">
      <svg
        viewBox="0 0 360 112"
        className="absolute inset-0 h-full w-full text-blue-300/30"
        fill="none"
      >
        <path d="M70 27 L178 57 L295 22 M178 57 L302 91 M178 57 L52 94" stroke="currentColor" />
        <circle cx="70" cy="27" r="3" fill="currentColor" />
        <circle cx="295" cy="22" r="3" fill="currentColor" />
        <circle cx="302" cy="91" r="3" fill="currentColor" />
        <circle cx="52" cy="94" r="3" fill="currentColor" />
      </svg>
      <span className="absolute left-[42%] top-[20%] flex h-16 w-16 items-center justify-center rounded-[22px] bg-blue-500 text-white shadow-[0_18px_40px_-15px_rgba(59,130,246,.9)] ring-1 ring-inset ring-white/20">
        <Icons.aiBrain className="h-8 w-8" />
      </span>
      <TechOrbitIcon className="left-[9%] top-1" icon="cpu" />
      <TechOrbitIcon className="right-[9%] top-0" icon="network" />
      <TechOrbitIcon className="bottom-0 left-[4%]" icon="workflow" />
      <TechOrbitIcon className="bottom-0 right-[5%]" icon="sparkles" />
    </div>
  );
}

function TechOrbitIcon({ icon, className }: { icon: IconType; className: string }) {
  const Icon = Icons[icon];
  return (
    <span
      className={`absolute flex h-10 w-10 items-center justify-center rounded-2xl bg-white/[0.07] text-blue-200 ring-1 ring-inset ring-white/10 ${className}`}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

function IntelligenceCard({
  number,
  icon,
  title,
  description,
  items,
}: {
  number: string;
  icon: IconType;
  title: string;
  description: string;
  items: readonly string[];
}) {
  const Icon = Icons[icon];
  return (
    <article
      data-reveal
      className="group rounded-[32px] border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-300 hover:border-[var(--brand-100)] hover:shadow-[var(--shadow-md)] sm:p-8"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-sm font-extrabold tabular-nums text-[var(--brand-100)]">
          {number}
        </span>
      </div>
      <h3 className="mt-7 text-2xl font-extrabold tracking-[-0.035em] text-[var(--ink)]">
        {title}
      </h3>
      <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{description}</p>
      <ul className="mt-7 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-6 text-[var(--body)]">
            <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-50)] text-[var(--primary)]">
              <Icons.check className="h-3 w-3" />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
