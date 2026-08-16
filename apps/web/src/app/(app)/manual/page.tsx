import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ManualGuide } from "./ManualGuide";

export const metadata: Metadata = {
  title: "Hướng dẫn sử dụng",
  description: "Hướng dẫn sử dụng đầy đủ cho học sinh, giáo viên, cố vấn và quản trị viên ED4U.",
};

export default function ManualPage() {
  return (
    <div>
      <PageHeader
        title="Hướng dẫn sử dụng ED4U"
        description="Tìm nhanh quy trình theo vai trò, xem từng bước thực hiện và hiểu trạng thái của hệ thống."
      />
      <ManualGuide />
    </div>
  );
}
