import type { FieldAccess } from "payload";
import type { User } from "../payload-types"; // Adjust this path if your User type is located elsewhere

/**
 * Field-level access control to check if the user is an 'admin' or 'super-admin'.
 * This is suitable for use in 'access.update' for individual fields.
 */
export const isAdminFieldLevel: FieldAccess<any, User> = ({
  req: { user },
}) => {
  return Boolean(user?.role === "admin");
};
