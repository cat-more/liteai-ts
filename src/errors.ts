/**
 * LiteAI 自定义异常
 */

export class LiteAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiteAIError';
  }
}

export class ConfigurationError extends LiteAIError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class APICallError extends LiteAIError {
  public statusCode: number;
  public responseText: string;

  constructor(statusCode: number, message: string, responseText: string = '') {
    super(`API 错误 ${statusCode}: ${message}`);
    this.name = 'APICallError';
    this.statusCode = statusCode;
    this.responseText = responseText;
  }
}

export class RetryExhausted extends LiteAIError {
  constructor(message: string) {
    super(message);
    this.name = 'RetryExhausted';
  }
}

export class SSEParseError extends LiteAIError {
  constructor(message: string) {
    super(message);
    this.name = 'SSEParseError';
  }
}