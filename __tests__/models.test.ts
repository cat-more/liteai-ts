import nock from 'nock';
import { LiteAI, ModelListResponse } from '../src';

describe('LiteAI Models', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const apiKey = 'test-key';

  it('should list models correctly', async () => {
    const mockResponse: ModelListResponse = {
      object: 'list',
      data: [
        {
          id: 'gpt-4',
          created: 1687880000,
          input_modalities: ['text'],
          output_modalities: ['text'],
          context_length: 8192,
          max_output_length: 4096,
        },
        {
          id: 'gpt-3.5-turbo',
          created: 1677610000,
          input_modalities: ['text'],
          output_modalities: ['text'],
          context_length: 4096,
          max_output_length: 4096,
        },
      ],
    };
    nock(baseUrl).get('/models').reply(200, mockResponse);
    const client = new LiteAI({ apiKey, baseUrl });
    const result = await client.models.list();
    expect(result.data.length).toBe(2);
    expect(result.data[0].id).toBe('gpt-4');
    expect(result.data[1].context_length).toBe(4096);
  });
});