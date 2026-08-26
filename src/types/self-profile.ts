/**
 * BiliProfile Analyzer — Self-Provided Profile Types (Phase 5.0)
 * Types for user-provided context, consent scope, and immutable task snapshots.
 */

export const SELF_PROVIDED_FIELD_NAMES = [
  "currentGoals",
  "learningDirections",
  "careerOrMajor",
  "interestTags",
  "questionsForAnalysis",
  "additionalContext",
] as const;

export type SelfProvidedFieldName = (typeof SELF_PROVIDED_FIELD_NAMES)[number];

export const CONSENT_SCOPES = [
  "THIS_TASK_ONLY",
  "PERSISTENT_ACROSS_TASKS",
] as const;

export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export interface SelfProvidedFieldItem {
  id?: string;
  fieldName: SelfProvidedFieldName;
  value: string;
  allowedForAnalysis: boolean;
  consentScope: ConsentScope;
  updatedAt?: string;
}

export interface SelfProvidedProfileResponse {
  id: string;
  updatedAt: string;
  fields: Record<SelfProvidedFieldName, SelfProvidedFieldItem>;
  hasAllowedFieldsForAnalysis: boolean;
}

export interface UpdateSelfProfilePayload {
  fields: Partial<
    Record<
      SelfProvidedFieldName,
      {
        value: string;
        allowedForAnalysis: boolean;
        consentScope: ConsentScope;
      }
    >
  >;
}

export interface RevokeSelfProfilePayload {
  fieldName?: SelfProvidedFieldName | "ALL";
}

export interface PurgeSelfProfilePayload {
  fieldName: SelfProvidedFieldName | "ALL";
}

export interface SnapshotFieldItem {
  fieldName: string;
  value: string;
  consentScope: string;
}

export interface SelfProvidedSnapshotData {
  id: string;
  taskId: string;
  createdAt: string;
  fields: SnapshotFieldItem[];
}
