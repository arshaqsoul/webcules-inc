import { redirect } from "next/navigation";
import { checkUserAuth } from "@/lib/actions/auth-actions";
import LogoutButton from "@/components/shared/logout-btn";

export default async function DashboardPage() {
  const user = await checkUserAuth();
  if (!user) redirect("/signin");

  return (
    <>
      <ul>
        <li>
          <strong>Email:</strong> {user.user?.email}
        </li>
        <li>
          <strong>Name:</strong> {user.user?.name}
        </li>
      </ul>

      <LogoutButton />
    </>
  );
}
