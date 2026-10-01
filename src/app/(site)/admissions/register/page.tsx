import { PageHero } from "@/components/site/blocks";
import { RegistrationWizard } from "@/components/forms/registration-wizard";
import { registrationOptions } from "@/lib/services/admissions";
import { db } from "@/lib/db";
import { school } from "@/config/school";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Register",
  description: "Online registration for Aurelia Hall (sample).",
  path: "/admissions/register",
  noindex: true,
});
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [classes, years] = await registrationOptions();
  const reg = await db.feeStructureLine.findFirst({
    where: { feeHead: { kind: "REGISTRATION" }, structure: { status: "ACTIVE" } },
    orderBy: { structure: { year: { startDate: "desc" } } },
  });
  return (
    <>
      <PageHero
        eyebrow="Admissions"
        title="Register your daughter"
        intro="About ten minutes. We save as you go, and you'll get a sign-in link to track the application at every step."
        crumbs={[
          { name: "Home", href: "/" },
          { name: "Admissions", href: "/admissions" },
          { name: "Register", href: "/admissions/register" },
        ]}
      />
      <section className="container-site grid gap-12 py-12 lg:grid-cols-[1fr_18rem] lg:py-16">
        <div className="min-w-0">
          <RegistrationWizard
            classes={classes.map((c) => ({ id: c.id, name: c.name, order: c.order }))}
            years={years.map((y) => ({ id: y.id, name: y.name }))}
            feePaise={reg?.amountPaise ?? school.registrationFeePaise}
          />
        </div>
        <aside className="space-y-4 text-sm text-muted lg:sticky lg:top-28 lg:self-start">
          <p className="font-serif text-xl text-primary">What happens next</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Pay the registration fee securely online.</li>
            <li>We email a receipt and your sign-in link.</li>
            <li>Admissions checks documents and schedules an assessment.</li>
            <li>Track every step in your applicant dashboard.</li>
          </ol>
          <p>
            Questions? Call {school.contact.admissionsPhone} or email {school.contact.admissionsEmail}.
          </p>
        </aside>
      </section>
    </>
  );
}
