import { PageHeader } from "@/components/PageHeader";

export default function SecurityPage() {
  return (
    <div>
      <PageHeader
        title="Bảo mật"
        description="Quên mật khẩu: liên hệ ADMIN_IT. Không khôi phục qua email ở V1."
      />
      <a href="/change-password" className="text-sm underline">
        Đổi mật khẩu
      </a>
    </div>
  );
}
