import { AppShell } from "@/components/layout/app-shell";
import { ReportViewer } from "@/components/features/analysis/report-viewer";
import { MockQAChat } from "@/components/features/analysis/mock-qa-chat";

export const metadata = {
  title: "分析报告 · BiliProfile Analyzer",
  description: "面向普通 Bilibili 用户的公开数据画像与偏好分析报告（演示模式）",
};

export default function AnalysisPage() {
  return (
    <AppShell
      headerTitle="分析报告"
      headerSubtitle="查看基于本地示例快照生成的内容偏好演示。"
    >
      <ReportViewer />
      <MockQAChat />
    </AppShell>
  );
}
