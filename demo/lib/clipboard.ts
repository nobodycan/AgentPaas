export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}

export interface LegacyCopyTextarea {
  value: string;
  style: Record<string, string> | CSSStyleDeclaration;
  setAttribute(name: string, value?: string): void;
  focus(): void;
  select(): void;
}

export interface LegacyCopyDocument {
  activeElement?: {
    focus(): void;
  } | null;
  body: {
    appendChild(element: LegacyCopyTextarea): unknown;
    removeChild(element: LegacyCopyTextarea): unknown;
  };
  createElement(tagName: "textarea"): LegacyCopyTextarea;
  execCommand(command: "copy"): boolean;
}

export interface CopyEndpointEnvironment {
  clipboard: ClipboardWriter | null;
  document: LegacyCopyDocument | null;
}

function browserEnvironment(): CopyEndpointEnvironment {
  return {
    clipboard:
      typeof navigator !== "undefined" && navigator.clipboard
        ? navigator.clipboard
        : null,
    document:
      typeof document !== "undefined"
        ? (document as unknown as LegacyCopyDocument)
        : null,
  };
}

export async function copyEndpoint(
  endpoint: string,
  environment: CopyEndpointEnvironment = browserEnvironment(),
): Promise<boolean> {
  if (!endpoint) {
    return false;
  }

  if (environment.clipboard) {
    try {
      await environment.clipboard.writeText(endpoint);
      return true;
    } catch {
      // Browsers can expose Clipboard API while denying it by policy.
    }
  }

  if (!environment.document) {
    return false;
  }

  const previouslyFocused = environment.document.activeElement;
  const textarea = environment.document.createElement("textarea");
  textarea.value = endpoint;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  environment.document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return environment.document.execCommand("copy");
  } catch {
    return false;
  } finally {
    try {
      environment.document.body.removeChild(textarea);
    } catch {
      // The copy result remains authoritative if external DOM code removed it.
    }
    try {
      previouslyFocused?.focus();
    } catch {
      // A detached prior element can reject focus without changing copy status.
    }
  }
}
