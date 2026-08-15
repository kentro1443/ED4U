import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export default async function AdminRoomsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const [types, features, rooms] = await Promise.all([
    db.roomType.findMany({ where: { tenantId: actor.tenantId } }),
    db.roomFeatureDefinition.findMany({ where: { tenantId: actor.tenantId } }),
    db.room.findMany({ where: { tenantId: actor.tenantId }, include: { roomType: true } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Phòng & tiện ích"
        description="Tiện ích là định nghĩa cấu hình, không phải một cột / feature."
      />
      <p className="text-sm">
        {types.length} loại · {features.length} tiện ích · {rooms.length} phòng
      </p>
    </div>
  );
}
