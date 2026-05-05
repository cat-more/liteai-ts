/**
 * 性能统计模块
 * 提供可扩展的统计收集器基类及简单内存实现
 */

import { StatsCollector, RequestStats } from './types';

/**
 * 统计收集器基类（用户可继承实现自定义逻辑）
 */
export abstract class BaseStatsCollector implements StatsCollector {
  onRequestStart(requestId: string, baseUrl: string, model: string, stream: boolean): void {
    // 可选覆写
  }

  onRetry(requestId: string, attempt: number, wait: number, reason: string): void {
    // 可选覆写
  }

  onTtfb(requestId: string, ttfbMs: number): void {
    // 可选覆写
  }

  onRequestEnd(stats: RequestStats): void {
    // 可选覆写
  }
}

/**
 * 简单内存统计收集器
 * 按 (baseUrl, model) 聚合统计数据
 */
export class SimpleStatsCollector extends BaseStatsCollector {
  private stats: Map<string, {
    baseUrl: string;
    model: string;
    totalRequests: number;
    successRequests: number;
    failedRequests: number;
    totalRetries: number;
    totalDurationMs: number;
    totalTtfbMs: number;
    ttfbCount: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    streamRequests: number;
    nonStreamRequests: number;
  }> = new Map();

  private pending: Map<string, RequestStats> = new Map();

  private getKey(baseUrl: string, model: string): string {
    return `${baseUrl}|${model}`;
  }

  onRequestStart(requestId: string, baseUrl: string, model: string, stream: boolean): void {
    // 可选存储开始时间，这里暂不存储，因为后续 onRequestEnd 会提供完整 stats
  }

  onRetry(requestId: string, attempt: number, wait: number, reason: string): void {
    // 简单实现中，我们可以在 onRequestEnd 时统计总的重试次数，但这里无法直接累加。
    // 更好的方式是在 onRequestEnd 中读取 stats.retryCount，所以此方法暂时空实现。
  }

  onTtfb(requestId: string, ttfbMs: number): void {
    // 可在 onRequestEnd 中通过 stats.ttfbMs 获取，暂不单独处理
  }

  onRequestEnd(stats: RequestStats): void {
    const key = this.getKey(stats.baseUrl, stats.model);
    let agg = this.stats.get(key);
    if (!agg) {
      agg = {
        baseUrl: stats.baseUrl,
        model: stats.model,
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        totalRetries: 0,
        totalDurationMs: 0,
        totalTtfbMs: 0,
        ttfbCount: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        streamRequests: 0,
        nonStreamRequests: 0,
      };
      this.stats.set(key, agg);
    }

    agg.totalRequests++;
    if (stats.success) {
      agg.successRequests++;
    } else {
      agg.failedRequests++;
    }
    agg.totalRetries += stats.retryCount;
    // 修复：使用 ?? 0 确保可选字段有默认值
    agg.totalDurationMs += stats.durationMs ?? 0;
    if (stats.ttfbMs !== undefined) {
      agg.totalTtfbMs += stats.ttfbMs;
      agg.ttfbCount++;
    }
    agg.totalPromptTokens += stats.promptTokens;
    agg.totalCompletionTokens += stats.completionTokens;
    agg.totalTokens += stats.totalTokens;
    if (stats.stream) {
      agg.streamRequests++;
    } else {
      agg.nonStreamRequests++;
    }
  }

  /**
   * 获取汇总统计
   * @param model 可选过滤模型名称
   * @param baseUrl 可选过滤 baseUrl
   */
  getSummary(model?: string, baseUrl?: string): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, agg] of this.stats.entries()) {
      if (model && agg.model !== model) continue;
      if (baseUrl && agg.baseUrl !== baseUrl) continue;
      result[key] = {
        baseUrl: agg.baseUrl,
        model: agg.model,
        totalRequests: agg.totalRequests,
        successRate: agg.totalRequests > 0 ? agg.successRequests / agg.totalRequests : 0,
        failedRequests: agg.failedRequests,
        totalRetries: agg.totalRetries,
        avgDurationMs: agg.totalRequests > 0 ? agg.totalDurationMs / agg.totalRequests : 0,
        avgTtfbMs: agg.ttfbCount > 0 ? agg.totalTtfbMs / agg.ttfbCount : null,
        totalTokens: agg.totalTokens,
        avgTokensPerRequest: agg.totalRequests > 0 ? agg.totalTokens / agg.totalRequests : 0,
        streamRequests: agg.streamRequests,
        nonStreamRequests: agg.nonStreamRequests,
      };
    }
    return result;
  }

  /**
   * 打印统计摘要到控制台
   */
  printSummary(): void {
    const summary = this.getSummary();
    console.log('\n=== LiteAI 统计摘要 ===');
    for (const [label, data] of Object.entries(summary)) {
      console.log(`\n${label}:`);
      for (const [k, v] of Object.entries(data)) {
        if (typeof v === 'number' && k.includes('Rate')) {
          console.log(`  ${k}: ${(v * 100).toFixed(2)}%`);
        } else if (typeof v === 'number') {
          console.log(`  ${k}: ${v.toFixed(2)}`);
        } else {
          console.log(`  ${k}: ${v}`);
        }
      }
    }
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.stats.clear();
    this.pending.clear();
  }
}