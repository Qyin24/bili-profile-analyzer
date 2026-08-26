import { AppShell } from "@/components/layout/app-shell";
import { TopicDistributionBar } from "@/components/features/entities/topic-distribution-bar";
import { EntityList } from "@/components/features/entities/entity-list";

export const metadata = {
  title: "关注内容 · BiliProfile Analyzer",
  description: "查看分析所涉及的公开关注博主与内容分类",
};

export default function EntitiesPage() {
  return (
    <AppShell
      headerTitle="关注内容"
      headerSubtitle="查看公开关注博主的主题分类与领域分布"
    >
      <TopicDistributionBar />
      <EntityList />
    </AppShell>
  );
}
