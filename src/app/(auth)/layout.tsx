import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { school } from "@/config/school";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="grain bg-damson-900 text-paper relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative z-10 w-fit">
          <Logo />
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="font-serif text-4xl leading-tight italic">
            “A school is a promise kept, one ordinary day at a time.”
          </p>
          <p className="text-damson-300 mt-4 text-sm tracking-wide uppercase">
            The Aurelia Hall staff handbook
          </p>
        </div>
        <svg
          aria-hidden
          className="text-damson-700/60 absolute -right-24 -bottom-24 h-[38rem]"
          viewBox="0 0 48 56"
        >
          <path
            d="M4 54V24C4 12.95 12.95 4 24 4s20 8.95 20 20v30"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.6"
          />
          <path
            d="M11 54V25.5C11 18.6 16.82 13 24 13s13 5.6 13 12.5V54"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.4"
          />
        </svg>
        <p className="text-damson-300 relative z-10 text-xs">{school.name} · sample build</p>
      </aside>
      <main id="main" className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <Link href="/" className="text-primary mb-10 block lg:hidden">
            <Logo />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
