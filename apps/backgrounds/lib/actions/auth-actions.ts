"use server";

import { login, logout } from "@payloadcms/next/auth";
import { getPayload } from "payload";
import config from "@webcules/payload/payload-config";
import { headers as getHeaders } from "next/headers";
import { revalidatePath } from "next/cache";

export async function loginAction(email: string, password: string) {
  try {
    const result = await login({
      collection: "users",
      config,
      email,
      password,
    });

    revalidatePath("/");
    return { success: true, user: result.user };
  } catch (error) {
    return {
      success: false,
      message: "Invalid email or password.",
    };
  }
}

export async function logoutAction() {
  try {
    await logout({ allSessions: true, config });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Logout failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function checkUserAuth() {
  const headers = await getHeaders();
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers });

  return { isAuthenticated: !!user, user };
}

export async function checkUserExistsAction(email: string) {
  try {
    const payload = await getPayload({ config });
    const user = await payload.find({
      collection: "users",
      where: {
        email: {
          equals: email,
        },
      },
      depth: 0,
      limit: 1,
    });
    return { success: true, exists: user.totalDocs > 0 };
  } catch (error) {
    return {
      success: false,
      message: "Failed to check user existence.",
    };
  }
}

export async function registerUserAction(email: string, password: string, name: string) {
  try {
    const payload = await getPayload({ config });
    const newUser = await payload.create({
      collection: "users",
      data: {
        email,
        password,
        name,
        role: "member",
      },
    });

    return {
      success: true,
      user: newUser,
      message:
        "Registration successful! Please check your email to verify your account before logging in.",
    };
  } catch (error) {
    return {
      success: false,
      message: `Registration failed: ${error instanceof Error ? error.message : "An unknown error occurred"}.`,
    };
  }
}
