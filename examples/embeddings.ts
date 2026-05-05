/**
 * LiteAI SDK - 文本嵌入示例
 * 使用支持嵌入的模型（如 text-embedding-ada-002）
 * 
 * 用法：
 *   npx ts-node examples/embeddings.ts [模型序号] ["要嵌入的文本"]
 *   npm run embeddings -- 1 "Hello world"
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger, EmbeddingResponse } from '../src';

// ========== 配置加载（与 basic.ts 一致） ==========
interface ModelConfig {
  id: string;
  name: string;
  embedding?: boolean;        // 是否支持嵌入（可选，用于过滤）
  [key: string]: any;
}

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
}

interface ModelsJson {
  models: { providers: Record<string, ProviderConfig> };
}

/**
 * 获取所有模型（或仅获取支持嵌入的模型）
 * 若 models.json 中未标记 embedding: true，则返回所有模型
 */
function getEmbeddingModels(onlyEmbedding: boolean = false): { baseUrl: string; apiKey: string; model: ModelConfig }[] {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);
  
  const result: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(config.models.providers)) {
    for (const model of provider.models) {
      if (onlyEmbedding && model.embedding !== true) continue;
      result.push({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model });
    }
  }
  if (result.length === 0) throw new Error('没有找到任何支持嵌入的模型（可设置 embedding: true 或关闭 onlyEmbedding）');
  return result;
}

function getArgs(): { index: number; text: string } {
  const args = process.argv.slice(2);
  let index = 1;
  let text = 'Hello world, this is a test sentence.';

  if (args.length >= 1) index = parseInt(args[0], 10) || 1;
  if (args.length >= 2) text = args[1];
  return { index, text };
}

// ========== 日志配置 ==========
const logDir = path.join(__dirname, '../logs/embeddings');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

async function main() {
  try {
    // 1. 获取模型列表（若需仅嵌入模型，改为 true）
    const models = getEmbeddingModels(true);  // false 表示不强制过滤，使用所有模型
    const { index, text } = getArgs();
    if (index < 1 || index > models.length) throw new Error(`无效序号 ${index}，共 ${models.length} 个模型`);
    const { baseUrl, apiKey, model } = models[index - 1];
    
    console.log(`使用嵌入模型: ${model.name || model.id}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`输入文本: ${text}`);

    // 2. 创建客户端（开启 INFO 日志）
    const client = new LiteAI({
      apiKey,
      baseUrl,
      timeout: 60,
      maxRetries: 3,
      logFile: path.join(logDir, '{YYYYMMDD_HHMM}_embeddings.log'),
      logLevel: 10,      // INFO
      consoleLog: true,
      logDetail: 2,
      rawLogger,
      // statsCollector: 可选，如需统计可引入
    });

    // 3. 调用嵌入接口
    console.log('\n=== 生成嵌入向量 ===');
    const response = await client.embeddings.create({
      model: model.id,
      input: text,
      text_type: 'document',
      multimodal: model.multimodal === true,   // 从配置文件读取标记
    });

    console.log(`嵌入向量维度: ${response.data[0].embedding.length}`);
    console.log(`Token 使用: prompt=${response.usage.prompt_tokens}, total=${response.usage.total_tokens}`);
    if (response.data[0].embedding.length <= 10) {
      console.log(`向量示例: ${JSON.stringify(response.data[0].embedding)}`);
    } else {
      console.log(`向量前5个值: ${response.data[0].embedding.slice(0, 5)}`);
    }
  } catch (err) {
    console.error('嵌入请求失败:', err);
  }
}

main();