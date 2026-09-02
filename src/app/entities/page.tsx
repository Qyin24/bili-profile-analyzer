"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { EntitiesView } from "@/components/features/entities/entities-view";

export default function EntitiesPage() {
  return (
    <AppLayout
      headerTitle="内容主题"
      headerSubtitle="浏览你分析出的内容主题与代表性关注内容。"
      showNewAnalysisButton
    >
      <EntitiesView />
    </AppLayout>
  );
}
