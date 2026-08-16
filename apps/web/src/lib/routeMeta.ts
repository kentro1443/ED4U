/**
 * Human names for routes.
 *
 * One map serves three jobs that must never disagree: the browser tab title,
 * the breadcrumb trail, and the label a search result carries. Keeping them in
 * one place is why a page cannot end up called "Nhật ký" in the sidebar and
 * something else in the tab.
 */

export interface RouteMeta {
  title: string;
  /** Section the route belongs to, shown as the first breadcrumb. */
  section?: string;
  description?: string;
}

export const ROUTE_META: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Tổng quan",
    description: "Bảng điều khiển hoạt động theo vai trò.",
  },
  "/calendar": {
    title: "Lịch",
    section: "Vận hành",
    description: "Lịch thống nhất theo múi giờ trường.",
  },
  "/applications": { title: "Đơn từ", section: "Vận hành" },
  "/appointments": { title: "Lịch hẹn", section: "Vận hành" },
  "/rooms": { title: "Phòng", section: "Vận hành" },
  "/rooms/schedule": { title: "Lịch phòng", section: "Vận hành" },
  "/events": { title: "Sự kiện trường", section: "Vận hành" },
  "/clubs": { title: "Câu lạc bộ", section: "Vận hành" },
  "/mentor": { title: "Mentor", section: "Học tập & hỗ trợ" },
  "/mentor/match-space": { title: "Match Space", section: "Học tập & hỗ trợ" },
  "/discussion": { title: "Diễn đàn", section: "Cộng đồng" },
  "/discussion/forums": { title: "Chuyên mục", section: "Cộng đồng" },
  "/discussion/threads": { title: "Chủ đề", section: "Cộng đồng" },
  "/notifications": { title: "Thông báo", section: "Công cụ" },
  "/search": { title: "Tìm kiếm", section: "Công cụ" },
  "/manual": {
    title: "Hướng dẫn sử dụng",
    section: "Công cụ",
    description: "Hướng dẫn đầy đủ các quy trình và vai trò trên ED4U.",
  },
  "/profile": { title: "Hồ sơ", section: "Tài khoản" },
  "/security": { title: "Bảo mật", section: "Tài khoản" },
  "/admin/members": { title: "Thành viên", section: "Quản trị" },
  "/admin/timetable": { title: "Thời khóa biểu", section: "Quản trị" },
  "/admin/rooms": { title: "Phòng & tiện ích", section: "Quản trị" },
  "/admin/approvals": { title: "Trung tâm phê duyệt", section: "Quản trị" },
  "/admin/moderation": { title: "Kiểm duyệt diễn đàn", section: "Quản trị" },
  "/admin/audit": { title: "Nhật ký hệ thống", section: "Quản trị" },
  "/admin/settings": { title: "Cài đặt hệ thống", section: "Quản trị" },
};

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Breadcrumb trail for a pathname. Detail routes (`/clubs/<id>`) fall back to
 * their parent plus a neutral "Chi tiết" leaf rather than printing the id — an
 * identifier in a breadcrumb tells the reader nothing and looks unfinished.
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const exact = ROUTE_META[pathname];
  if (exact) {
    return exact.section
      ? [{ label: exact.section }, { label: exact.title }]
      : [{ label: exact.title }];
  }

  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const parentPath = `/${segments.slice(0, i).join("/")}`;
    const parent = ROUTE_META[parentPath];
    if (parent) {
      const crumbs: Crumb[] = [];
      if (parent.section) crumbs.push({ label: parent.section });
      crumbs.push({ label: parent.title, href: parentPath });
      crumbs.push({ label: "Chi tiết" });
      return crumbs;
    }
  }
  return [];
}

/** Page title for `<title>`, without the app suffix Next appends. */
export function titleFor(pathname: string): string | null {
  return ROUTE_META[pathname]?.title ?? null;
}
