/* /dashboard/templates (WEB-248) — temporary redirect to the forms page;
 * the 9/10 template-manager hub replaces this with the unified library. */
import { redirect } from "next/navigation";

export default function TemplatesRedirect() {
  redirect("/dashboard/templates/forms");
}
