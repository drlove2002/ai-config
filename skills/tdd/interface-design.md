# Interface Design for Testability

Good interfaces make testing natural:

1. **Accept dependencies, don't create them**

   ```text
   // Testable
   process_order(order, payment_gateway)

   // Hard to test
   process_order(order)
     gateway = new_payment_gateway_from_environment()
   ```

2. **Return results, don't produce side effects**

   ```text
   // Testable
   calculate_discount(cart) -> discount

   // Hard to test
   apply_discount(cart)
     cart.total = cart.total - discount
   ```

3. **Small surface area**
   - Fewer methods = fewer tests needed
   - Fewer params = simpler test setup
