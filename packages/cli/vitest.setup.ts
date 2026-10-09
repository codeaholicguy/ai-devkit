// Keep the suite hermetic: a developer's live devkitd would otherwise stream
// real agent events into subscription-based tests (e.g. ConsoleContext).
process.env.AI_DEVKIT_NO_DAEMON = "1";
