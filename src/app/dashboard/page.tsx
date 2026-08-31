"use client";

import * as React from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { DashboardView } from "@/components/features/dashboard/dashboard-view";

export default function DashboardPage() {
  return (
    <AppLayout
      headerTitle="我的报告"
      headerSubtitle="查看历史分析记录与可用信息摘要。"
      showNewAnalysisButton={true}
    >
      <div className="max-w-4xl mx-auto">
        <DashboardView />
      </div>
    </AppLayout>
  );
}
