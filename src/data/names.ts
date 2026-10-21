/** "Virat Kohli" -> "V Kohli". Keeps single-word names as they are. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/)
  if (parts.length < 2) return full
  const last = parts.pop() as string
  return `${parts.map((w) => w[0]).join('')} ${last}`
}
