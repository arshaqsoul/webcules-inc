import { redirect } from "next/navigation";
import { checkUserAuth } from "@/lib/actions/auth-actions";
import LogoutButton from "@/components/shared/logout-btn";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default async function DashboardPage() {
  const user = await checkUserAuth();
  if (!user) redirect("/signin");

  return (
    <div className="overflow-x-hidden relative flex flex-col items-center justify-between">
      <div className="lg:max-w-[85rem] h-fit lg:px-16 w-full flex flex-col px-4 py-20 mt-10">
        <div className="flex flex-row items-center justify-between">
          <ul>
            <li>
              <strong>Email:</strong> {user.user?.email}
            </li>
            <li>
              <strong>Name:</strong> {user.user?.name}
            </li>
          </ul>
          <LogoutButton />
          <Link
            href={"/"}
            className="flex flex-row items-center whitespace-nowrap rounded-3xl bg-darkest text-sm text-gray-50 border-gray-700 hover:border-white/20 border px-4 py-2"
          >
            <ArrowLeft />
            Back
          </Link>
          <h1 className="text-2xl md:text-5xl text-white">Collections</h1>
        </div>
      </div>
    </div>
  );
}
