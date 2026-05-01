# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```text
// GOOD: Tests observable behavior
test "user can checkout with valid cart"
  cart = create_cart()
  cart.add(product)
  result = checkout(cart, payment_method)
  expect result.status == "confirmed"
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```text
// BAD: Tests implementation details
test "checkout calls payment service process"
  payment_service = mock_internal_payment_service()
  checkout(cart, payment_method)
  expect payment_service.process was called with cart.total
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```text
// BAD: Bypasses interface to verify
test "create user saves to database"
  create_user({ name: "Alice" })
  row = database.query("SELECT * FROM users WHERE name = ?", ["Alice"])
  expect row exists

// GOOD: Verifies through interface
test "create user makes user retrievable"
  user = create_user({ name: "Alice" })
  retrieved = get_user(user.id)
  expect retrieved.name == "Alice"
```
