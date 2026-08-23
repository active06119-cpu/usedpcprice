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

  // DB가 없거나 접속 실패해도 빌드가 깨지지 않게 (부품 URL은 생략)
  let dynamicPartUrls: MetadataRoute.Sitemap = [];
  try {
    const parts = await prisma.part.findMany({
      where: { isActive: true },
      select: { modelName: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    dynamicPartUrls = parts.map((part) => ({
      url: `${baseUrl}/parts/${toSlug(part.modelName)}`,
      lastModified: part.updatedAt,
      changeFrequency: "daily",
      priority: 0.7,
    }));
  } catch (error) {
    console.error("[sitemap] 부품 목록 조회 실패, 기본 sitemap만 반환:", error);
  }

  return [...staticUrls, ...dynamicPartUrls];
}
