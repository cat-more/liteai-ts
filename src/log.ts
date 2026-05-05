/**
 * 日志模块 - 模拟 Python logging，支持分级输出、文件写入、时间占位符
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger, LogDetail, LogMode } from './types';

export interface LoggerOptions {
  logFile?: string;
  logLevel?: number;          // 10=DEBUG,20=INFO,30=WARN,40=ERROR
  logMode?: LogMode;          // 'single' | 'daily' | 'append'
  consoleLog?: boolean;
  logDetail?: LogDetail;
}

/**
 * 根据占位符生成当前时间的格式化字符串
 */
function formatTimePlaceholder(placeholder: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  switch (placeholder) {
    case '{YYYYMMDD_HHMMSS}':
      return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    case '{YYYYMMDD_HHMM}':
      return `${year}${month}${day}_${hours}${minutes}`;
    case '{YYYYMMDD}':
      return `${year}${month}${day}`;
    case '{HHMMSS}':
      return `${hours}${minutes}${seconds}`;
    case '{HHMM}':
      return `${hours}${minutes}`;
    default:
      return placeholder; // 未知占位符保留原样
  }
}

/**
 * 替换文件路径中的时间占位符
 */
function replaceTimePlaceholders(filePath: string): string {
  let result = filePath;
  const placeholders = [
    '{YYYYMMDD_HHMMSS}',
    '{YYYYMMDD_HHMM}',
    '{YYYYMMDD}',
    '{HHMMSS}',
    '{HHMM}',
  ];
  for (const ph of placeholders) {
    if (result.includes(ph)) {
      result = result.replace(ph, formatTimePlaceholder(ph));
    }
  }
  return result;
}

/**
 * 生成时间戳后缀（用于 single/daily 模式）
 */
function getTimeSuffix(mode: 'single' | 'daily'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  if (mode === 'daily') {
    return `_${year}${month}${day}`;
  } else { // single
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `_${year}${month}${day}_${hours}${minutes}${seconds}`;
  }
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createLogger(options: LoggerOptions): Logger & { getLogFile?: () => string | undefined } {
  const {
    logFile,
    logLevel = 30,
    logMode = 'single',
    consoleLog = false,
    logDetail = 2,
  } = options;

  let actualLogFile: string | undefined;

  if (logFile) {
    let finalPath = logFile;
    // 1. 如果包含占位符且不是 append 模式，替换占位符
    if (logMode !== 'append' && logFile.includes('{') && logFile.includes('}')) {
      finalPath = replaceTimePlaceholders(logFile);
    } else {
      // 2. 否则根据 logMode 添加后缀
      const dir = path.dirname(finalPath);
      const ext = path.extname(finalPath);
      const baseName = path.basename(finalPath, ext);
      let suffix = '';
      if (logMode === 'single') {
        suffix = getTimeSuffix('single');
      } else if (logMode === 'daily') {
        suffix = getTimeSuffix('daily');
      } // append 模式不添加后缀
      finalPath = path.join(dir, `${baseName}${suffix}${ext}`);
    }
    ensureDir(path.dirname(finalPath));
    actualLogFile = finalPath;
    // 输出实际日志文件路径，便于用户定位
    console.log(`[LiteAI Logger] 日志文件将写入: ${actualLogFile}`);
  }

  const levelValue = (level: number): number => {
    if (level <= 10) return 10;
    if (level <= 20) return 20;
    if (level <= 30) return 30;
    return 40;
  };
  const currentLevel = levelValue(logLevel);

  const writeToFile = (level: string, msg: string) => {
    if (!actualLogFile) return;
    const line = `[${new Date().toISOString()}] ${level}: ${msg}\n`;
    try {
      fs.appendFileSync(actualLogFile, line, 'utf8');
    } catch (err) {
      console.error(`[LiteAI Logger] 写入日志文件失败: ${actualLogFile}`, err);
    }
  };

  const logMethod = (level: string, levelNum: number, args: any[]) => {
    if (levelNum < currentLevel) return;
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (consoleLog) {
      console.log(`[${level}] ${msg}`);
    }
    writeToFile(level, msg);
  };

  const logger: Logger & { getLogFile?: () => string | undefined } = {
    debug: (...args) => logMethod('DEBUG', 10, args),
    info: (...args) => logMethod('INFO', 20, args),
    warn: (...args) => logMethod('WARN', 30, args),
    error: (...args) => logMethod('ERROR', 40, args),
    setLevel: () => {},
  };

  if (actualLogFile) {
    logger.getLogFile = () => actualLogFile;
  }

  return logger;
}

export function createNullLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    setLevel: () => {},
  };
}