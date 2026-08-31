"use client";

import * as React from "react";
import { Trash2, X } from "lucide-react";

interface PrivacyActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  onConfirmPurge?: () => void;
}

export function PrivacyActionDialog({
  isOpen,
  onClose,
  onConfirm,
  onConfirmPurge,
}: PrivacyActionDialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-dialog-title"
        className="bg-card w-full max-w-md rounded-3xl p-6 sm:p-7 border border-destructive/30 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dialog Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="privacy-dialog-title" className="text-base font-bold text-foreground">
                确认删除自述与关联历史？
              </h3>
              <p className="text-xs text-destructive font-medium">删除自述信息并作废关联报告 (演示)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="关闭对话框"
            className="p-1.5 rounded-xl bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning Explanation */}
        <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div className="p-3.5 rounded-2xl bg-destructive/10 border border-destructive/20 text-foreground font-medium text-[11px] space-y-1.5">
            <div className="font-bold text-destructive">⚠️ 演示交互与含义说明</div>
            <p className="leading-relaxed">
              此操作用于演示“删除自述与历史”的处理流程。确认后将在当前演示中清空表单并作废示例报告，刷新页面后可恢复初始示例。
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-background hover:bg-muted text-foreground border border-border/60 transition-colors"
          >
            取消
          </button>

          <button
            type="button"
            onClick={() => {
              if (onConfirm) onConfirm();
              if (onConfirmPurge) onConfirmPurge();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors shadow-sm cursor-pointer"
          >
            确认删除这项信息及历史
          </button>
        </div>
      </div>
    </div>
  );
}
