import { ModViewTracker } from "@/components/features/mods/detail/mod-view-tracker";
import { ModsListing } from "@/components/features/mods/list/mods-listing";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
  }>;
};

export default async function ModDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;

  return (
    <>
      <ModViewTracker modId={id} />
      <ModsListing searchParams={searchParams} openModId={id} />
    </>
  );
}
