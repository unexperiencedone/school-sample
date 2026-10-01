import { allStaticLinks, mainNav } from "@/config/nav";

/** Breadcrumbs derived from the IA: Home › Section › Page. */
export function crumbsFor(pathname: string, title: string): { name: string; href: string }[] {
  const items = [{ name: "Home", href: "/" }];
  const group = mainNav.find((g) => g.links.some((l) => l.href === pathname) && g.href !== pathname);
  if (group) items.push({ name: group.label, href: group.href });
  const label = allStaticLinks().find((l) => l.href === pathname)?.label ?? title;
  items.push({ name: label, href: pathname });
  return items;
}
