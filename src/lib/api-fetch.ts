type ApiFetchOptions = RequestInit & {
  params?: Record<string, string>;
};

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
    const error = await res
      .json()
      .catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? "API error");
  }

  return res.json() as Promise<T>;
}
