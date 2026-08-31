import { NextResponse } from "next/server";
import { topicTaxonomyRepository } from "@/lib/repositories/topic-taxonomy-repository";

export async function GET() {
  try {
    const taxonomies = await topicTaxonomyRepository.listTaxonomies();
    return NextResponse.json(taxonomies);
  } catch (err: unknown) {
    console.error("GET /api/taxonomy error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_SERVER_ERROR", message: "获取分类体系失败" } },
      { status: 500 }
    );
  }
}
