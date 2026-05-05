/**
 * LiteAI TypeScript SDK - 入口文件
 */

// 核心客户端
export { LiteAI, LiteAIConfig } from './client';

// 错误类
export {
  LiteAIError,
  ConfigurationError,
  APICallError,
  RetryExhausted,
  SSEParseError,
} from './errors';

// 类型定义
export * from './types';



// 日志工具
export { createLogger, createNullLogger } from './log';

// 统计收集器
export { BaseStatsCollector, SimpleStatsCollector } from './stats';

// 辅助函数（可选）
// export { buildUrl, safeHeaders, calculateWait, sleep } from './utils';

// 重新导出图像相关工具函数
export { buildUrl, safeHeaders, calculateWait, sleep, imageFileToBase64, normalizeImageUrl } from './utils';

// 为了方便，重新导出图像相关类型
// export type { ImageGenerationParams, ImageGenerationResponse, ImageData } from './types';
export type { ImageGenerationParams, ImageGenerationResponse, ImageData, EmbeddingParams, EmbeddingResponse } from './types';

export { createMultipartForm } from './utils';
export type { MultipartFile, MultipartFormOptions } from './utils';


// 异步任务轮询工具
export { pollUntilComplete, PollOptions } from './utils';

