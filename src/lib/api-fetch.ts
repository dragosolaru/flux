type ApiFetchOptions = RequestInit & {
  params?: Record<string, string>;
};

/**
 * An error that kept the status and the API's error code.
 *
 * apiFetch used to throw a bare Error carrying only `message`, so a caller
 * could not tell a 412 from a 502 — and routes that answer with `code` and
 * `result` rather than `message` (the Vehicle Command Protocol 412 is one)
 * produced the literal string "API error". Every precondition failure on the
 * map therefore showed the generic share-failed toast, whatever went wrong.
 *
 * Extends Error, so the many `err instanceof Error ? err.message` call sites
 * keep working untouched.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  url: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const fullUrl = params ? `${url}?${new URLSearchParams(params)}` : url;

  const res = await fetch(fullUrl, {
    headers: { "Content-Type": "application/json", ...fetchOptions.headers },
    ...fetchOptions,
  });

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
      await new Promise(() => {});
    }
    const error = (await res
      .json()
      .catch(() => ({ message: res.statusText }))) as {
      message?: string;
      result?: string;
      code?: string;
    };
    // `result` as a fallback: the command routes report their failure there.
    //
    // `||` rather than `??`, and the status appended, because HTTP/2 carries no
    // reason phrase — `statusText` is the empty string for every response Vercel
    // serves. With `??` that empty string won a coalescing chain whose only
    // purpose was to avoid an empty message, so any error without a JSON body
    // (a 504 from an exceeded function timeout, most of all) arrived at the UI
    // as "". Callers doing `msg || t("some_guess")` then displayed a guess as
    // though it were a diagnosis.
    const detail = error.message || error.result || res.statusText;
    throw new ApiError(
      detail ? `${detail} (${res.status})` : `Request failed (${res.status})`,
      res.status,
      error.code,
    );
  }

  return res.json() as Promise<T>;
}
