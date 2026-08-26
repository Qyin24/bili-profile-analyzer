import { AppShell } from "@/components/layout/app-shell";
import { SelfProfileForm } from "@/components/features/settings/self-profile-form";

export const metadata = {
  title: "设置 · BiliProfile Analyzer",
  description: "管理你的个人补充说明、分析授权与隐私数据",
};

export default function SettingsPage() {
  return (
    <AppShell
      headerTitle="设置"
      headerSubtitle="管理你的个人补充说明、分析授权范围与数据安全"
    >
      <SelfProfileForm />
    </AppShell>
  );
}
