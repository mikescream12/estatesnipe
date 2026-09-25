import { redirect } from "next/navigation";

/** Same chat home as /app — no Watches vs Chat split. */
export default function ChatAliasPage() {
  redirect("/app");
}
