import Image from "next/image";
import { notFound } from "next/navigation";
import { getFaculty, getFacultyMember } from "@/lib/content";
import { Breadcrumb } from "@/components/site/blocks";
import { pageMetadata } from "@/lib/seo/metadata";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return getFaculty().map((f) => ({ slug: f.slug }));
}
export async function generateMetadata({ params }: Props) {
  const f = getFacultyMember((await params).slug);
  return f
    ? pageMetadata({ title: `${f.name}, ${f.role}`, description: f.bio, path: `/faculty/${f.slug}` })
    : {};
}

export default async function FacultyMemberPage({ params }: Props) {
  const f = getFacultyMember((await params).slug);
  if (!f) notFound();
  return (
    <section className="container-site py-12 lg:py-20">
      <Breadcrumb
        items={[
          { name: "Home", href: "/" },
          { name: "Faculty", href: "/faculty" },
          { name: f.name, href: `/faculty/${f.slug}` },
        ]}
      />
      <div className="mt-10 grid gap-12 lg:grid-cols-[22rem_1fr] lg:gap-20">
        <div className="arch relative aspect-[4/5] overflow-hidden bg-cream">
          <Image
            src={f.image}
            alt={`Illustrated portrait of ${f.name} (sample)`}
            fill
            priority
            sizes="(min-width: 1024px) 22rem, 100vw"
            className="object-cover"
          />
        </div>
        <div>
          <p className="t-eyebrow">{f.department}</p>
          <h1 className="t-h1 mt-3 text-primary">{f.name}</h1>
          <p className="mt-2 text-lg text-muted">{f.role}</p>
          <blockquote className="mt-10 border-l-[3px] border-marigold-500 pl-6 font-serif text-2xl leading-snug text-primary">
            {f.quote}
          </blockquote>
          <p className="mt-8 max-w-2xl text-[1.08rem] leading-relaxed">{f.bio}</p>
          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-6 border-t border-line pt-6 text-sm">
            <div>
              <dt className="text-muted">Teaches</dt>
              <dd className="mt-1 font-medium">{f.subjects.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-muted">Qualifications</dt>
              <dd className="mt-1 font-medium">{f.qualifications}</dd>
            </div>
            <div>
              <dt className="text-muted">Joined</dt>
              <dd className="mt-1 font-medium">{f.joined}</dd>
            </div>
          </dl>
          <p className="mt-10 text-xs text-muted">
            Fictional person and illustrated portrait — sample content.
          </p>
        </div>
      </div>
    </section>
  );
}
