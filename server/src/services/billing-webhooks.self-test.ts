import assert from "node:assert/strict";
import { creditRefundReversal, normalizePolarEvent } from "./billing-webhooks.js";

assert.deepEqual(creditRefundReversal(1_000, 0, 14_000), { desired: 7_000, reversal: 7_000, unused: 7_000, debt: 0 });
assert.deepEqual(creditRefundReversal(2_000, 0, 3_000), { desired: 14_000, reversal: 14_000, unused: 3_000, debt: 11_000 });
assert.deepEqual(creditRefundReversal(2_000, 7_000, 3_000), { desired: 14_000, reversal: 7_000, unused: 3_000, debt: 4_000 });

const event = normalizePolarEvent({
  type: "order.paid", timestamp: "2026-09-15T10:00:00Z",
  data: { id: "order_1", productId: "product_1", totalAmount: 2_000, card: { number: "never-store" }, customer: { id: "customer_1", externalId: "user_1", email: "private@example.com" } },
});
assert.equal(event.userId, "user_1");
assert.equal(event.amountCents, 2_000);
assert.equal(event.dispute, false);
assert.equal("card" in event, false);
assert.equal("email" in event, false);

const customerState = normalizePolarEvent({
  type: "customer.state_changed", timestamp: new Date("2026-09-15T10:00:00Z"),
  data: { id: "customer_1", externalId: "user_1", activeSubscriptions: [] },
});
assert.equal(customerState.userId, "user_1");
assert.equal(customerState.customerId, "customer_1");

console.log("billing webhook normalization self-test passed");
