import type { Access } from "payload";

export const authenticatedAndPaid: Access = ({ req }) => {
  if (!req.user) {
    return false;
  }
  const isAdmin = req.user.collection === "users" && req.user.role === "admin";
  const isPaidMember = req.user.isPaid === true;

  return isAdmin || isPaidMember;
};
