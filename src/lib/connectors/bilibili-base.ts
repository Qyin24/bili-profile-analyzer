/**
 * BiliProfile Analyzer — Connector Capability Definitions (Phase 4.0.1)
 * Declarative capability metadata and fallback strategies.
 * Does not perform external network calls.
 */

import { ConnectorCapability } from "@/types/connector";

export const BILIBILI_CAPABILITIES: ConnectorCapability[] = [
  {
    type: "BASIC_PROFILE",
    name: "公开基础展示信息",
    description: "目标用户的公开昵称、头像链接、个性签名与认证标识",
    requiredForFullReport: false,
    fallbackStrategy: "使用默认占位展示名称（如：用户 UID）及通用头像",
  },
  {
    type: "PUBLIC_FOLLOWS",
    name: "公开关注列表",
    description: "目标用户公开可见的关注 UP 主列表与基本分类",
    requiredForFullReport: true,
    fallbackStrategy: "标记为 SKIPPED_UNAVAILABLE，触发降级模式，仅依赖自述与公开动态生成",
  },
  {
    type: "PUBLIC_CONTENT",
    name: "公开动态或投稿内容",
    description: "目标用户公开可见的近期动态或投稿基本时间戳与公开文本摘录",
    requiredForFullReport: false,
    fallbackStrategy: "跳过时间与动态特征分析，在报告中明确标注无动态样本",
  },
];
