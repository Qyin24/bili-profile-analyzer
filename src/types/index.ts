/**
 * BiliProfile Analyzer — Core Common Type Definitions
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

export * from "./persistence";
export * from "./analysis";
