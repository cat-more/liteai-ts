import nock from 'nock';
import { LiteAI, FileObject, FileListResponse, FileDeleteResponse } from '../src';

describe('LiteAI Files', () => {
  const baseUrl = 'https://api.openai.com/v1';
  const apiKey = 'test-key';
  let client: LiteAI;

  beforeEach(() => {
    client = new LiteAI({ apiKey, baseUrl });
  });

  afterEach(() => nock.cleanAll());

  it('should list files', async () => {
    const mockResponse: FileListResponse = {
      object: 'list',
      data: [
        { id: 'file-1', bytes: 123, created_at: Date.now(), filename: 'test.txt', object: 'file', purpose: 'assistants' },
      ],
    };
    nock(baseUrl).get('/files').reply(200, mockResponse);
    const result = await client.files.list();
    expect(result.data[0].id).toBe('file-1');
  });

  it('should upload a file (multipart)', async () => {
    const mockResponse: FileObject = {
      id: 'file-uploaded', bytes: 456, created_at: Date.now(), filename: 'test.txt', object: 'file', purpose: 'assistants',
    };
    nock(baseUrl)
      .post('/files')
      .reply(200, mockResponse);
    const result = await client.files.upload({ file: Buffer.from('test'), purpose: 'assistants', filename: 'test.txt' });
    expect(result.id).toBe('file-uploaded');
  });

  it('should retrieve file info', async () => {
    const mockResponse: FileObject = {
      id: 'file-1', bytes: 123, created_at: Date.now(), filename: 'test.txt', object: 'file', purpose: 'assistants',
    };
    nock(baseUrl).get('/files/file-1').reply(200, mockResponse);
    const result = await client.files.retrieve('file-1');
    expect(result.id).toBe('file-1');
  });

  it('should delete a file', async () => {
    const mockResponse: FileDeleteResponse = { id: 'file-1', object: 'file', deleted: true };
    nock(baseUrl).delete('/files/file-1').reply(200, mockResponse);
    const result = await client.files.delete('file-1');
    expect(result.deleted).toBe(true);
  });

  it('should download file content', async () => {
    const audioBuffer = Buffer.from('fake file content');
    nock(baseUrl).get('/files/file-1/content').reply(200, audioBuffer);
    const result = await client.files.content('file-1');
    expect(result).toEqual(audioBuffer);
  });
});