"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { RelationshipGraphView } from "@/components/features/graph/relationship-graph-view";

export default function GraphPage() {
  return (
    <AppLayout
      headerTitle="关系概览"
      headerSubtitle="以“你 — 内容主题 — 关注对象”通俗展示关系概览。"
      showNewAnalysisButton
    >
      <RelationshipGraphView />
    </AppLayout>
  );
}
