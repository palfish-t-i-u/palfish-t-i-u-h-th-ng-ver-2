// frontend/e2e/helpers/manual-cleanup.ts
import { E2eApiClient } from "./api-client";

async function main() {
  console.log("=== E2E Manual Cleanup ===\n");
  const api = new E2eApiClient();

  // Clean payment requests
  console.log("Searching for [E2E-TEST] payment requests...");
  try {
    const prs = await api.findTestPaymentRequests();
    console.log(`Found ${prs.length} test PRs`);
    for (const pr of prs) {
      try {
        if (pr.state !== "cancelled") {
          await api.cancelPR(pr.id);
          console.log(`  Cancelled PR ${pr.id} (${pr.name})`);
        } else {
          console.log(`  Skipped PR ${pr.id} (already cancelled)`);
        }
      } catch (err) {
        console.warn(`  Failed to cancel PR ${pr.id}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to search PRs:", err);
  }

  // Clean ledger entries
  console.log("\nSearching for [E2E-TEST] ledger entries...");
  try {
    const entries = await api.findTestLedgerEntries();
    console.log(`Found ${entries.length} test entries`);
    for (const entry of entries) {
      try {
        await api.deleteLedgerEntry(entry.id);
        console.log(`  Deleted ledger ${entry.id} (${entry.ten_khach})`);
      } catch (err) {
        console.warn(`  Failed to delete ledger ${entry.id}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to search ledger:", err);
  }

  console.log("\n=== Cleanup done ===");
}

main().catch(console.error);
