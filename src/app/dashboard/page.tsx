import { AppShell } from "@/components/layout/app-shell";
import { DashboardView } from "@/components/features/dashboard/dashboard-view";

export const metadata = {
  title: "开始分析 · BiliProfile Analyzer",
  description: "面向普通 Bilibili 用户的公开数据画像与偏好分析（演示模式）",
};

export default function DashboardPage() {
  return (
    <AppShell
      headerTitle="开始分析"
      headerSubtitle="当前为演示：UID 或主页链接仅用于创建本地模拟任务；不会访问 Bilibili，也不会读取真实账号数据。"
    >
      <DashboardView />
    </AppShell>
  );
}
