import nock from 'nock';
import { LiteAI } from '../src';

describe('LiteAI - 5 modules integration (nock)', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const apiKey = 'test-key';

  afterEach(() => nock.cleanAll());

  // 1. 聊天补全（非流式）
  it('should call chat completions with correct request', async () => {
    const client = new LiteAI({ apiKey, baseUrl });
    const modelId = 'gpt-3.5-turbo';

    const mockResponse = {
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: modelId,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
    };

    const scope = nock(baseUrl)
      .post('/chat/completions', (body) => {
        expect(body.model).toBe(modelId);
        expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
        expect(body.stream).toBe(false);
        return true;
      })
      .reply(200, mockResponse);

    const result = await client.chat.completions.create({
      model: modelId,
      messages: [{ role: 'user', content: 'Hi' }],
      stream: false,
    }) as any;

    expect(result.choices[0].message.content).toBe('Hello!');
    scope.done();
  });

  // 2. 嵌入
  it('should call embeddings with correct request', async () => {
    const client = new LiteAI({ apiKey, baseUrl });
    const modelId = 'text-embedding-ada-002';

    const mockResponse = {
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
      model: modelId,
      usage: { prompt_tokens: 10, total_tokens: 10 },
    };

    const scope = nock(baseUrl)
      .post('/embeddings', (body) => {
        expect(body.model).toBe(modelId);
        expect(body.input).toBe('test text');
        return true;
      })
      .reply(200, mockResponse);

    const result = await client.embeddings.create({
      model: modelId,
      input: 'test text',
    });

    expect(result.data[0].embedding).toEqual([0.1, 0.2]);
    scope.done();
  });

  // 3. 图像生成（OpenAI 标准）
  it('should call image generation with correct request', async () => {
    const client = new LiteAI({ apiKey, baseUrl });
    const modelId = 'dall-e-3';

    const mockResponse = {
      created: Date.now(),
      data: [{ url: 'https://example.com/image.png' }],
    };

    const scope = nock(baseUrl)
      .post('/images/generations', (body) => {
        expect(body.model).toBe(modelId);
        expect(body.prompt).toBe('a cat');
        expect(body.n).toBe(1);
        return true;
      })
      .reply(200, mockResponse);

    const result = await client.images.generate({
      model: modelId,
      prompt: 'a cat',
      n: 1,
    });

    expect(result.data[0].url).toBe('https://example.com/image.png');
    scope.done();
  });

  // 4. 文本转语音（OpenAI 标准）
  it('should call TTS with correct request', async () => {
    const client = new LiteAI({ apiKey, baseUrl });
    const modelId = 'tts-1';

    const audioBuffer = Buffer.from('fake audio data');
    const scope = nock(baseUrl)
      .post('/audio/speech', (body) => {
        expect(body.model).toBe(modelId);
        expect(body.input).toBe('Hello world');
        expect(body.voice).toBe('alloy');
        return true;
      })
      .reply(200, audioBuffer, { 'Content-Type': 'audio/mpeg' });

    const result = await client.audio.speech.create({
      model: modelId,
      input: 'Hello world',
      voice: 'alloy',
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('fake audio data');
    scope.done();
  });

  // 5. 视觉（多模态补全）
  it('should call vision chat completions with image_url', async () => {
    const client = new LiteAI({ apiKey, baseUrl });
    const modelId = 'gpt-4-vision-preview';

    const mockResponse = {
      id: 'vis-id',
      object: 'chat.completion',
      created: Date.now(),
      model: modelId,
      choices: [{ index: 0, message: { role: 'assistant', content: 'A cat' }, finish_reason: 'stop' }],
    };

    const scope = nock(baseUrl)
      .post('/chat/completions', (body) => {
        expect(body.model).toBe(modelId);
        expect(body.messages[0].content[0].type).toBe('text');
        expect(body.messages[0].content[1].type).toBe('image_url');
        expect(body.messages[0].content[1].image_url.url).toBe('data:image/png;base64,xxx');
        return true;
      })
      .reply(200, mockResponse);

    const result = await client.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,xxx' } },
          ],
        },
      ],
      stream: false,
    }) as any;

    expect(result.choices[0].message.content).toBe('A cat');
    scope.done();
  });
});