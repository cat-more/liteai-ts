/**
 * LiteAI SDK TypeScript 使用示例
 * 从 models.json 中读取指定序号的模型配置（默认第一个），进行非流式和流式调用
 * 开启 DEBUG 日志、原始日志、统计收集器
 * 
 * 用法：
 *   npm run example           # 使用第一个模型
 *   npm run example -- 2      # 使用第二个模型
 *   ts-node examples/basic.ts 3   # 使用第三个模型
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, SimpleStatsCollector, createLogger } from '../src';

// 定义 models.json 的类型（简化）
interface ModelConfig {
  id: string;
  name: string;
  stream?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  [key: string]: any;
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
}

interface ModelsJson {
  models: {
    providers: Record<string, ProviderConfig>;
  };
  teach?: any;
}

/**
 * 从 models.json 中读取指定序号的模型配置（序号从 1 开始）
 * @param index 模型序号（1-based），默认为 1
 */
function getModelConfigByIndex(index: number = 1): { baseUrl: string; apiKey: string; model: ModelConfig } {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);

  const providers = config.models?.providers;
  if (!providers) {
    throw new Error('models.json 中缺少 models.providers 节点');
  }

  // 收集所有模型（展平）
  const allModels: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(providers)) {
    for (const model of provider.models) {
      allModels.push({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model,
      });
    }
  }

  if (allModels.length === 0) {
    throw new Error('没有配置任何模型');
  }

  if (index < 1 || index > allModels.length) {
    throw new Error(`模型序号 ${index} 无效，共 ${allModels.length} 个模型，请输入 1-${allModels.length} 之间的序号`);
  }

  return allModels[index - 1];
}

/**
 * 解析命令行参数，获取模型序号
 */
function getModelIndexFromArgs(): number {
  // 获取命令行参数（忽略 node 和脚本路径）
  const args = process.argv.slice(2);
  if (args.length === 0) return 1;
  const idx = parseInt(args[0], 10);
  if (isNaN(idx)) {
    console.warn(`无效的参数 "${args[0]}"，将使用默认的第一个模型。`);
    return 1;
  }
  return idx;
}

/**
 * 创建日志目录
 */
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
  console.log(`创建日志目录: ${logDir}`);
}

// 创建原始日志记录器（记录完整 HTTP 报文）
const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10, // DEBUG
  consoleLog: false,
  logDetail: 3, // 完整记录
});
console.log(`原始日志模板: ${path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log')}`);

// 创建统计收集器
const statsCollector = new SimpleStatsCollector();

async function main() {
  try {
    // 1. 获取模型序号参数
    const modelIndex = getModelIndexFromArgs();
    console.log(`使用模型序号: ${modelIndex}`);

    // 2. 读取配置
    const { baseUrl, apiKey, model } = getModelConfigByIndex(modelIndex);
    console.log(`使用模型: ${model.name || model.id}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Stream 支持: ${model.stream !== false}`);

    // 业务日志文件路径（时间在前）
    const bizLogTemplate = path.join(logDir, '{YYYYMMDD_HHMM}_liteai.log');
    console.log(`业务日志模板: ${bizLogTemplate}`);

    // 3. 创建 LiteAI 客户端
    const client = new LiteAI({
      apiKey: apiKey,
      baseUrl: baseUrl,
      timeout: 180,
      maxRetries: 6,
      backoffFactor: 1.5,
      logFile: bizLogTemplate,
      logLevel: 10,
      consoleLog: true,
      logDetail: 2,
      rawLogger: rawLogger,
      statsCollector: statsCollector,
    });

    // 4. 非流式调用
    console.log('\n=== 非流式调用 ===');
    const startNonStream = Date.now();
    const response = await client.chat.completions.create({
      model: model.id,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: '请用一句话介绍你自己。' }
      ],
      stream: false,
      max_tokens: 100,
    }) as any;

    const duration = Date.now() - startNonStream;
    console.log(`回答: ${response.choices[0].message.content}`);
    if (response.usage) {
      console.log(`Token 使用: prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}, total=${response.usage.total_tokens}`);
    }
    console.log(`非流式耗时: ${duration}ms`);

    // 5. 流式调用（如果支持）
    if (model.stream !== false) {
      console.log('\n=== 流式调用 ===');
      const stream = await client.chat.completions.create({
        model: model.id,
        messages: [
          { role: 'user', content: '从1数到5，用逗号分隔。' }
        ],
        stream: true,
        max_tokens: 200,
      }) as AsyncIterable<any>;

      process.stdout.write('流式输出: ');
      let first = true;
      let chunkCount = 0;
      const startStream = Date.now();
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          process.stdout.write(content);
          chunkCount++;
          if (first) {
            console.log(`\n首包延迟: ${Date.now() - startStream}ms`);
            first = false;
          }
        }
      }
      console.log(`\n流式输出完成，共 ${chunkCount} 个数据块，总耗时 ${Date.now() - startStream}ms`);
    } else {
      console.log('\n当前模型不支持流式输出，跳过流式测试。');
    }

    // 等待统计收集完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 6. 打印统计摘要
    statsCollector.printSummary();

    console.log('\n日志文件位置:', logDir);
    console.log('- 业务日志: 文件名格式为 {YYYYMMDD_HHMM}_liteai.log');
    console.log('- 原始日志: 文件名格式为 {YYYYMMDD_HHMMSS}_raw.log');
  } catch (error) {
    console.error('运行失败:', error);
    process.exit(1);
  }
}

main();