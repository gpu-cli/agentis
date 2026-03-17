export function mergeFiles(current: File[], incoming: File[]): File[] {
  const byName = new Map<string, File>()
  current.forEach((file) => {
    byName.set(file.name, file)
  })
  incoming.forEach((file) => {
    byName.set(file.name, file)
  })
  return [...byName.values()]
}
