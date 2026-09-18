/**
 * Upload constants shared by the browser and the server.
 *
 * Deliberately free of server-only imports: the file input needs the accept
 * list, and the extraction code that reads the bytes must never be pulled into
 * a client bundle alongside it.
 */

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const;

export const ACCEPT_ATTRIBUTE =
  ".pdf,.docx,.txt,.md,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "text/plain,text/markdown";
