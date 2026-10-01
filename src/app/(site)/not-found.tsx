import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-site grid min-h-[60vh] place-items-center py-24 text-center">
      <div>
        <p className="font-serif text-[8rem] leading-none text-marigold-500">404</p>
        <h1 className="t-h2 mt-2 text-primary">This corridor doesn&apos;t lead anywhere</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          The page may have moved. Try the search, or head back to the main hall.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper">
            Home
          </Link>
          <Link href="/search" className="rounded-full border border-line-strong px-6 py-3 font-semibold">
            Search
          </Link>
        </div>
      </div>
    </section>
  );
}
