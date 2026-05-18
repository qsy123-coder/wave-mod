import "server-only";

type LogContext = Record<string, unknown>;

type Logger = {
  debug: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
};

const isProduction = process.env.NODE_ENV === "production";

function formatContext(context?: LogContext) {
  return context && Object.keys(context).length > 0 ? context : undefined;
}

export const logger: Logger = {
  debug(message, context) {
    if (!isProduction) {
      console.debug(message, formatContext(context));
    }
  },
  error(message, context) {
    console.error(message, formatContext(context));
  },
  info(message, context) {
    if (!isProduction) {
      console.info(message, formatContext(context));
    }
  },
  warn(message, context) {
    console.warn(message, formatContext(context));
  },
};
