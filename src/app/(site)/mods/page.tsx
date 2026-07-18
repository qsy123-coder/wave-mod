import { ModsListing } from "@/components/features/mods/list/mods-listing";

type PageProps = {
  searchParams?: Promise<{
    sort?: string;
    character?: string;
    query?: string;
  }>;
};

export default function ModsPage({ searchParams }: PageProps) {
  return <ModsListing searchParams={searchParams} />;
}
