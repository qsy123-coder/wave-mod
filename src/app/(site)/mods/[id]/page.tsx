import { ModDetailDrawer } from "@/components/features/mods/detail/mod-detail-drawer";
import { ModViewTracker } from "@/components/features/mods/detail/mod-view-tracker";
import { ModsListing } from "@/components/features/mods/list/mods-listing";
import { getCurrentUser, isAdminUser } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
  }>;
};

export default async function ModDetailPage({ params, searchParams }: PageProps) {
  const { id: _id } = await params;
  const [user, admin] = await Promise.all([getCurrentUser(), isAdminUser()]);

  return (
    <>
      <ModsListing searchParams={searchParams} />
      <ModViewTracker modId={_id} />
      <ModDetailDrawer
        admin={Boolean(admin)}
        currentUserId={user?.id}
        currentUserName={
          user?.user_metadata?.display_name ??
          user?.email?.split("@")[0] ??
          "我"
        }
        isLoggedIn={Boolean(user)}
      />
    </>
  );
}
