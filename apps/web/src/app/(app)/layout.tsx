import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const user = await db.user.findUnique({ where: { id: actor.userId } });
  if (user?.mustChangePassword && process.env.DEMO_SKIP_PASSWORD_CHANGE !== "true") {
    redirect("/change-password");
  }
  return <AppShell actor={actor}>{children}</AppShell>;
}
