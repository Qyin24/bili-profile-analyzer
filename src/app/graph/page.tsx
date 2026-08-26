import { AppShell } from "@/components/layout/app-shell";
import { MockRelationshipGraph } from "@/components/features/graph/mock-relationship-graph";

export const metadata = {
  title: "关系概览 · BiliProfile Analyzer",
  description: "直观展示“你 — 内容主题 — 关注博主”之间的关联结构",
};

export default function GraphPage() {
  return (
    <AppShell
      headerTitle="关系概览"
      headerSubtitle="直观展示分析主体、关注主题与代表性博主之间的多维关系结构"
    >
      <MockRelationshipGraph />
    </AppShell>
  );
}
