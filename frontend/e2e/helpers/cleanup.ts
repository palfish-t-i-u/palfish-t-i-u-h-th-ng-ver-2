// frontend/e2e/helpers/cleanup.ts
export class CleanupRegistry {
  private callbacks: Array<{ label: string; fn: () => Promise<void> }> = [];

  register(label: string, fn: () => Promise<void>): void {
    this.callbacks.push({ label, fn });
  }

  async runAll(): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    // Run in reverse order (LIFO — last created, first cleaned)
    for (const cb of [...this.callbacks].reverse()) {
      try {
        await cb.fn();
        success++;
        console.log(`  ✓ cleanup: ${cb.label}`);
      } catch (err) {
        failed++;
        console.warn(`  ✗ cleanup failed: ${cb.label}`, err);
      }
    }
    this.callbacks = [];
    console.log(`Cleanup complete: ${success} ok, ${failed} failed`);
    return { success, failed };
  }
}
