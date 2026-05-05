/**
 * LiteAI SDK - 图像生成示例（支持自动目录/文件处理）
 * 
 * 用法：
 *   npm run image-gen -- 1 "一只穿着宇航服的猫"                     # 保存到 ./myimages/generated_xxx.png
 *   npm run image-gen -- 1 "一只猫" ./myimages/cat.png            # 保存到指定文件
 *   npm run image-gen -- 1 "一只猫" ./myimages/                   # 保存到目录，自动命名
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { LiteAI, createLogger, ImageGenerationParams } from '../src';

interface ModelConfig {
  id: string;
  name: string;
  generation?: boolean;
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

function getGenerationModels(): { baseUrl: string; apiKey: string; model: ModelConfig }[] {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const content = fs.readFileSync(configPath, 'utf-8');
  const config: ModelsJson = JSON.parse(content);
  const result: { baseUrl: string; apiKey: string; model: ModelConfig }[] = [];
  for (const provider of Object.values(config.models.providers)) {
    for (const model of provider.models) {
      if (model.generation === true) {
        result.push({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model });
      }
    }
  }
  if (result.length === 0) throw new Error('没有配置任何支持图像生成的模型（generation: true）');
  return result;
}

function getArgs(): { index: number; prompt: string; outputPath: string } {
  const args = process.argv.slice(2);
  let index = 1;
  let prompt = '一只可爱的橘猫在阳光下睡觉，卡通风格';
  let outputPath = '';
  if (args.length >= 1) index = parseInt(args[0], 10) || 1;
  if (args.length >= 2) prompt = args[1];
  if (args.length >= 3) outputPath = args[2];
  if (outputPath === '') outputPath = './myimages/';
  return { index, prompt, outputPath };
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function downloadUrl(url: string, timeout: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    const req = protocol.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error(`Download timeout after ${timeout / 1000} seconds`));
    });
  });
}

const logDir = path.join(__dirname, '../logs/generation');
ensureDir(logDir);
const rawLogger = createLogger({
  logFile: path.join(logDir, '{YYYYMMDD_HHMMSS}_raw.log'),
  logLevel: 10,
  consoleLog: false,
  logDetail: 3,
});

async function main() {
  try {
    const models = getGenerationModels();
    const { index, prompt, outputPath } = getArgs();
    if (index < 1 || index > models.length) throw new Error(`无效序号 ${index}，共 ${models.length} 个生成模型`);
    const { baseUrl, apiKey, model } = models[index - 1];
    console.log(`使用生成模型: ${model.name || model.id}`);
    console.log(`提示词: ${prompt}`);
    console.log(`输出路径: ${outputPath}`);

    const client = new LiteAI({
      apiKey,
      baseUrl,
      timeout: 120,
      maxRetries: 2,
      logFile: path.join(logDir, '{YYYYMMDD_HHMM}_gen.log'),
      logLevel: 10,
      consoleLog: true,
      logDetail: 2,
      rawLogger,
    });

    const params: ImageGenerationParams = {
      model: model.id,
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    };

    console.log('\n=== 图像生成 ===');
    const result = await client.images.generate(params);
    const item = result.data[0];
    let fileBuffer: Buffer | null = null;
    let ext = 'png';

    if (item.b64_json) {
      fileBuffer = Buffer.from(item.b64_json, 'base64');
      ext = 'png';
    } else if (item.url) {
      console.log(`图片 URL: ${item.url}，正在下载...`);
      fileBuffer = await downloadUrl(item.url, client['timeout'] * 1000);
      const urlPath = new URL(item.url).pathname;
      const maybeExt = path.extname(urlPath).toLowerCase().slice(1);
      if (['png', 'jpg', 'jpeg', 'webp'].includes(maybeExt)) ext = maybeExt;
    }

    if (!fileBuffer) {
      console.error('未获得图片数据');
      return;
    }

    // 确定最终保存路径
    let finalPath: string;
    const parsed = path.parse(outputPath);
    if (parsed.ext === '') {
      const dir = outputPath.replace(/[/\\]$/, '');
      ensureDir(dir);
      finalPath = path.join(dir, `generated_${Date.now()}.${ext}`);
    } else {
      ensureDir(path.dirname(outputPath));
      finalPath = outputPath;
      if (!finalPath.match(/\.(png|jpg|jpeg|webp)$/i)) finalPath += `.${ext}`;
    }

    fs.writeFileSync(finalPath, fileBuffer);
    console.log(`图片已保存到: ${finalPath} (${fileBuffer.length} 字节)`);
    if (item.revised_prompt) console.log(`修订后的提示词: ${item.revised_prompt}`);
  } catch (err) {
    console.error(err);
  }
}

main();