export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    const onData = (chunk: Buffer | string) => {
      input += chunk.toString();
    };
    const onEnd = () => {
      cleanup();
      resolve(input);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}

export async function resolveTextFromStdinOption(
  inlineValue: string | undefined,
  options: { stdin?: boolean },
  missingMessage: string,
  conflictMessage = "Use either an inline value or --stdin, not both.",
): Promise<string> {
  if (inlineValue !== undefined && options.stdin) {
    throw new Error(conflictMessage);
  }

  if (options.stdin || (inlineValue === undefined && !process.stdin.isTTY)) {
    return readStdin();
  }

  if (inlineValue === undefined) {
    throw new Error(missingMessage);
  }

  return inlineValue;
}
