/**
 * Logger utility for Mage Hand module
 * Provides configurable log levels to control console output
 */

export class Logger {
  static LEVELS = {
    DEBUG: 0,    // Everything, including detailed debugging info
    VERBOSE: 1,  // Detailed operational info
    INFO: 2,     // Important events and state changes
    WARNING: 3,  // Warnings only
    ERROR: 4,    // Errors only
    NONE: 5      // No logging
  };

  static LEVEL_NAMES = {
    0: 'DEBUG',
    1: 'VERBOSE',
    2: 'INFO',
    3: 'WARNING',
    4: 'ERROR',
    5: 'NONE'
  };

  constructor(moduleId = 'mage-hand') {
    this.moduleId = moduleId;
    this.prefix = `Mage Hand |`;
  }

  /**
   * Get current log level from settings
   */
  getLevel() {
    try {
      const level = game.settings?.get(this.moduleId, 'logLevel');
      return level !== undefined ? level : Logger.LEVELS.INFO;
    } catch {
      // Settings not available yet, use default
      return Logger.LEVELS.INFO;
    }
  }

  /**
   * Check if a message at given level should be logged
   */
  shouldLog(level) {
    return level >= this.getLevel();
  }

  /**
   * Format a log message with prefix
   */
  formatMessage(level, ...args) {
    const levelName = Logger.LEVEL_NAMES[level] || 'LOG';
    return [`${this.prefix} [${levelName}]`, ...args];
  }

  /**
   * Debug level - detailed debugging information
   */
  debug(...args) {
    if (this.shouldLog(Logger.LEVELS.DEBUG)) {
      console.log(...this.formatMessage(Logger.LEVELS.DEBUG, ...args));
    }
  }

  /**
   * Verbose level - detailed operational information
   */
  verbose(...args) {
    if (this.shouldLog(Logger.LEVELS.VERBOSE)) {
      console.log(...this.formatMessage(Logger.LEVELS.VERBOSE, ...args));
    }
  }

  /**
   * Info level - important events and state changes
   */
  info(...args) {
    if (this.shouldLog(Logger.LEVELS.INFO)) {
      console.log(...this.formatMessage(Logger.LEVELS.INFO, ...args));
    }
  }

  /**
   * Warning level - warnings and potential issues
   */
  warn(...args) {
    if (this.shouldLog(Logger.LEVELS.WARNING)) {
      console.warn(...this.formatMessage(Logger.LEVELS.WARNING, ...args));
    }
  }

  /**
   * Error level - errors and critical issues
   */
  error(...args) {
    if (this.shouldLog(Logger.LEVELS.ERROR)) {
      console.error(...this.formatMessage(Logger.LEVELS.ERROR, ...args));
    }
  }

  /**
   * Always log - bypasses level check (use sparingly)
   */
  always(...args) {
    console.log(this.prefix, ...args);
  }

  /**
   * Log at a specific level
   */
  log(level, ...args) {
    if (this.shouldLog(level)) {
      const method = level >= Logger.LEVELS.ERROR ? 'error' : 
                     level >= Logger.LEVELS.WARNING ? 'warn' : 'log';
      console[method](...this.formatMessage(level, ...args));
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context) {
    const childLogger = new Logger(this.moduleId);
    childLogger.prefix = `${this.prefix} [${context}]`;
    return childLogger;
  }
}

// Export singleton instance
export const logger = new Logger('mage-hand');