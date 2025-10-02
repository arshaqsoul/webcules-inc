import { AccessArgs } from "payload";
import { User } from "../payload-types";

export const isAdmin = ({ req: { user } }: AccessArgs<User>): boolean => {
  return Boolean(user?.role === "admin");
};
