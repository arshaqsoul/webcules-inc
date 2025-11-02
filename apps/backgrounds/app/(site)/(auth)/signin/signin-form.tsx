"use client";
import { Label } from "@webcules/ui/components//label";
import { Input } from "@webcules/ui/components//input";
import SubmitButton from "@/components/shared/submit-button";
import { loginAction } from "@/lib/actions/auth-actions";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useRouter } from "next/navigation";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function SignInForm({ returnUrl }: { returnUrl?: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | undefined>(undefined);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setServerError(undefined);
    const result = await loginAction(data.email, data.password);

    if (!result.success) {
      setServerError(result.message);
    } else {
      router.push(returnUrl || "/dashboard");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          className="bg-black border-none"
          type="email"
          placeholder="m@example.com"
          {...register("email")}
        />
        {errors.email && (
          <div className="text-xs text-red-500">{errors.email.message}</div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          className="bg-black border-none"
          type="password"
          {...register("password")}
        />
        {errors.password && (
          <div className="text-xs text-red-500">{errors.password.message}</div>
        )}
      </div>
      {serverError && (
        <div className="text-red-500 text-sm">
          <ul>
            <li>{serverError}</li>
          </ul>
        </div>
      )}
      <SubmitButton text="Sign in" disabled={isSubmitting} />
    </form>
  );
}
