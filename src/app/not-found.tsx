import Link from "next/link";

/** Root 404 (outside the site layout, e.g. unknown /admin paths). */
export default function RootNotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="font-serif text-[7rem] leading-none text-marigold-500">404</p>
        <h1 className="t-h2 mt-2 text-primary">Page not found</h1>
        <Link
          href="/"
          className="mt-6 inline-block rounded-full bg-damson-800 px-6 py-3 font-semibold text-paper"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
