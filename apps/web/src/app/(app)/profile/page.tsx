import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function ProfilePage() {
  const actor = await requireActor();
  return (
    <div>
      <PageHeader title="Hồ sơ" />
      <dl className="max-w-md space-y-2 text-sm">
        <div className="flex justify-between">
          <dt>Mã thành viên</dt>
          <dd>{actor.schoolMemberCode}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Trạng thái</dt>
          <dd>{actor.membershipStatus}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Vai trò</dt>
          <dd>{actor.roles.join(", ")}</dd>
        </div>
      </dl>
    </div>
  );
}
