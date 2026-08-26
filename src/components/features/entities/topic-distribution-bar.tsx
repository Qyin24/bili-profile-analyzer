import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MOCK_CATEGORY_METRICS } from "@/lib/mock-data";
import { BarChart2 } from "lucide-react";

export function TopicDistributionBar() {
  const maxCount = Math.max(...MOCK_CATEGORY_METRICS.map((m) => m.count));

  return (
    <Card className="border-border/80 bg-card rounded-3xl overflow-hidden shadow-warm">
      <CardHeader className="p-5 sm:p-6 pb-3 flex flex-row items-center justify-between">
        <div className="space-y-0.5">
          <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-foreground">
            <BarChart2 className="w-4 h-4 text-primary" />
            <span>关注主题占比分布</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            基于 99 个公开关注博主的内容分类聚合计算
          </p>
        </div>
        <span className="text-xs text-muted-foreground bg-cream-200 px-2.5 py-1 rounded-full border border-border/50">
          共 99 位博主
        </span>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 pt-1 space-y-3.5">
        {MOCK_CATEGORY_METRICS.map((metric) => {
          const barWidthPercent = Math.max((metric.count / maxCount) * 100, 6);

          return (
            <div key={metric.topicId} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: metric.color }}
                  />
                  <span>{metric.topicName}</span>
                </span>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-muted-foreground">{metric.percentage}%</span>
                  <span className="font-bold text-foreground w-8 text-right">
                    {metric.count} 位
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 rounded-full bg-cream-300/80 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${barWidthPercent}%`,
                    background: `linear-gradient(90deg, ${metric.color}cc, ${metric.color})`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
