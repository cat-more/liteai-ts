import nock from 'nock';
import { LiteAI, ChatCompletionResponse } from '../src';

describe('LiteAI SDK - Retry & Error Handling', () => {
  afterEach(() => nock.cleanAll());

  it('should retry once on 429 and succeed', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(429, { error: 'rate limit' });
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'Success after retry' } }],
      });

    const client = new LiteAI({ apiKey: 'test', maxRetries: 1 });
    const resp = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    }) as ChatCompletionResponse;

    expect(resp.choices[0].message.content).toBe('Success after retry');
  });

  it('should retry on network error', async () => {
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .replyWithError('ECONNRESET');
    nock('https://api.openai.com')
      .post('/v1/chat/completions')
      .reply(200, {
        choices: [{ message: { content: 'Recovered' } }],
      });

    const client = new LiteAI({ apiKey: 'test', maxRetries: 1 });
    const resp = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'hello' }],
      stream: false,
    }) as ChatCompletionResponse;

    expect(resp.choices[0].message.content).toBe('Recovered');
  });
});