import Link from "next/link";
import SignUpForm from "./signup-form";
import { OauthSignUp } from "../oauth/_components/oauth-form";

export default function SignUp() {
  return (
    <div className="mx-auto grid w-full px-12 gap-6 text-white">
      <div className="grid gap-2 text-center">
        <h1 className="text-3xl font-bold">Sign up</h1>
        <p className="text-balance text-muted-foreground">
          Enter your name below to sign up to your account
        </p>
      </div>
      <SignUpForm />
      <OauthSignUp />
      <div className="mt-4 text-center text-sm">
        Don&apos;t have an account?{" "}
        <Link href="/signin" className="underline" prefetch={false}>
          Sign in
        </Link>
      </div>
    </div>
  );
}
