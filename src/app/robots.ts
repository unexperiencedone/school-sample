import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/school";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/portal",
          "/applicant",
          "/login",
          "/mock-pay",
          "/api",
          "/admissions/register",
          "/careers/apply",
          "/_design",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
