/**
 * LiteAI SDK - 图像理解示例 (视觉模型)
 * 使用多模态模型分析图片内容
 * 
 * 用法：
 *   npx ts-node examples/vision.ts [模型序号] [图片路径]
 *   npm run vision -- 1 examples/img.png
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, createLogger, imageFileToBase64, ChatMessage, ContentPart } from '../src';

// ========== 配置加载逻辑 (同 basic.ts，但筛选出支持视觉的模型) ==========
interface ModelConfig {
  id: string;
  name: string;
  stream?: boolean;
  vision?: boolean;          // 是否支持视觉
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

function getVisionModels(): { baseUrl: string; apiKey: string; model: ModelConfig }[] {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);
  const result: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(config.models.providers)) {
    for (const model of provider.models) {
      if (model.vision === true) {
        result.push({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model });
      }
    }
  }
  if (result.length === 0) throw new Error('没有配置任何支持视觉的模型（vision: true）');
  return result;
}

function getModelIndexFromArgs(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) return 1;
  const idx = parseInt(args[0], 10);
  return isNaN(idx) ? 1 : idx;
}

function getImagePathFromArgs(defaultPath?: string): string {
  const args = process.argv.slice(2);
  // 如果提供了两个参数，第二个是图片路径
  if (args.length >= 2) return args[1];
  // 否则使用默认路径
  if (defaultPath) return defaultPath;
  throw new Error('请提供图片路径: npm run vision -- 1 examples/img.png');
}

// ========== 日志配置 ==========
const logDir = path.join(__dirname, '../logs/vision');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

async function main() {
  try {
    const models = getVisionModels();
    const idx = getModelIndexFromArgs();
    if (idx < 1 || idx > models.length) throw new Error(`无效序号 ${idx}，共 ${models.length} 个视觉模型`);
    const { baseUrl, apiKey, model } = models[idx - 1];
    console.log(`使用视觉模型: ${model.name || model.id}`);
    console.log(`Base URL: ${baseUrl}`);

    const client = new LiteAI({
      apiKey,
      baseUrl,
      timeout: 180,
      maxRetries: 3,
      logFile: path.join(logDir, '{YYYYMMDD_HHMM}_vision.log'),
      logLevel: 10,
      consoleLog: true,
      logDetail: 2,
      rawLogger,
    });

    // 获取图片路径
    const defaultImagePath = path.join(__dirname, 'img.png');
    const imagePath = getImagePathFromArgs(defaultImagePath);
    if (!fs.existsSync(imagePath)) {
      console.error(`图片不存在: ${imagePath}`);
      return;
    }
    console.log(`图片路径: ${imagePath}`);

    const imageBase64 = await imageFileToBase64(imagePath);
    const imageUrl = imageBase64; // 或使用公网 URL

    // 构建多模态消息（使用类型断言解决 role 类型问题）
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '请描述这张图片的内容。' },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
        ] as ContentPart[]
      }
    ];

    console.log('\n=== 图像理解 ===');
    const response = await client.chat.completions.create({
      model: model.id,
      messages,
      max_tokens: 500,
      stream: false,
    }) as any;

    console.log('模型回复:', response.choices[0].message.content);
    if (response.usage) {
      console.log(`Token 使用: ${response.usage.total_tokens}`);
    }
  } catch (err) {
    console.error(err);
  }
}

main();