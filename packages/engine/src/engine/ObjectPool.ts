// ============================================================================
// Generic Object Pool — Reuse sprites, particles, labels
// ============================================================================

export class ObjectPool<T> {
  private available: T[] = []
  private active: Set<T> = new Set()
  private factory: () => T
  private resetFn: (item: T) => void

  constructor(factory: () => T, resetFn: (item: T) => void) {
    this.factory = factory
    this.resetFn = resetFn
  }

  preAllocate(count: number): void {
    for (let i = 0; i < count; i++) {
      this.available.push(this.factory())
    }
  }

  acquire(): T {
    let item: T
    if (this.available.length > 0) {
      item = this.available.pop()!
    } else {
      console.warn(
        `[ObjectPool] Pool exhausted (${this.active.size} active), creating new item`,
      )
      item = this.factory()
    }
    this.active.add(item)
    return item
  }

  release(item: T): void {
    if (this.active.delete(item)) {
      this.resetFn(item)
      this.available.push(item)
    }
  }

  get activeCount(): number {
    return this.active.size
  }

  get availableCount(): number {
    return this.available.length
  }

  releaseAll(): void {
    for (const item of this.active) {
      this.resetFn(item)
      this.available.push(item)
    }
    this.active.clear()
  }
}
