import { redirect } from "next/navigation";

export default function LegacySuperadminRoute() {
  redirect("/unauthorized?from=/superadmin");
}
