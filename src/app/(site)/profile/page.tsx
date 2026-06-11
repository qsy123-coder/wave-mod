import { redirect } from "next/navigation";
import { getDefaultGame } from "@/config/games";

export default function ProfilePage() {
  redirect(`${getDefaultGame().nav.profile ?? `/${getDefaultGame().key}/profile`}`);
}
