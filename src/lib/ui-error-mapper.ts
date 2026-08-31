/**
 * BiliProfile Analyzer — Phase 7.1.1: Frontend Safe UI Error Mapping
 *
 * Maps HTTP status codes and known business error codes to fixed, user-friendly Chinese messages.
 * Prevents raw server errors, stacks, or dynamic database strings from leaking to the UI or console.
 */

export interface SafeUiError {
  code: string;
  message: string;
  isConsentRequired?: boolean;
}

/**
 * Maps HTTP response status and optional error code to a safe, controlled message.
 */
export function mapHttpErrorToSafeMessage(
  status: number,
  businessCode?: string | null
): SafeUiError {
  if (status === 400) {
    if (businessCode === "SELF_PROVIDED_CONSENT_REQUIRED") {
      return {
        code: "SELF_PROVIDED_CONSENT_REQUIRED",
        message: "检测到你已填写个人自述信息，请勾选授权确认框，或前往设置页面调整自述信息。",
        isConsentRequired: true,
      };
    }
    return {
      code: businessCode || "BAD_REQUEST",
      message: "输入信息有误，请检查后重试。",
    };
  }

  if (status === 404) {
    return {
      code: "NOT_FOUND",
      message: "请求的任务或资料不存在，可能已被删除。",
    };
  }

  if (status === 409) {
    return {
      code: "CONFLICT",
      message: "当前数据状态已变化，请刷新后重试。",
    };
  }

  if (status === 422) {
    return {
      code: "UNPROCESSABLE_ENTITY",
      message: "数据未通过安全校验，操作已中止。",
    };
  }

  return {
    code: "SERVER_ERROR",
    message: "操作暂时未完成，请稍后重试。",
  };
}

/**
 * Maps generic client-side exceptions (fetch failures, network errors) to a safe message.
 * Returns null if the error is an AbortError (deliberately cancelled).
 */
export function mapNetworkErrorToSafeMessage(err: unknown): SafeUiError | null {
  if (err && typeof err === "object" && "name" in err && (err as Error).name === "AbortError") {
    return null;
  }
  return {
    code: "NETWORK_ERROR",
    message: "操作暂时未完成，请稍后重试。",
  };
}
