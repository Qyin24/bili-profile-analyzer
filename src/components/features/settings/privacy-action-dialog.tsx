"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  ShieldAlert,
  Trash2,
  Lock,
  X,
  AlertTriangle,
} from "lucide-react";

interface PrivacyActionDialogProps {
  actionType: "REVOKE_FUTURE" | "PURGE_DATA" | null;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing?: boolean;
}

export function PrivacyActionDialog({
  actionType,
  onClose,
  onConfirm,
  isProcessing = false,
}: PrivacyActionDialogProps) {
  // Listen for Escape key
  React.useEffect(() => {
    if (!actionType) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actionType, onClose, isProcessing]);

  if (!actionType) return null;

  const isRevoke = actionType === "REVOKE_FUTURE";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-dialog-title"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="bg-card w-full max-w-md rounded-3xl border border-border/80 shadow-warm-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-border/60 flex items-center justify-between bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isRevoke
                  ? "bg-amber-100 text-amber-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isRevoke ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            </div>
            <h3 id="privacy-dialog-title" className="text-sm font-bold text-foreground">
              {isRevoke ? "停止以后使用确认" : "彻底删除个人说明与快照确认"}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            aria-label="关闭确认对话框"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-full transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-3.5 text-xs sm:text-sm">
          {isRevoke ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 leading-relaxed space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>仅停止未来新分析使用</span>
              </span>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                确认后，后续新发起的分析任务将不再使用这些个人说明；本地数据库中历史任务的快照将继续保留。
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-950 leading-relaxed space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-rose-900">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                <span>彻底清除该项信息与历史快照</span>
              </span>
              <p className="text-xs text-rose-900/90 leading-relaxed">
                确认后，将从本地数据库中永久删除该个人说明及关联的历史任务快照字段，并将受影响的任务标记为“需要重新生成报告”。此操作不可撤销。
              </p>
            </div>
          )}

          <div className="space-y-1 text-xs text-muted-foreground p-1">
            <span className="font-medium text-foreground">本地数据说明:</span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] text-muted-foreground">
              <li>数据仅保存在当前机器的本地 SQLite 数据库中。</li>
              <li>不向任何远程服务器或第三方平台上传。</li>
            </ul>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 sm:p-5 border-t border-border/40 bg-muted/10 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isProcessing}
            className="text-xs rounded-xl cursor-pointer"
          >
            取消
          </Button>
          <Button
            type="button"
            variant={isRevoke ? "default" : "destructive"}
            size="sm"
            onClick={onConfirm}
            disabled={isProcessing}
            className="text-xs gap-1.5 rounded-xl cursor-pointer font-semibold"
          >
            {isProcessing ? (
              <span>处理中...</span>
            ) : (
              <>
                {isRevoke ? <Lock className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{isRevoke ? "确认停止使用" : "确认彻底删除"}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
