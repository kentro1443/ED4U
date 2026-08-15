import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function MentorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const profile = await db.mentorProfile.findFirst({ where: { id, tenantId: actor.tenantId } });
  if (!profile) return <p>Không tìm thấy mentor.</p>;
  return (
    <div>
      <PageHeader title={profile.headline} />
      <p>Khóa {profile.graduationYear}</p>
      <p>{profile.pricePerHour.toLocaleString("vi-VN")} đ/giờ</p>
    </div>
  );
}
