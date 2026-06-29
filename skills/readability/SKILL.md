---
name: readability
description: Examine and improve code holistically — structure, naming, readability, API design, performance, and file organization. Use when reviewing code before a pull request, cleaning up a messy module, making code production-ready, running the polish loop, or saying "make this readable", "principal review", "clean this up", "better structure", "refactor for readability", "improve performance", "fix API design".
---

# Readability

Write code reviewed by a principal engineer. Prioritize readability over brevity. See the whole system, not just the diff.

## Core Principle

Every line you write must answer: *can a senior engineer read this in one pass and understand what it does and why?*

That means:
- **Structure first**: read the whole file. Does it have one job? Are the functions in a logical order? Is the data flow obvious?
- **Names carry meaning**: a good name eliminates the need for a comment. A bad name guarantees confusion.
- **Comments explain *why*, not *what***: the code already says what. Comments justify non-obvious tradeoffs, edge cases, performance decisions, or ordering constraints.
- **Formatting is silent**: follow the language's standard formatter. No style debates.
- **Design is a visible surface**: every public function is a contract. Make contracts clear and narrow.
- **Performance is a property of the architecture**: fix algorithms, not micro-operations.

## Workflow

### 1. Holistic scan

Read the whole file or module before touching anything. Answer:

- Does this file have a single, clear responsibility?
- Can you trace the data flow from input to output?
- Are there implicit dependencies or hidden side effects?
- Which parts took you more than 10 seconds to understand?
- What does this module expose publicly? Does everything exposed need to be?
- Are there obvious O(n²) patterns? Repeated lookups? Unnecessary allocations?

Note the problem areas. Do not edit yet.

### 2. Fix structure & file organization

- Split files that do too much. One clear responsibility per file.
- Group related functions/types together. Put helpers below their callers.
- Break deep nesting into early returns, guard clauses, or extracted functions.
- Move shared state into a type, struct, or class so scope is explicit.
- Remove unused imports. Order by: standard library, third-party, local.

### 3. Fix names

- Replace abbreviations and single-letter names with descriptive words.
- Use domain language. If the business calls it a "chargeback", name it `chargeback`, not `refund_evt`.
- Boolean variables and parameters read as questions: `is_active`, `has_permission`, `can_retry`.
- Functions named as commands: `create_user()`, `validate_input()`, `notify_owner()`.
- Use name length proportional to scope. `i` in a 3-line loop is fine. `i` in a 100-line function is not.

### 4. Fix readability

- Extract complex conditionals into named booleans or small predicate functions.
  ```py
  # Before
  if user.role == "admin" and doc.owner_id == user.id and doc.status != "archived":

  # After
  can_edit = user.role == "admin" and doc.owner_id == user.id
  is_active = doc.status != "archived"
  if can_edit and is_active:
  ```
- Flatten nested if/else with early returns.
- Replace magic values with named constants.
- Keep functions at one level of abstraction. A function that both fetches data and renders HTML does two things.

### 5. Add comments (only where needed)

Rules for adding comments:

- **Skip** comments that repeat the code. `# increment counter` above `i += 1` wastes time.
- **Add** comments that explain *why*: performance tradeoffs, ordering assumptions, business rules, known bugs, or platform quirks.
  ```py
  # Must check balance before deduction to ensure atomicity.
  # The DB transaction handles rollback, not this function.
  def deduct(user_id: str, amount: int) -> Result:
  ```
- **Add** a docstring to public functions and types explaining contract, not implementation.

### 6. Fix API design & interfaces

- Public functions need clear contracts. Avoid 5+ positional parameters — use named parameters, config objects, or builder patterns.
- Replace ad-hoc strings and booleans with domain types, enums, or tagged unions. A `status: "active" | "inactive"` beats `active: boolean`.
- Hide internals with access modifiers (`private`, `pub(crate)`, `internal`). Expose what callers need, not what the module has.
- Return meaningful error types. Do not swallow errors or convert everything to a generic failure. Preserve original context in error chains.
- Follow the module's established patterns. Do not mix sync and async for similar operations. Keep similar things named similarly.

### 7. Fix performance & efficiency

- **Time complexity**: Look for O(n²) patterns where O(n) or O(log n) would work — nested loops over large data, repeated linear searches inside loops. Fix the algorithm, not the micro-operations.
- **Space complexity**: Avoid keeping large data in memory longer than needed. Process streams incrementally when possible.
- **Unnecessary work**: Remove redundant computations, repeated lookups, and allocations inside loops. Cache repeated results.
- **Data structures**: Use the right collection for the access pattern — `Set` for membership checks, `Map` for lookups, arrays for iteration, deques for FIFO.
- **No micro-optimizations**: Do not trade readability for performance unless there is a measured bottleneck. Prefer clear O(n) over clever-but-opaque O(n).

### 8. Format

Run the project's standard formatter (ruff, rustfmt, prettier, clippy --fix). If there's no standard, use the language's built-in formatter. Do not add style rules or debate formatting.

## Function Usage Analysis

Before changing a function or type, trace its callers:

- Use `grep -r "function_name\|TypeName"` across the entire repo.
- Understand which modules depend on this code and how they use it.
- If renaming a public function, update all callers in the same pass.
- If changing a return type or error variant, verify every call site handles the new shape.
- If splitting a function into smaller ones, make sure public names remain stable or migrate callers.
- Flag deep call chains (A -> B -> C -> D) that could be flattened or event-driven.

## Checklist

Before calling something done:

- [ ] Whole-file scan done before edits
- [ ] Structure: single responsibility, logical order
- [ ] Names: descriptive, domain-aligned, scope-appropriate
- [ ] Comments: *why* only, nothing the code already says
- [ ] Early returns / guard clauses replace deep nesting
- [ ] Complex conditionals extracted
- [ ] Magic values replaced with named constants
- [ ] API design: clean contracts, domain types, proper access modifiers
- [ ] Performance: no O(n²) patterns, no redundant work
- [ ] Function usage: callers traced and updated
- [ ] Standard formatter applied
- [ ] No unused imports or dead code left behind
