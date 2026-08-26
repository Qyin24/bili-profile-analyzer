/**
 * BiliProfile Analyzer — Probe Streaming Safety Offline Self-Test (Phase 4.3.1)
 * 
 * Tests:
 * 1. Title tag split across multiple chunks is accurately recognized.
 * 2. Oversized single chunk strictly caps processing at 64 KiB (65536 bytes) and ignores title located beyond 64 KiB.
 * 3. Title tag within oversized chunk is recognized early without reading beyond safety cap.
 * 4. Sliding window rolling buffer never exceeds MAX_WINDOW_CHARS (2048 chars).
 * 5. Stream without title tag reaches EOF or cap and safely returns TITLE_SIGNAL_NOT_OBSERVED.
 * 6. Passing oversized parameters (e.g. 10 MB / 100000 chars) is strictly clamped to 64 KiB / 2048 chars.
 * 
 * Safety:
 * - Operates completely offline with synthetic mock ReadableStream instances.
 * - Does not perform any network requests.
 * - Does not output or persist any mock title text.
 */

import {
  inspectStreamForTitleSignal,
  MAX_BYTES_CAP,
  MAX_WINDOW_CHARS,
} from "./bilibili-public-capability";

function createMockStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

async function runSelfTests() {
  console.log("=================================================");
  console.log("🧪 BiliProfile Analyzer — 探针流式读取离线自检 (Phase 4.3.1)");
  console.log("=================================================\n");

  let allPassed = true;

  // --- Test Case 1: Title split across multiple chunks ---
  {
    const chunks = [
      stringToUint8Array("<!DOCTYPE html><html><head><tit"),
      stringToUint8Array("le>Sample Space Profile Title</ti"),
      stringToUint8Array("tle></head><body><div>Content</div></body></html>"),
    ];
    const stream = createMockStream(chunks);
    const result = await inspectStreamForTitleSignal(stream);

    const passed = result.fieldSignal === "TITLE_SIGNAL_OBSERVED";
    console.log(`[测试 1] 跨 Chunk 闭合标签识别: ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 字段信号判定: ${result.fieldSignal}`);
    console.log(`  - 处理字节数: ${result.bytesProcessed} 字节`);
    if (!passed) allPassed = false;
  }

  // --- Test Case 2: Oversized chunk with title located AFTER 64 KiB cap (at byte 70000) ---
  {
    const padding = "A".repeat(70000); // 70000 > 65536
    const hiddenTitle = "<title>Late Title</title>";
    const largeContent = padding + hiddenTitle + "B".repeat(10000); // ~80 KiB
    const chunk = stringToUint8Array(largeContent);

    const stream = createMockStream([chunk]);
    const result = await inspectStreamForTitleSignal(stream, MAX_BYTES_CAP, MAX_WINDOW_CHARS);

    const passed =
      result.bytesProcessed === MAX_BYTES_CAP &&
      result.fieldSignal === "TITLE_SIGNAL_NOT_OBSERVED";

    console.log(`[测试 2] 超大 Chunk 严格 64KiB 截断: ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 实际处理字节: ${result.bytesProcessed} / 上限 ${MAX_BYTES_CAP} 字节`);
    console.log(`  - 字段信号判定: ${result.fieldSignal} (64KiB 外内容未被读取)`);
    if (!passed) allPassed = false;
  }

  // --- Test Case 3: Oversized chunk with title within first 10 KiB ---
  {
    const earlyContent = "<!DOCTYPE html><html><head><title>Early Title</title></head><body>" + "X".repeat(80000);
    const chunk = stringToUint8Array(earlyContent);

    const stream = createMockStream([chunk]);
    const result = await inspectStreamForTitleSignal(stream);

    const passed =
      result.fieldSignal === "TITLE_SIGNAL_OBSERVED" &&
      result.bytesProcessed <= MAX_BYTES_CAP;

    console.log(`[测试 3] 超大 Chunk 头部信号命中早期熔断: ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 字段信号判定: ${result.fieldSignal}`);
    console.log(`  - 触发熔断处理字节: ${result.bytesProcessed} 字节 (<= ${MAX_BYTES_CAP})`);
    if (!passed) allPassed = false;
  }

  // --- Test Case 4: Sliding window buffer length invariant (≤ 2048 chars) ---
  {
    // Generate 32 chunks of 2048 bytes each (total 64 KiB)
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < 32; i++) {
      chunks.push(stringToUint8Array("C".repeat(2048)));
    }

    const stream = createMockStream(chunks);
    const result = await inspectStreamForTitleSignal(stream);

    const passed =
      result.maxObservedBufferLength <= MAX_WINDOW_CHARS &&
      result.bytesProcessed === MAX_BYTES_CAP;

    console.log(`[测试 4] 滑动窗口内存上限约束 (≤ 2048 字符): ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 峰值缓冲区字符数: ${result.maxObservedBufferLength} / 上限 ${MAX_WINDOW_CHARS}`);
    console.log(`  - 总处理字节数: ${result.bytesProcessed} / 上限 ${MAX_BYTES_CAP} 字节`);
    if (!passed) allPassed = false;
  }

  // --- Test Case 5: Stream without any title tag ---
  {
    const chunks = [
      stringToUint8Array("<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>"),
      stringToUint8Array("<main><h1>No title header here</h1><p>Paragraph content</p></main></body></html>"),
    ];
    const stream = createMockStream(chunks);
    const result = await inspectStreamForTitleSignal(stream);

    const passed = result.fieldSignal === "TITLE_SIGNAL_NOT_OBSERVED";
    console.log(`[测试 5] 无 title 标签安全退出: ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 字段信号判定: ${result.fieldSignal}`);
    console.log(`  - 处理字节数: ${result.bytesProcessed} 字节`);
    if (!passed) allPassed = false;
  }

  // --- Test Case 6: Oversized parameter inputs are strictly clamped to safety limits ---
  {
    const padding = "D".repeat(80000);
    const hiddenTitle = "<title>Should Not Read Beyond 64KiB</title>";
    const chunk = stringToUint8Array(padding + hiddenTitle);

    const stream = createMockStream([chunk]);
    // Pass oversized 10 MB byte cap and 100,000 window chars
    const result = await inspectStreamForTitleSignal(stream, 10 * 1024 * 1024, 100000);

    const passed =
      result.bytesProcessed === MAX_BYTES_CAP &&
      result.maxObservedBufferLength <= MAX_WINDOW_CHARS &&
      result.fieldSignal === "TITLE_SIGNAL_NOT_OBSERVED";

    console.log(`[测试 6] 超大参数不可突破安全硬顶 (10MB 强钳至 64KiB, 100k 强钳至 2048): ${passed ? "✅ 通过" : "❌ 失败"}`);
    console.log(`  - 实际处理字节: ${result.bytesProcessed} / 硬上限 ${MAX_BYTES_CAP}`);
    console.log(`  - 实际缓冲区字符数: ${result.maxObservedBufferLength} / 硬上限 ${MAX_WINDOW_CHARS}`);
    if (!passed) allPassed = false;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 所有 6 项离线流式安全自检全部通过！");
    console.log("=================================================\n");
  } else {
    console.error("❌ 部分自检项目未通过，请检查流式逻辑。");
    console.log("=================================================\n");
    process.exit(1);
  }
}

runSelfTests().catch((err) => {
  console.error("自检脚本执行异常:", err);
  process.exit(1);
});
