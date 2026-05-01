# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes - prefer test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```text
// Easy to mock
process_payment(order, payment_client)
  return payment_client.charge(order.total)

// Hard to mock
process_payment(order)
  client = new_payment_client_from_environment()
  return client.charge(order.total)
```

**2. Prefer SDK-style interfaces over generic fetchers**

Create specific functions for each external operation instead of one generic function with conditional logic:

```text
// GOOD: Each operation is independently mockable
user_client.get_user(id)
order_client.get_orders(user_id)
order_client.create_order(data)

// BAD: Mocking requires conditional logic inside the mock
generic_http_client.request(endpoint, options)
```

The SDK approach means:
- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which endpoints a test exercises
- Type safety per endpoint
