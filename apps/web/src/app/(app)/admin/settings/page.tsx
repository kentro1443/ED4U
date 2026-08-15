import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";

export default async function SettingsPage() {
  await requireRoute("/admin/settings");
  return (
    <div>
      <PageHeader
        title="Cài đặt hệ thống"
        description="Chỉ ADMIN_IT. Không lộ nội dung nghiệp vụ nhạy cảm."
      />
      <p className="text-sm">Giờ hoạt động mặc định 07:00–20:00, Thứ Hai–Thứ Sáu.</p>
    </div>
  );
}
