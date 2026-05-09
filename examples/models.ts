/**
 * LiteAI SDK - 获取模型列表示例
 * 从 models.json 中读取指定序号的模型配置，调用 /v1/models 接口列出可用模型
 * 
 * 注意：不是所有服务商都支持 /v1/models 端点（例如智谱 AI、阿里云 DashScope 不支持）。
 * 建议使用 OpenAI、SenseNova 等支持该接口的平台。
 * 
 * 用法：
 *   npm run models           # 使用第一个模型
 *   npm run models -- 2      # 使用第二个模型
 *   npm run models -- 2 gpt  # 可选过滤关键词
 */

import * as fs from 'fs';
import * as path from 'path';
import { LiteAI, ModelInfo } from '../src';

interface ModelConfig {
  id: string;
  name: string;
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

function getModelConfigByIndex(index: number = 1): { baseUrl: string; apiKey: string; model: ModelConfig } {
  const configPath = path.join(__dirname, '../models.json');
  if (!fs.existsSync(configPath)) throw new Error(`配置文件不存在: ${configPath}`);
  const config: ModelsJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const providers = config.models.providers;
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
  if (allModels.length === 0) throw new Error('没有配置任何模型');
  if (index < 1 || index > allModels.length) {
    throw new Error(`模型序号 ${index} 无效，共 ${allModels.length} 个模型，请输入 1-${allModels.length} 之间的序号`);
  }
  return allModels[index - 1];
}

async function main() {
  const args = process.argv.slice(2);
  let index = 1;
  if (args.length >= 1) index = parseInt(args[0], 10) || 1;
  const filterPattern = args[1] || '';

  try {
    const { baseUrl, apiKey, model: selectedModel } = getModelConfigByIndex(index);
    console.log(`使用模型 ${selectedModel.name || selectedModel.id} (${baseUrl}) 查询模型列表`);

    const client = new LiteAI({ apiKey, baseUrl, consoleLog: true, logLevel: 20 });
    const response = await client.models.list();

    // 安全检查：如果响应不标准，给出友好提示
    if (!response || !response.data || !Array.isArray(response.data)) {
      console.error('响应格式异常：服务商可能不支持 /v1/models 接口。请尝试更换为 OpenAI 或 SenseNova 等支持该接口的平台。');
      process.exit(1);
    }

    let models = response.data;
    if (filterPattern) {
      models = models.filter(m => m.id?.includes(filterPattern) || (m.name && m.name.includes(filterPattern)));
      console.log(`按 "${filterPattern}" 过滤后剩余 ${models.length} 个模型：\n`);
    } else {
      console.log(`共获取到 ${models.length} 个模型：\n`);
    }

    if (models.length === 0) {
      console.log('没有找到匹配的模型。');
      return;
    }

    models.forEach((model: ModelInfo) => {
      console.log(`ID: ${model.id}`);
      console.log(`  描述: ${model.description || '无'}`);
      console.log(`  上下文长度: ${model.context_length ?? '未知'}`);
      console.log(`  输入模态: ${model.input_modalities?.join(', ') || '无'}`);
      console.log(`  输出模态: ${model.output_modalities?.join(', ') || '无'}`);
      if (model.supported_features?.length) {
        console.log(`  支持特性: ${model.supported_features.join(', ')}`);
      }
      console.log('---');
    });
  } catch (err: any) {
    // 捕获 404 等错误，给出更友好的提示
    if (err.statusCode === 404) {
      console.error('当前服务商不支持 /v1/models 接口 (404 Not Found)。请更换为 OpenAI、SenseNova 等支持该接口的平台。');
    } else {
      console.error('获取模型列表失败:', err.message || err);
    }
    process.exit(1);
  }
}

main();