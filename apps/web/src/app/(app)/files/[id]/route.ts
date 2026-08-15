import { NextResponse } from "next/server";
import { can } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { readPrivateFile } from "@/lib/files/privateStorage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const stored = await db.storedFile.findFirst({
    where: { id, tenantId: actor.tenantId, deletedAt: null },
  });
  if (!stored) return new NextResponse("Not found", { status: 404 });

  const version = await db.applicationSubmissionVersion.findFirst({
    where: { fileId: id, application: { tenantId: actor.tenantId } },
    include: { application: true },
  });
  if (!version) return new NextResponse("Forbidden", { status: 403 });
  const application = version.application;
  const allowed =
    application.studentId === actor.userId ||
    application.currentTeacherId === actor.userId ||
    application.pendingTransferTo === actor.userId ||
    (actor.roles.includes("SCHOOL_ADMIN") && can(actor, "application.review"));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });

  try {
    const bytes = await readPrivateFile(stored.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": stored.mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(stored.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Stored object missing", { status: 410 });
  }
}
