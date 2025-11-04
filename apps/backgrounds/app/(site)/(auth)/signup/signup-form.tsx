"use client";
import { Input } from "@webcules/ui/components/input";
import SubmitButton from "@/components/shared/submit-button";
import { registerUserAction } from "@/lib/actions/auth-actions";
import { Label } from "@webcules/ui/components/label";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useRouter } from "next/navigation";

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export default function SignUpForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setServerError(null);
    const result = await registerUserAction(data.email, data.password, data.name);

    if (!result.success) {
      setServerError(result.message);
    } else {
      router.push("/dashboard");
      console.log(result.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          className="bg-black border-none"
          type="text"
          placeholder="John"
          {...register("name")}
        />
        {errors.name && (
          <div className="text-xs text-red-500">{errors.name.message}</div>
        )}
      </div>
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
      <SubmitButton text="Sign up" disabled={isSubmitting} />
    </form>
  );
}
