export async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
