"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { EntitiesView } from "@/components/features/entities/entities-view";
import { useMockTask } from "@/lib/mock-task-context";

export default function EntitiesPage() {
  const { demoTarget, demoTopicTaxonomy, demoFollowEntities, selfProfile } = useMockTask();

  return (
    <AppLayout
      headerTitle="内容主题"
      headerSubtitle="浏览内容主题与代表性关注内容（受控演示模式）。"
      showNewAnalysisButton
    >
      <EntitiesView
        target={demoTarget}
        topicTaxonomy={demoTopicTaxonomy}
        entities={demoFollowEntities}
        selfProfile={selfProfile}
        isDemo
      />
    </AppLayout>
  );
}
