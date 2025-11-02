import Link from "next/link";
import SignInForm from "./signin-form";
import { OauthSignUp } from "../oauth/_components/oauth-form";
import { checkUserAuth } from "@/lib/actions/auth-actions";
import { redirect } from "next/navigation";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string }>;
}) {
  const { returnUrl } = await searchParams;
  const { user } = await checkUserAuth();

  // If user is authenticated, redirect to returnUrl or dashboard
  if (user) {
    redirect(returnUrl || "/dashboard");
  }
  return (
    <div className="mx-auto grid w-full px-12 gap-6 text-white">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="text-balance text-muted-foreground">
          Enter your email below to login to your account
        </p>
      </div>
      <SignInForm returnUrl={returnUrl} />
      <OauthSignUp />
      <div className="mt-4 text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="underline" prefetch={false}>
          Sign up
        </Link>
      </div>
    </div>
  );
}
