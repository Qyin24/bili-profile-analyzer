import {
  TaskStatus,
  PipelineStage,
  TaskOutcome,
  DataSourceRunStatus,
  ConsentScope,
  RawRecordSourceType,
  TopicSubjectType,
  TopicAssignmentMethod,
  EvidenceSourceType,
} from "@prisma/client";

export type DbTaskStatus = TaskStatus;
export type DbPipelineStage = PipelineStage;
export type DbTaskOutcome = TaskOutcome;
export type DbDataSourceRunStatus = DataSourceRunStatus;
export type DbConsentScope = ConsentScope;
export type DbRawRecordSourceType = RawRecordSourceType;
export type DbTopicSubjectType = TopicSubjectType;
export type DbTopicAssignmentMethod = TopicAssignmentMethod;
export type DbEvidenceSourceType = EvidenceSourceType;

export interface CreateTargetDto {
  platformUid: string;
  inputType?: "UID" | "PROFILE_URL";
  normalizedIdentifier?: string;
  displayName?: string;
  operatorConsentConfirmed?: boolean;
}

export interface CreateTaskDto {
  targetId: string;
  taskStatus?: TaskStatus;
  pipelineStage?: PipelineStage;
  outcome?: TaskOutcome;
  progress?: number;
  currentStageMessage?: string;
}

export interface CreateRawRecordDto {
  taskId: string;
  dataSourceRunId?: string;
  sourceType: RawRecordSourceType;
  sourceIdentifier: string;
  payload: string; // Whitelisted body payload only, no headers/cookies/credentials
  contentHash: string;
  status?: string;
  expiresAt?: Date;
}
