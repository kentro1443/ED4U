import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export default async function MentorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  if (!actor) return null;
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
