import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";
import { toSlug } from "@/lib/slug";

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const now = new Date();

  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/parts`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/market`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8,
    },
  ];

  const parts = await prisma.part.findMany({
    where: { isActive: true },
    select: { modelName: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  const dynamicPartUrls: MetadataRoute.Sitemap = parts.map((part) => ({
    url: `${baseUrl}/parts/${toSlug(part.modelName)}`,
    lastModified: part.updatedAt,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [...staticUrls, ...dynamicPartUrls];
}
