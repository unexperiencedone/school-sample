import { Suspense } from "react";
import { SearchClient } from "@/components/site/search-client";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Search",
  description: "Search Aurelia Hall's website.",
  path: "/search",
  noindex: true,
});

export default function SearchPage() {
  return (
    <section className="container-prose py-16">
      <h1 className="t-h1 text-primary">Search</h1>
      <div className="mt-8">
        <Suspense>
          <SearchClient />
        </Suspense>
      </div>
    </section>
  );
}
