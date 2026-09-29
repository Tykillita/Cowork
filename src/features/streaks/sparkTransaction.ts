import { runTransaction, type Firestore, type Transaction } from "firebase/firestore";

/**
 * A competing commit may make a getAfter invariant fail before Firestore
 * returns an ABORTED conflict. Re-read inside a fresh, bounded transaction.
 * Every attempt still passes exactly the same Security Rules.
 */
export async function ledgerTransaction<T>(db: Firestore, operation: (transaction: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await runTransaction(db, operation, { maxAttempts: 8 }); }
    catch (error) {
      if ((error as { code?: string }).code !== "permission-denied" || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1) + Math.random() * 70));
    }
  }
}
