import { prisma } from "@/lib/db/client";
import { TopicAssignment, TopicAssignmentMethod, TopicSubjectType, TopicTaxonomy } from "@prisma/client";

export interface ITopicTaxonomyRepository {
  listTaxonomies(): Promise<TopicTaxonomy[]>;
  findByCode(code: string): Promise<TopicTaxonomy | null>;
  createTaxonomy(data: {
    code: string;
    name: string;
    color?: string;
    description?: string;
    version?: string;
  }): Promise<TopicTaxonomy>;
  createAssignment(data: {
    subjectType: TopicSubjectType;
    subjectId: string;
    topicId: string;
    taxonomyVersion?: string;
    method?: TopicAssignmentMethod;
    confidence?: number;
    evidenceIds?: string[];
    followId?: string;
    contentItemId?: string;
  }): Promise<TopicAssignment>;
  listAssignmentsBySubject(subjectType: TopicSubjectType, subjectId: string): Promise<TopicAssignment[]>;
}

export class TopicTaxonomyRepository implements ITopicTaxonomyRepository {
  async listTaxonomies(): Promise<TopicTaxonomy[]> {
    return prisma.topicTaxonomy.findMany({
      where: { isEnabled: true },
      orderBy: { code: "asc" },
    });
  }

  async findByCode(code: string): Promise<TopicTaxonomy | null> {
    return prisma.topicTaxonomy.findUnique({
      where: { code },
    });
  }

  async createTaxonomy(data: {
    code: string;
    name: string;
    color?: string;
    description?: string;
    version?: string;
  }): Promise<TopicTaxonomy> {
    return prisma.topicTaxonomy.create({
      data: {
        code: data.code,
        name: data.name,
        color: data.color,
        description: data.description,
        version: data.version || "1.0.0",
        isEnabled: true,
      },
    });
  }

  async createAssignment(data: {
    subjectType: TopicSubjectType;
    subjectId: string;
    topicId: string;
    taxonomyVersion?: string;
    method?: TopicAssignmentMethod;
    confidence?: number;
    evidenceIds?: string[];
    followId?: string;
    contentItemId?: string;
  }): Promise<TopicAssignment> {
    const method = data.method === "MANUAL" ? "MANUAL" : "RULE_BASED";
    return prisma.topicAssignment.create({
      data: {
        subjectType: data.subjectType,
        subjectId: data.subjectId,
        topicId: data.topicId,
        taxonomyVersion: data.taxonomyVersion || "1.0.0",
        method,
        confidence: data.confidence ?? 1.0,
        evidenceIds: JSON.stringify(data.evidenceIds || []),
        followId: data.followId,
        contentItemId: data.contentItemId,
      },
      include: {
        topic: true,
      },
    });
  }

  async listAssignmentsBySubject(subjectType: TopicSubjectType, subjectId: string): Promise<TopicAssignment[]> {
    return prisma.topicAssignment.findMany({
      where: { subjectType, subjectId },
      include: { topic: true },
    });
  }
}

export const topicTaxonomyRepository: ITopicTaxonomyRepository = new TopicTaxonomyRepository();
