import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";

export default async function Home() {
  const actor = await currentActor();
  redirect(actor ? "/dashboard" : "/login");
}
