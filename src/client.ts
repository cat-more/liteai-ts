/**
 * LiteAI 核心客户端 - 完整实现（修复重试统计）
 * 支持非流式/流式请求、重试、SSE 解析、统计钩子、原始日志
 */

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats } from './types';
// import { buildUrl, safeHeaders, calculateWait, sleep } from './utils';
import { buildUrl, safeHeaders, calculateWait, sleep, createMultipartForm, MultipartFormOptions } from './utils';

import { APICallError, ConfigurationError, RetryExhausted } from './errors';
import { createLogger, createNullLogger } from './log';
// import { ImageGenerationParams, ImageGenerationResponse } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse, FileListResponse, FileUploadParams, FileObject, FileDeleteResponse } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse, FileListResponse, FileUploadParams, FileObject, FileDeleteResponse, UploadPolicy, UploadToOssParams } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse, FileListResponse, FileUploadParams, FileObject, FileDeleteResponse, UploadPolicy, UploadToOssParams,BatchCreateParams,BatchListResponse,Batch } from './types';
// import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse, FileListResponse, FileUploadParams, FileObject, FileDeleteResponse, UploadPolicy, UploadToOssParams,BatchCreateParams,BatchListResponse,Batch } from './types';
import { Logger, StatsCollector, ChatCompletionCreateParams, ChatCompletionResponse, ChatCompletionChunk, LogDetail, LogTruncationConfig, RequestStats, ImageGenerationParams, ImageGenerationResponse, EmbeddingParams, EmbeddingResponse, AudioSpeechParams, AudioTranscriptionParams, AudioTranscriptionResponse, FileListResponse, FileUploadParams, FileObject, FileDeleteResponse, UploadPolicy, UploadToOssParams, BatchCreateParams, BatchListResponse, Batch, ModelListResponse, DEFAULT_LOG_TRUNCATION } from './types';


export interface LiteAIConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number | [number, number];
  maxRetries?: number;
  backoffFactor?: number;
  maxWait?: number;
  logFile?: string;
  logLevel?: number;
  logMode?: 'single' | 'daily' | 'append';
  consoleLog?: boolean;
  logDetail?: LogDetail;
  logTruncation?: LogTruncationConfig;
  verifySsl?: boolean;
  proxy?: string;
  rawLogger?: Logger;
  statsCollector?: StatsCollector;
}

const RETRYABLE_STATUS_CODES = new Set([429, 408, 409, 500, 502, 503, 504]);

export class LiteAI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;
  private backoffFactor: number;
  private maxWait: number;
  private verifySsl: boolean;
  private proxy?: string;
  private log: Logger;
  private rawLogger?: Logger;
  private statsCollector?: StatsCollector;
  private logDetail: LogDetail;
  private logTruncation: Required<LogTruncationConfig>;

  constructor(config: LiteAIConfig) {
    this.apiKey = config.apiKey;
    if (!this.apiKey) throw new ConfigurationError('API key 不能为空');
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (Array.isArray(config.timeout)) {
      this.timeout = config.timeout[1];
    } else {
      this.timeout = config.timeout || 300;
    }
    this.maxRetries = config.maxRetries ?? 3;
    this.backoffFactor = config.backoffFactor ?? 1.0;
    this.maxWait = config.maxWait ?? 120;
    this.verifySsl = config.verifySsl ?? true;
    this.proxy = config.proxy;
    this.logDetail = config.logDetail ?? 2;
    this.logTruncation = {
      structPrefix: config.logTruncation?.structPrefix ?? DEFAULT_LOG_TRUNCATION.structPrefix,
      structSuffix: config.logTruncation?.structSuffix ?? DEFAULT_LOG_TRUNCATION.structSuffix,
      unstructPrefix: config.logTruncation?.unstructPrefix ?? DEFAULT_LOG_TRUNCATION.unstructPrefix,
      unstructSuffix: config.logTruncation?.unstructSuffix ?? DEFAULT_LOG_TRUNCATION.unstructSuffix,
      streamPrefix: config.logTruncation?.streamPrefix ?? DEFAULT_LOG_TRUNCATION.streamPrefix,
      streamSuffix: config.logTruncation?.streamSuffix ?? DEFAULT_LOG_TRUNCATION.streamSuffix,
    };
    this.rawLogger = config.rawLogger;
    this.statsCollector = config.statsCollector;

    const enableLogging = !!(config.logFile || config.logLevel !== undefined);
    if (!enableLogging) {
      this.log = createNullLogger();
    } else {
      this.log = createLogger({
        logFile: config.logFile,
        logLevel: config.logLevel,
        logMode: config.logMode,
        consoleLog: config.consoleLog,
        logDetail: this.logDetail,
      });
      this.log.debug('LiteAI 客户端初始化完成');
    }
  }

  private isRetryableError(statusCode: number): boolean {
    return RETRYABLE_STATUS_CODES.has(statusCode);
  }

  private logBodySummary(bodyStr: string, prefix: string): void {
    if (this.logDetail >= 3) {
      this.log.debug(`${prefix}: ${bodyStr}`);
    } else if (this.logDetail === 2) {
      const { unstructPrefix, unstructSuffix } = this.logTruncation;
      const total = unstructPrefix + unstructSuffix;
      if (bodyStr.length > total) {
        this.log.debug(`${prefix}: ${bodyStr.slice(0, unstructPrefix)}...${bodyStr.slice(-unstructSuffix)}`);
      } else {
        this.log.debug(`${prefix}: ${bodyStr}`);
      }
    } else {
      this.log.debug(`${prefix}长度: ${bodyStr.length} 字符`);
    }
  }

  private logRaw(prefix: string, data: string): void {
    if (this.rawLogger) {
      this.rawLogger.debug(`${prefix}\n${data}`);
    }
  }

  private async request<T>(
    method: string,
    path: string,
    requestId: string,
    body?: any,
    options?: {
      stream?: boolean;
      responseType?: 'json' | 'buffer';
      requestType?: 'json' | 'multipart';
      multipartOptions?: MultipartFormOptions;
      query?: Record<string, string>;  // 新增
    }
  ): Promise<{ data: T; retryCount: number } | Buffer | AsyncIterable<any>> {
    let fullUrl = buildUrl(this.baseUrl, path);
    if (options?.query) {
      const qs = new URLSearchParams(options.query).toString();
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    } 
    this.log.debug(`========== REQUEST ==========`);
    this.log.debug(`baseUrl: ${this.baseUrl}`);
    this.log.debug(`path: ${path}`);
    this.log.debug(`URL: ${fullUrl}`);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'User-Agent': `LiteAI-TS/0.4.0`,
    };

    // 设置默认 options
    const opts = {
      stream: false,
      responseType: 'json' as const,
      requestType: 'json' as const,
      ...options,
    };

    let requestBody: Buffer | string | undefined;
    let customContentType: string | undefined;

    // ========== 处理 multipart 请求（不依赖 body 参数） ==========
    if (opts.requestType === 'multipart' && opts.multipartOptions) {
      const multipart = createMultipartForm(opts.multipartOptions);
      requestBody = multipart.body;
      customContentType = multipart.contentType;
      if (requestBody) {
        this.log.debug(`multipart 请求体大小: ${requestBody.length} 字节`);
      }
      if (this.rawLogger && requestBody) {
        this.rawLogger.debug(`=== RAW REQUEST (multipart) ===\nURL: ${fullUrl}\nMethod: ${method}\nHeaders: ${JSON.stringify(safeHeaders(headers))}\nMultipart size: ${requestBody.length} bytes`);
      }
      // 直接设置 Content-Type
      if (customContentType) {
        headers['Content-Type'] = customContentType;
      }
      if (requestBody) {
        headers['Content-Length'] = requestBody.length.toString();
      }
    } 
    // ========== 处理普通 JSON 请求 ==========
    else if (body) {
      if (opts.requestType === 'json') {
        requestBody = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        this.logBodySummary(requestBody, '请求体');
        if (this.rawLogger) {
          this.rawLogger.debug(`=== RAW REQUEST ===\nURL: ${fullUrl}\nMethod: ${method}\nHeaders: ${JSON.stringify(safeHeaders(headers))}\nBody:\n${requestBody}`);
        }
        headers['Content-Length'] = Buffer.byteLength(requestBody).toString();
      } else {
        // 理论上其他类型暂不支持，但留作扩展
        this.log.warn(`Unsupported requestType: ${opts.requestType} with body`);
      }
    }

    let attempt = 0;
    let retryCount = 0;

    while (true) {
      try {
        const parsedUrl = new URL(fullUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        let agent: any = undefined;
        if (this.proxy) {
          try {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            const { HttpProxyAgent } = require('http-proxy-agent');
            const proxyUrl = new URL(this.proxy);
            const protocol = parsedUrl.protocol; // 'https:' 或 'http:'
            if (protocol === 'https:') {
              agent = new HttpsProxyAgent(proxyUrl);
            } else {
              agent = new HttpProxyAgent(proxyUrl);
            }
          } catch (err) {
            throw new Error('Proxy support requires "https-proxy-agent" and "http-proxy-agent". Please install them: npm install https-proxy-agent http-proxy-agent');
          }
        }

        
        const requestOptions: https.RequestOptions = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: method,
          headers: headers,
          agent: agent, // 添加这一行
        };
        if (!this.verifySsl) {
          requestOptions.rejectUnauthorized = false;
        }

        // 强制确保对于 JSON 请求，Content-Type 头部被正确设置（某些边界情况）
        if (opts.requestType === 'json' && body && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
          this.log.debug(`已强制添加 Content-Type: application/json`);
        }
        // 对于 multipart，确保 Content-Type 不为空
        if (opts.requestType === 'multipart' && !headers['Content-Type']) {
          headers['Content-Type'] = 'multipart/form-data';
          this.log.debug(`已强制添加 Content-Type: multipart/form-data`);
        }

        this.log.debug(`请求头: ${JSON.stringify(safeHeaders(headers))}`);

        const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
          const req = protocol.request(requestOptions, (res) => resolve(res));
          const timeoutMs = this.timeout * 1000;
          req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error(`Request timeout after ${this.timeout} seconds`));
          });
          req.on('error', reject);
          if (requestBody) {
            req.write(requestBody);
          }
          req.end();
        });

        const statusCode = response.statusCode || 0;
        this.log.debug(`响应状态: ${statusCode}`);
        this.log.debug(`响应头: ${JSON.stringify(response.headers)}`);

        // 处理二进制响应（不解析 JSON）
        if (opts.responseType === 'buffer') {
          const chunks: Buffer[] = [];
          for await (const chunk of response) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          this.log.debug(`二进制响应大小: ${buffer.length} 字节`);
          if (this.rawLogger) {
            this.rawLogger.debug(`=== RAW RESPONSE (binary) ===\nStatus: ${statusCode}\nSize: ${buffer.length} bytes`);
          }
          if (statusCode >= 200 && statusCode < 300) {
            return buffer;
          } else {
            throw { statusCode, responseBody: buffer.toString('utf-8') };
          }
        }

        // 处理流式响应（SSE）
        if (opts.stream && statusCode === 200) {
          return this.streamResponse(response);
        }

        // 普通 JSON 响应
        const chunks: Buffer[] = [];
        for await (const chunk of response) {
          chunks.push(chunk);
        }
        const responseBody = Buffer.concat(chunks).toString('utf-8');
        this.logBodySummary(responseBody, '响应体');
        if (this.rawLogger) {
          this.rawLogger.debug(`=== RAW RESPONSE ===\nStatus: ${statusCode}\nHeaders: ${JSON.stringify(response.headers)}\nBody:\n${responseBody}`);
        }

        if (statusCode >= 200 && statusCode < 300) {
          try {
            const json = JSON.parse(responseBody);
            return { data: json as T, retryCount };
          } catch (e) {
            this.log.error(`JSON 解析失败: ${responseBody.slice(0, 200)}`);
            throw new APICallError(0, `JSON 解析失败: ${e}`, responseBody);
          }
        } else {
          throw { statusCode, responseBody };
        }
      } catch (error: any) {
        let statusCode = 0;
        let responseBody = '';
        if (error.statusCode) {
          statusCode = error.statusCode;
          responseBody = error.responseBody;
        } else {
          this.log.warn(`网络错误: ${error.message}`);
        }

        const canRetry = (statusCode && this.isRetryableError(statusCode)) || (!statusCode);
        if (canRetry && attempt < this.maxRetries) {
          const waitSeconds = calculateWait(attempt, this.backoffFactor, this.maxWait, null);
          this.log.info(`可重试错误 ${statusCode || 'network'}，${attempt + 1}/${this.maxRetries} 次重试，等待 ${waitSeconds.toFixed(2)} 秒...`);
          if (this.statsCollector) {
            const reason = statusCode ? `status=${statusCode}` : 'network_error';
            this.statsCollector.onRetry(requestId, attempt, waitSeconds, reason);
          }
          await sleep(waitSeconds * 1000);
          attempt++;
          retryCount++;
          continue;
        } else {
          if (statusCode) {
            throw new APICallError(statusCode, `HTTP ${statusCode}`, responseBody);
          } else {
            throw new APICallError(0, error.message || '请求失败', '');
          }
        }
      }
    }
  }


  private async *streamResponse(response: http.IncomingMessage): AsyncIterable<ChatCompletionChunk> {
    let buffer = '';                // 用于拼接不完整的 JSON（跨行累积）
    let pendingLine = '';          // 用于存储被 TCP 拆包截断的不完整行（不含换行符）
    const dataPrefixes = ['data: ', 'data:'];
    const collectedLines: string[] = [];
    let firstChunkTime: number | null = null;
    const startTime = Date.now();

    try {
      for await (const chunk of response) {
        const text = pendingLine + chunk.toString('utf-8');
        pendingLine = ''; // 重置，因为已经拼接
        const lines = text.split('\n');
        // 最后一行可能不完整，暂存到 pendingLine 等待下一个 chunk
        // 但需要确保最后一行不是空字符串（避免无限拼接）
        const lastLine = lines.pop();
        if (lastLine !== undefined) {
          pendingLine = lastLine;
        }
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          collectedLines.push(trimmed);
          let dataStr: string | null = null;
          for (const prefix of dataPrefixes) {
            if (trimmed.startsWith(prefix)) {
              dataStr = trimmed.slice(prefix.length).trimStart();
              break;
            }
          }
          if (dataStr === null) continue;
          if (dataStr === '[DONE]') break;

          const testStr = buffer + dataStr;
          try {
            const parsed = JSON.parse(testStr);
            buffer = '';   // 成功解析，清空缓冲区
            if (firstChunkTime === null && parsed.choices?.[0]?.delta?.content) {
              firstChunkTime = Date.now() - startTime;
            }
            yield parsed;
          } catch (e: any) {
            // 解析失败：暂存整个 testStr，等待更多数据
            buffer = testStr;
            // 可选日志
            if (this.logDetail >= 3 && buffer.length < 2000) {
              this.log.debug(`不完整 JSON 片段，继续累积 (当前长度 ${buffer.length})`);
            }
          }
        }
      }

      // 循环结束后，处理 pendingLine 中残留的不完整行（可能包含 'data: ...'）
      if (pendingLine) {
        const trimmed = pendingLine.trim();
        if (trimmed) {
          let dataStr: string | null = null;
          for (const prefix of dataPrefixes) {
            if (trimmed.startsWith(prefix)) {
              dataStr = trimmed.slice(prefix.length).trimStart();
              break;
            }
          }
          if (dataStr && dataStr !== '[DONE]') {
            const testStr = buffer + dataStr;
            try {
              const parsed = JSON.parse(testStr);
              buffer = '';
              this.log.debug(`流结束，成功解析 pendingLine 中的数据 (长度 ${testStr.length})`);
              yield parsed;
            } catch (e) {
              this.log.warn(`流结束，pendingLine 数据解析失败: ${testStr.slice(0, 200)}`);
            }
          }
        }
      }

      // 最后，处理 buffer 中可能残留的完整 JSON（例如没有换行符结尾）
      if (buffer) {
        try {
          const parsed = JSON.parse(buffer);
          this.log.debug(`流结束，成功解析剩余 buffer (长度 ${buffer.length})`);
          yield parsed;
        } catch (e: any) {
          const preview = buffer.length > 200 ? buffer.slice(0, 200) + '...' : buffer;
          this.log.warn(`流结束，剩余 buffer 解析失败: ${preview}`);
        }
      }
    } finally {
      // 原有的日志记录逻辑（保持不变）
      if (this.logDetail === 1) {
        this.log.debug(`SSE 总行数: ${collectedLines.length}`);
      } else if (this.logDetail === 2) {
        const { streamPrefix, streamSuffix } = this.logTruncation;
        const total = streamPrefix + streamSuffix;
        if (collectedLines.length <= total) {
          collectedLines.forEach(line => this.log.debug(line));
        } else {
          collectedLines.slice(0, streamPrefix).forEach(line => this.log.debug(line));
          this.log.debug(`... 省略 ${collectedLines.length - total} 行 ...`);
          collectedLines.slice(-streamSuffix).forEach(line => this.log.debug(line));
        }
      } else {
        collectedLines.forEach(line => this.log.debug(line));
      }
      if (this.rawLogger) {
        this.rawLogger.debug(`=== RAW SSE STREAM ===\n${collectedLines.join('\n')}`);
      }
      this.log.debug('流式响应连接已关闭');
    }
  } 


  // 图像生成模块（自动适配 OpenAI / 阿里云 DashScope / 智谱等）
  public images = {
    generate: async (params: ImageGenerationParams): Promise<ImageGenerationResponse> => {
      const requestId = randomUUID();
      const baseUrl = this.baseUrl;
      const model = params.model || 'dall-e-3';

      if (this.statsCollector) {
        this.statsCollector.onRequestStart(requestId, baseUrl, model, false);
      }

      const startTime = Date.now();
      let retryCount = 0;
      let statusCode = 0;
      let success = true;
      let errorType: string | undefined;

      try {
        // 检测是否为阿里云 DashScope
        const isAliyun = baseUrl.includes('dashscope.aliyuncs.com')
                      || baseUrl.includes('dashscope-intl.aliyuncs.com')
                      || baseUrl.includes('dashscope-us.aliyuncs.com');

        let requestPath: string;
        let requestBody: any;
        let customResponseHandler: ((data: any) => ImageGenerationResponse) | null = null;

        if (isAliyun) {
          // ---------- 阿里云 DashScope 专用格式 ----------
          requestPath = '/services/aigc/multimodal-generation/generation';
          const contentArray: any[] = [{ text: params.prompt }];
          // 如果传了图片（以图生图），则处理 image 字段
          if (params.image) {
            // 如果是本地文件或以 data:image 开头的 base64，阿里云要求上传到 OSS
            // 这里简化为直接传递 image URL，生产环境建议提升为自动文件上传
            contentArray.push({ image: params.image });
          }
          const messages = [{ role: 'user', content: contentArray }];
          const inputData: any = { messages };
          const parameters: any = {};
          if (params.n !== undefined) parameters.n = params.n;
          if (params.size) {
            // 阿里云分辨率格式为 "1280*1280""，统一将 "x" 转为 "*"
            parameters.size = params.size.replace('x', '*');
          }
          if (params.negative_prompt) parameters.negative_prompt = params.negative_prompt;
          if (params.prompt_extend !== undefined) parameters.prompt_extend = params.prompt_extend;
          if (params.watermark !== undefined) parameters.watermark = params.watermark;
          if (params.seed !== undefined) parameters.seed = params.seed;
          requestBody = { model, input: inputData, parameters };
          // 阿里云返回 new protocol 格式，需要二次提取
          customResponseHandler = (data: any) => {
            // new protocol (wan2.6-t2i) 返回结构： { output: { choices: [ { message: { content: [ { image: "url" } ] } } ] } }
            const choices = data?.output?.choices;
            if (choices && Array.isArray(choices) && choices.length > 0) {
              const contentList = choices[0]?.message?.content || [];
              const urls = contentList.filter((item: any) => item.image).map((item: any) => ({ url: item.image }));
              if (urls.length > 0) {
                return {
                  created: Math.floor(Date.now() / 1000),
                  data: urls
                } as ImageGenerationResponse;
              }
            }
            // 兼容旧协议 / 单张图片返回
            if (data?.output?.url) {
              return {
                created: Math.floor(Date.now() / 1000),
                data: [{ url: data.output.url }]
              };
            }
            throw new Error('阿里云响应中未找到图片字段');
          };
        } else {
          // ---------- OpenAI / 智谱 / 其他兼容接口 ----------
          requestPath = '/images/generations';
          requestBody = { ...params };
          customResponseHandler = null;
        }

        const result = await this.request('POST', requestPath, requestId, requestBody, {
          stream: false,
          responseType: 'json',
          requestType: 'json',
        });

        const { data: responseRaw, retryCount: rc } = result as { data: any; retryCount: number };
        retryCount = rc;
        statusCode = 200;

        let finalResponse: ImageGenerationResponse;
        if (customResponseHandler) {
          finalResponse = customResponseHandler(responseRaw);
        } else {
          finalResponse = responseRaw as ImageGenerationResponse;
        }

        const stats: RequestStats = {
          requestId,
          baseUrl,
          model,
          stream: false,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          ttfbMs: Date.now() - startTime,
          statusCode,
          success: true,
          retryCount,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          sseChunkCount: 0,
          sseBytes: 0,
        };
        if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
        return finalResponse;
      } catch (error: any) {
        success = false;
        errorType = error.name || 'APICallError';
        if (error.statusCode) statusCode = error.statusCode;
        const stats: RequestStats = {
          requestId,
          baseUrl,
          model,
          stream: false,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          ttfbMs: undefined,
          statusCode,
          success: false,
          errorType,
          retryCount,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          sseChunkCount: 0,
          sseBytes: 0,
        };
        if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
        throw error;
      }
    },
  };

  // 新增 Embeddings 模块
  public embeddings = {
    create: async (params: EmbeddingParams): Promise<EmbeddingResponse> => {
      const requestId = randomUUID();
      const baseUrl = this.baseUrl;
      const model = params.model;

      if (this.statsCollector) {
        this.statsCollector.onRequestStart(requestId, baseUrl, model, false);
      }

      const startTime = Date.now();
      let retryCount = 0;
      let statusCode = 0;
      let success = true;
      let errorType: string | undefined;

      try {
        const isDashScope = baseUrl.includes('dashscope.aliyuncs.com');
        let requestPath: string;
        let requestBody: any;               // 外部变量，避免重复声明
        let customResponseHandler: ((data: any) => EmbeddingResponse) | null = null;

        if (isDashScope) {
          // 阿里云多模态嵌入统一端点
          requestPath = '/services/embeddings/multimodal-embedding/multimodal-embedding';
          
          // 构建 contents 数组
          let contents: any[] = [];
          if (params.contents && Array.isArray(params.contents)) {
            contents = params.contents;
          } else if (params.input) {
            const texts = Array.isArray(params.input) ? params.input : [params.input];
            contents = texts.map(text => ({ text }));
          } else {
            throw new Error('阿里云嵌入需要提供 input 或 contents 参数');
          }
          
          // 直接赋值给外部 requestBody，而不是重新声明
          requestBody = {
            model,
            input: { contents },
          };
          
          // 构建 parameters 对象（如有）
          const parameters: any = {};
          if (params.dimension !== undefined) parameters.dimension = params.dimension;
          if (params.res_level !== undefined) parameters.res_level = params.res_level;
          if (params.max_video_frames !== undefined) parameters.max_video_frames = params.max_video_frames;
          if (params.enable_fusion !== undefined) parameters.enable_fusion = params.enable_fusion;
          if (params.instruct !== undefined) parameters.instruct = params.instruct;
          if (params.fps !== undefined) parameters.fps = params.fps;
          if (params.text_type !== undefined) parameters.text_type = params.text_type;
          
          if (Object.keys(parameters).length > 0) {
            requestBody.parameters = parameters;
          }
          
          // 响应转换
          customResponseHandler = (data: any) => {
            const embeddings = data?.output?.embeddings;
            if (!embeddings) throw new Error('阿里云响应缺少 embeddings');
            return {
              object: 'list',
              data: embeddings.map((emb: any, idx: number) => ({
                object: 'embedding',
                index: emb.index ?? idx,
                embedding: emb.embedding,
              })),
              model,
              usage: {
                prompt_tokens: data?.usage?.total_tokens || 0,
                total_tokens: data?.usage?.total_tokens || 0,
              },
            };
          };
        } else {
          // OpenAI 标准格式
          requestPath = '/embeddings';
          requestBody = { ...params };
          customResponseHandler = null;
        }

        const result = await this.request('POST', requestPath, requestId, requestBody, {
          stream: false,
          responseType: 'json',
          requestType: 'json',
        });

        const { data: responseRaw, retryCount: rc } = result as { data: any; retryCount: number };
        retryCount = rc;
        statusCode = 200;

        let finalResponse: EmbeddingResponse;
        if (customResponseHandler) {
          finalResponse = customResponseHandler(responseRaw);
        } else {
          finalResponse = responseRaw as EmbeddingResponse;
        }

        const stats: RequestStats = {
          requestId,
          baseUrl,
          model,
          stream: false,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          ttfbMs: Date.now() - startTime,
          statusCode,
          success: true,
          retryCount,
          promptTokens: finalResponse.usage?.prompt_tokens || 0,
          completionTokens: 0,
          totalTokens: finalResponse.usage?.total_tokens || 0,
          sseChunkCount: 0,
          sseBytes: 0,
        };
        if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
        return finalResponse;
      } catch (error: any) {
        success = false;
        errorType = error.name || 'APICallError';
        if (error.statusCode) statusCode = error.statusCode;
        const stats: RequestStats = {
          requestId,
          baseUrl,
          model,
          stream: false,
          startTime,
          endTime: Date.now(),
          durationMs: Date.now() - startTime,
          ttfbMs: undefined,
          statusCode,
          success: false,
          errorType,
          retryCount,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          sseChunkCount: 0,
          sseBytes: 0,
        };
        if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
        throw error;
      }
    },
  };

  // 音频 TTS 模块（兼容 OpenAI 和阿里云 DashScope）
  public audio = {
    speech: {
      create: async (params: AudioSpeechParams): Promise<Buffer> => {
        const requestId = randomUUID();
        const baseUrl = this.baseUrl;
        const model = params.model;

        if (this.statsCollector) {
          this.statsCollector.onRequestStart(requestId, baseUrl, model, false);
        }

        const startTime = Date.now();
        let retryCount = 0;
        let statusCode = 0;
        let success = true;
        let errorType: string | undefined;

        try {
          // 判断是否为阿里云 DashScope
          const isDashScope = baseUrl.includes('dashscope.aliyuncs.com');

          let requestPath: string;
          let requestBody: any;
          let responseType: 'json' | 'buffer';

          if (isDashScope) {
            // 阿里云多模态生成接口路径（baseUrl 末尾不带斜杠）
            requestPath = '/services/aigc/multimodal-generation/generation';
            const inputObj: any = {};
            const textContent = params.text || params.input;
            if (textContent) inputObj.text = textContent;
            if (params.voice) inputObj.voice = params.voice;
            if (params.language_type) inputObj.language_type = params.language_type;
            if (params.instructions) inputObj.instructions = params.instructions;
            if (params.optimize_instructions !== undefined) inputObj.optimize_instructions = params.optimize_instructions;
            // 其他自定义参数透传
            for (const key of Object.keys(params)) {
              if (!['model', 'text', 'input', 'voice', 'language_type', 'instructions', 'optimize_instructions', 'speed', 'response_format', 'stream'].includes(key)) {
                inputObj[key] = (params as any)[key];
              }
            }
            requestBody = {
              model: params.model,
              input: inputObj,
            };
            responseType = 'json';
          } else {
            // OpenAI 标准格式
            requestPath = '/audio/speech';
            requestBody = {
              model: params.model,
              input: params.input || params.text,
              voice: params.voice,
              speed: params.speed,
              response_format: params.response_format || 'mp3',
            };
            responseType = 'buffer';
          }

          const result = await this.request('POST', requestPath, requestId, requestBody, {
            stream: false,
            responseType: responseType,
            requestType: 'json',
          });

          let audioBuffer: Buffer;

          if (isDashScope) {
            // 阿里云返回 JSON，从中提取音频 URL 并下载
            const jsonResp = (result as { data: any; retryCount: number }).data;
            const audioUrl = jsonResp?.output?.audio?.url;
            if (!audioUrl) {
              throw new Error('阿里云响应中未包含 audio.url');
            }
            this.log.debug(`从阿里云获取音频 URL: ${audioUrl}`);
            audioBuffer = await new Promise<Buffer>((resolve, reject) => {
              const urlObj = new URL(audioUrl);
              const protocol = urlObj.protocol === 'https:' ? https : http;
              const req = protocol.get(audioUrl, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              });
              req.on('error', reject);
              req.setTimeout(this.timeout * 1000, () => {
                req.destroy();
                reject(new Error(`Download timeout after ${this.timeout} seconds`));
              });
            });
          } else {
            audioBuffer = result as Buffer;
          }

          statusCode = 200;
          const stats: RequestStats = {
            requestId,
            baseUrl,
            model,
            stream: false,
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            ttfbMs: Date.now() - startTime,
            statusCode,
            success: true,
            retryCount,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            sseChunkCount: 0,
            sseBytes: 0,
          };
          if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
          return audioBuffer;
        } catch (error: any) {
          success = false;
          errorType = error.name || 'APICallError';
          if (error.statusCode) statusCode = error.statusCode;
          const stats: RequestStats = {
            requestId,
            baseUrl,
            model,
            stream: false,
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            ttfbMs: undefined,
            statusCode,
            success: false,
            errorType,
            retryCount,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            sseChunkCount: 0,
            sseBytes: 0,
          };
          if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
          throw error;
        }
      },
    },

    // 新增：音频转录（语音转文字）
    transcriptions: {
      create: async (params: AudioTranscriptionParams): Promise<AudioTranscriptionResponse> => {
        const requestId = randomUUID();
        const baseUrl = this.baseUrl;
        const model = params.model;

        if (this.statsCollector) {
          this.statsCollector.onRequestStart(requestId, baseUrl, model, false);
        }

        const startTime = Date.now();
        let retryCount = 0;
        let statusCode = 0;
        let success = true;
        let errorType: string | undefined;

        try {
          // 处理文件：如果是文件路径，读取为 Buffer
          let fileBuffer: Buffer;
          let filename: string;
          if (typeof params.file === 'string') {
            fileBuffer = await fs.promises.readFile(params.file);
            filename = path.basename(params.file);
          } else {
            fileBuffer = params.file;
            filename = 'audio.mp3'; // 默认文件名
          }

          // 构建 multipart 表单
          const fields: Record<string, string> = {
            model: params.model,
          };
          if (params.language) fields.language = params.language;
          if (params.prompt) fields.prompt = params.prompt;
          if (params.response_format) fields.response_format = params.response_format;
          if (params.temperature !== undefined) fields.temperature = params.temperature.toString();
          if (params.timestamp_granularities) {
            fields.timestamp_granularities = JSON.stringify(params.timestamp_granularities);
          }

          const files = [{
            fieldName: 'file',
            filename: filename,
            contentType: 'audio/mpeg',     // 可根据扩展名优化
            data: fileBuffer,
          }];

          const multipart = createMultipartForm({ fields, files });

          // 手动构建请求（因为 multipart 不能直接用 this.request 中的 JSON 流程）
          // 这里直接使用原生 http 请求，但为了复用重试/日志，我们扩展 request 方法支持 multipart
          // 注意：我们的 request 方法已经支持 requestType: 'multipart'，所以直接调用即可
          const result = await this.request('POST', '/audio/transcriptions', requestId, null, {
            stream: false,
            responseType: 'json',
            requestType: 'multipart',
            multipartOptions: { fields, files },
          });

          const { data: response, retryCount: rc } = result as { data: AudioTranscriptionResponse; retryCount: number };
          retryCount = rc;
          statusCode = 200;

          const stats: RequestStats = {
            requestId,
            baseUrl,
            model,
            stream: false,
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            ttfbMs: Date.now() - startTime,
            statusCode,
            success: true,
            retryCount,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            sseChunkCount: 0,
            sseBytes: 0,
          };
          if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
          return response;
        } catch (error: any) {
          success = false;
          errorType = error.name || 'APICallError';
          if (error.statusCode) statusCode = error.statusCode;
          const stats: RequestStats = {
            requestId,
            baseUrl,
            model,
            stream: false,
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            ttfbMs: undefined,
            statusCode,
            success: false,
            errorType,
            retryCount,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            sseChunkCount: 0,
            sseBytes: 0,
          };
          if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
          throw error;
        }
      },
    },

  };


//文件上传
  public files = {
    // 列出所有文件
    list: async (purpose?: 'assistants' | 'fine-tune' | 'vision' | 'batch', limit?: number): Promise<FileListResponse> => {
      const requestId = randomUUID();
      const baseUrl = this.baseUrl;
      const isSiliconFlow = baseUrl.includes('siliconflow.cn');

      // SiliconFlow 只支持 purpose='batch'
      let finalPurpose = purpose;
      if (isSiliconFlow) {
        if (purpose && purpose !== 'batch') {
          this.log.warn(`SiliconFlow only supports purpose='batch', but received '${purpose}'. Automatically converting to 'batch'.`);
        }
        finalPurpose = 'batch';
      }

      // 构建查询参数
      const params = new URLSearchParams();
      if (finalPurpose) params.append('purpose', finalPurpose);
      if (limit !== undefined) params.append('limit', limit.toString());
      const queryString = params.toString();
      const path = queryString ? `/files?${queryString}` : '/files';

      const result = await this.request('GET', path, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });

      const { data: responseData, retryCount } = result as { data: any; retryCount: number };

      if (isSiliconFlow) {
        // 解析 SiliconFlow 特有响应格式
        if (responseData.code !== 20000) {
          throw new Error(`SiliconFlow list files failed: ${responseData.message}`);
        }
        const items = responseData.data?.data || [];
        const files = items.map((item: any) => ({
          id: item.id,
          bytes: item.bytes,
          created_at: item.created_at,
          filename: item.filename,
          object: 'file' as const,
          purpose: item.purpose,
        }));
        return { object: 'list', data: files };
      } else {
        // OpenAI 标准格式
        return responseData as FileListResponse;
      }
    },

    // 上传文件
    upload: async (params: FileUploadParams): Promise<FileObject> => {
      const requestId = randomUUID();
      const baseUrl = this.baseUrl;
      const isSiliconFlow = baseUrl.includes('siliconflow.cn');

      // 处理文件内容
      let fileBuffer: Buffer;
      let filename: string;
      if (typeof params.file === 'string') {
        fileBuffer = await fs.promises.readFile(params.file);
        filename = params.filename || path.basename(params.file);
      } else {
        fileBuffer = params.file;
        filename = params.filename || 'file';
      }

      // 对于 SiliconFlow，如果 purpose 不是 'batch'，仅打印警告，不强制转换
      if (isSiliconFlow && params.purpose !== 'batch') {
        this.log.warn(`SiliconFlow recommends purpose='batch' for batch processing, but received '${params.purpose}'. Ensure the platform supports it.`);
      }

      const fields: Record<string, string> = {
        purpose: params.purpose,
      };
      const files = [{
        fieldName: 'file',
        filename,
        contentType: 'application/octet-stream', // 可根据扩展名优化
        data: fileBuffer,
      }];

      const result = await this.request('POST', '/files', requestId, null, {
        stream: false,
        responseType: 'json',
        requestType: 'multipart',
        multipartOptions: { fields, files },
      });

      const { data: responseData, retryCount } = result as { data: any; retryCount: number };

      if (isSiliconFlow) {
        if (responseData.code !== 20000) {
          throw new Error(`SiliconFlow upload failed: ${responseData.message}`);
        }
        const fileData = responseData.data;
        return {
          id: fileData.id,
          bytes: fileData.bytes,
          created_at: fileData.created_at || fileData.createdAt,
          filename: fileData.filename,
          object: 'file',
          purpose: fileData.purpose,
          url: fileData.object, // 原始响应中的 object 就是文件 URL
        };
      } else {
        // OpenAI 标准格式
        return responseData as FileObject;
      }
    },

    // 获取文件信息
    retrieve: async (fileId: string): Promise<FileObject> => {
      const requestId = randomUUID();
      const result = await this.request('GET', `/files/${fileId}`, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: FileObject; retryCount: number };
      return data;
    },

    // 删除文件
    delete: async (fileId: string): Promise<FileDeleteResponse> => {
      const requestId = randomUUID();
      const result = await this.request('DELETE', `/files/${fileId}`, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: FileDeleteResponse; retryCount: number };
      return data;
    },

    // 获取文件内容（返回 Buffer）
    content: async (fileId: string): Promise<Buffer> => {
      const requestId = randomUUID();
      const result = await this.request('GET', `/files/${fileId}/content`, requestId, undefined, {
        stream: false,
        responseType: 'buffer',
        requestType: 'json',
      });
      return result as Buffer;
    },
  };

  public models = {
    /**
     * 获取模型列表
     * @returns Promise<ModelListResponse> 模型列表
     */
    list: async (): Promise<ModelListResponse> => {
      const requestId = randomUUID();
      const result = await this.request('GET', '/models', requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: ModelListResponse; retryCount: number };
      return data;
    },
  };

  public chat = {
    completions: {
      create: async (params: ChatCompletionCreateParams): Promise<ChatCompletionResponse | AsyncIterable<ChatCompletionChunk>> => {
        const requestId = randomUUID();
        const stream = params.stream === true;
        const model = params.model;
        const baseUrl = this.baseUrl;

        if (this.statsCollector) {
          this.statsCollector.onRequestStart(requestId, baseUrl, model, stream);
        }

        const startTime = Date.now();
        let statusCode = 0;
        let success = true;
        let errorType: string | undefined;
        let promptTokens = 0;
        let completionTokens = 0;
        let totalTokens = 0;
        let sseChunkCount = 0;
        let sseBytes = 0;
        let ttfbMs: number | undefined;
        let retryCount = 0;

        try {
          const body = { ...params, stream };
          const result = await this.request('POST', '/chat/completions', requestId, body, {
              stream: stream,
              responseType: 'json',
              requestType: 'json',
            });
          
          if (stream) {
            const originalGenerator = result as AsyncIterable<ChatCompletionChunk>;
            const self = this;
            async function* wrappedGenerator() {
              let first = true;
              for await (const chunk of originalGenerator) {
                if (first && self.statsCollector) {
                  ttfbMs = Date.now() - startTime;
                  self.statsCollector.onTtfb(requestId, ttfbMs);
                  first = false;
                }
                sseChunkCount++;
                sseBytes += JSON.stringify(chunk).length;
                if (chunk.usage) {
                  promptTokens = chunk.usage.prompt_tokens;
                  completionTokens = chunk.usage.completion_tokens;
                  totalTokens = chunk.usage.total_tokens;
                }
                yield chunk;
              }
              const stats: RequestStats = {
                requestId,
                baseUrl,
                model,
                stream: true,
                startTime,
                endTime: Date.now(),
                durationMs: Date.now() - startTime,
                ttfbMs,
                statusCode: 200,
                success: true,
                retryCount,
                promptTokens,
                completionTokens,
                totalTokens,
                sseChunkCount,
                sseBytes,
              };
              if (self.statsCollector) self.statsCollector.onRequestEnd(stats);
            }
            return wrappedGenerator();
          } else {
            // 非流式：解构返回的 { data, retryCount }
            const { data: response, retryCount: rc } = result as { data: ChatCompletionResponse; retryCount: number };
            retryCount = rc;
            ttfbMs = Date.now() - startTime;
            statusCode = 200;
            if (response.usage) {
              promptTokens = response.usage.prompt_tokens;
              completionTokens = response.usage.completion_tokens;
              totalTokens = response.usage.total_tokens;
            }
            const stats: RequestStats = {
              requestId,
              baseUrl,
              model,
              stream: false,
              startTime,
              endTime: Date.now(),
              durationMs: Date.now() - startTime,
              ttfbMs,
              statusCode,
              success: true,
              retryCount,
              promptTokens,
              completionTokens,
              totalTokens,
              sseChunkCount: 0,
              sseBytes: 0,
            };
            if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
            return response;
          }
        } catch (error: any) {
          success = false;
          errorType = error.name || 'APICallError';
          if (error.statusCode) statusCode = error.statusCode;
          const stats: RequestStats = {
            requestId,
            baseUrl,
            model,
            stream,
            startTime,
            endTime: Date.now(),
            durationMs: Date.now() - startTime,
            ttfbMs,
            statusCode,
            success: false,
            errorType,
            retryCount,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            sseChunkCount: 0,
            sseBytes: 0,
          };
          if (this.statsCollector) this.statsCollector.onRequestEnd(stats);
          throw error;
        }
      },
    },
  };

  //上传本地文件获取临时URL
  public uploads = {
    // 步骤1：获取上传凭证
    getUploadPolicy: async (model: string): Promise<UploadPolicy> => {
      const requestId = randomUUID();
      const result = await this.request('GET', '/api/v1/uploads', requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
        query: { action: 'getPolicy', model },
      });
      // console.log('raw result:', JSON.stringify(result));
      // result 结构: { data: { data: {...}, request_id }, retryCount }
      const outerData = (result as any).data;
      const policy = outerData.data as UploadPolicy; 
      // console.log('policy:', JSON.stringify(policy));
      return policy;
    },

    // 步骤2+3：上传文件到OSS并返回临时URL
    getTemporaryUrl: async (params: UploadToOssParams): Promise<string> => {
      // 1. 获取上传凭证
      const policy = await this.uploads.getUploadPolicy(params.model);
      // 2. 处理文件
      let fileBuffer: Buffer;
      let filename: string;
      if (typeof params.file === 'string') {
        fileBuffer = await fs.promises.readFile(params.file);
        filename = path.basename(params.file);
      } else {
        fileBuffer = params.file;
        filename = 'file';
      }
      const key = `${policy.upload_dir}/${filename}`;
      // 3. 构建 multipart 表单（与 OSS 要求一致）
      const fields: Record<string, string> = {
        OSSAccessKeyId: policy.oss_access_key_id,
        Signature: policy.signature,
        policy: policy.policy,
        'x-oss-object-acl': policy.x_oss_object_acl,
        'x-oss-forbid-overwrite': policy.x_oss_forbid_overwrite,
        key: key,
        success_action_status: '200',
      };
      const files = [{
        fieldName: 'file',
        filename,
        contentType: 'application/octet-stream',
        data: fileBuffer,
      }];
      const multipart = createMultipartForm({ fields, files });
      // 4. 使用原生 http 发送 POST 请求到 upload_host
      const uploadUrl = policy.upload_host;
      const urlObj = new URL(uploadUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      await new Promise<void>((resolve, reject) => {
        const req = protocol.request(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': multipart.contentType,
            'Content-Length': multipart.body.length,
          },
        }, (res) => {
          // 消费响应数据以释放连接
          res.resume();
          if (res.statusCode === 200) resolve();
          else reject(new Error(`Upload failed with status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.write(multipart.body);
        req.end();
      });
      // 5. 返回 oss:// URL
      return `oss://${key}`;
    },
  };


  public batches = {
    // 创建批处理任务
    create: async (params: BatchCreateParams): Promise<Batch> => {
      const requestId = randomUUID();
      const result = await this.request('POST', '/batches', requestId, params, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: Batch; retryCount: number };
      return data;
    },

    // 获取批处理任务详情
    retrieve: async (batchId: string): Promise<Batch> => {
      const requestId = randomUUID();
      const result = await this.request('GET', `/batches/${batchId}`, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: Batch; retryCount: number };
      return data;
    },

    // 列出批处理任务
    list: async (limit?: number, after?: string): Promise<BatchListResponse> => {
      const requestId = randomUUID();
      let path = '/batches';
      const params = new URLSearchParams();
      if (limit !== undefined) params.append('limit', limit.toString());
      if (after) params.append('after', after);
      if (params.toString()) path += `?${params.toString()}`;
      const result = await this.request('GET', path, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: BatchListResponse; retryCount: number };
      return data;
    },

    // 取消批处理任务
    cancel: async (batchId: string): Promise<Batch> => {
      const requestId = randomUUID();
      const result = await this.request('POST', `/batches/${batchId}/cancel`, requestId, undefined, {
        stream: false,
        responseType: 'json',
        requestType: 'json',
      });
      const { data } = result as { data: Batch; retryCount: number };
      return data;
    },
  };
  
  
}