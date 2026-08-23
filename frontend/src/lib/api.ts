async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? JSON.stringify(body)
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => fetch(path).then((r) => handle<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body?: unknown) =>
    fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  del: <T>(path: string) => fetch(path, { method: 'DELETE' }).then((r) => handle<T>(r)),
}
