/**
 * BiliProfile Analyzer — Core Common Type Definitions (Phase 1)
 */

export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  disabled?: boolean;
}

export interface AppConfig {
  name: string;
  description: string;
  version: string;
}
