/**
 * todo_write Extension
 *
 * Implements the todo_write tool from pi's system prompt conventions.
 * Tracks task lists with status: pending, in_progress, completed, cancelled.
 *
 * State is stored in tool result details (session-based, branch-safe).
 */
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TodoItem {
  id: number;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

interface TodoWriteDetails {
  action: "list" | "create" | "update" | "delete";
  todos: TodoItem[];
  nextId: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Parameters schema (matches the system prompt todo_write convention)
// ---------------------------------------------------------------------------

const TodoWriteParams = Type.Object({
  action: StringEnum(["list", "create", "update", "delete"] as const, {
    description: "Action: list todos, create new ones, update status, or delete",
  }),
  todos: Type.Optional(
    Type.Array(
      Type.Object({
        content: Type.String({ description: "Task description" }),
        status: Type.Optional(
          StringEnum(["pending", "in_progress", "completed", "cancelled"] as const, {
            description: "Task status",
          }),
        ),
        id: Type.Optional(Type.Number({ description: "ID for update/delete" })),
      }),
    ),
  ),
  ids: Type.Optional(
    Type.Array(Type.Number(), { description: "IDs to delete" }),
  ),
});

// ---------------------------------------------------------------------------
// TUI component for /todos command
// ---------------------------------------------------------------------------

const STATUS_SYMBOLS: Record<string, string> = {
  pending: "○",
  in_progress: "◐",
  completed: "✓",
  cancelled: "✗",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "dim",
  in_progress: "accent",
  completed: "success",
  cancelled: "error",
};

class TodoWriteComponent {
  private todos: TodoItem[];
  private theme: any;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(todos: TodoItem[], theme: any, onClose: () => void) {
    this.todos = todos;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push("");
    const title = th.fg("accent", " Todos ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push("");

    if (this.todos.length === 0) {
      lines.push(
        truncateToWidth(`  ${th.fg("dim", "No todos. Ask the agent to create some!")}`, width),
      );
    } else {
      const completed = this.todos.filter((t) => t.status === "completed").length;
      const total = this.todos.length;
      lines.push(
        truncateToWidth(`  ${th.fg("muted", `${completed}/${total} completed`)}`, width),
      );
      lines.push("");

      for (const todo of this.todos) {
        const sym = STATUS_SYMBOLS[todo.status] ?? "?";
        const color = STATUS_COLORS[todo.status] ?? "dim";
        const check = th.fg(color, sym);
        const id = th.fg("accent", `#${todo.id}`);
        const text =
          todo.status === "completed" || todo.status === "cancelled"
            ? th.fg("dim", todo.content)
            : th.fg("text", todo.content);
        lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
      }
    }

    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let todos: TodoItem[] = [];
  let nextId = 1;

  const reconstructState = (ctx: ExtensionContext) => {
    todos = [];
    nextId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "todo_write") continue;

      const details = msg.details as TodoWriteDetails | undefined;
      if (details) {
        todos = details.todos;
        nextId = details.nextId;
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.registerTool({
    name: "todo_write",
    label: "Todo Write",
    description:
      "Manage a task list for tracking progress. " +
      "Actions: list (view current todos), create (add new todos), " +
      "update (change status of existing todos), delete (remove todos by id). " +
      "Statuses: pending, in_progress, completed, cancelled. " +
      "CRITICAL: Use this tool to track complex multi-step tasks. " +
      "Only ONE todo may be in_progress at a time.",
    parameters: TodoWriteParams,
    promptSnippet: "Manage a task list (list, create, update, delete)",
    promptGuidelines: [
      "Use todo_write to track complex tasks. Create todos at the start, update status as you work.",
      "Only ONE todo may be in_progress at a time. Complete it before starting another.",
      "Mark todos as completed or cancelled when done. Use list to review state.",
    ],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "list": {
          return {
            content: [
              {
                type: "text",
                text:
                  todos.length > 0
                    ? todos
                        .map(
                          (t) =>
                            `[${t.status}] #${t.id}: ${t.content}`,
                        )
                        .join("\n")
                    : "No todos",
              },
            ],
            details: { action: "list", todos: [...todos], nextId } as TodoWriteDetails,
          };
        }

        case "create": {
          if (!params.todos || params.todos.length === 0) {
            return {
              content: [{ type: "text", text: "Error: todos array required for create" }],
              details: {
                action: "create",
                todos: [...todos],
                nextId,
                error: "todos array required",
              } as TodoWriteDetails,
            };
          }

          const created: string[] = [];
          for (const item of params.todos) {
            const newTodo: TodoItem = {
              id: nextId++,
              content: item.content,
              status: item.status ?? "pending",
            };
            todos.push(newTodo);
            created.push(`#${newTodo.id}: ${newTodo.content} [${newTodo.status}]`);
          }

          return {
            content: [
              {
                type: "text",
                text: `Created ${created.length} todo(s):\n${created.join("\n")}`,
              },
            ],
            details: { action: "create", todos: [...todos], nextId } as TodoWriteDetails,
          };
        }

        case "update": {
          if (!params.todos || params.todos.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: todos array with id and status required for update",
                },
              ],
              details: {
                action: "update",
                todos: [...todos],
                nextId,
                error: "todos array with id and status required",
              } as TodoWriteDetails,
            };
          }

          const updated: string[] = [];
          const errors: string[] = [];

          for (const item of params.todos) {
            if (item.id === undefined || !item.status) {
              errors.push("Each update entry needs id and status");
              continue;
            }

            const todo = todos.find((t) => t.id === item.id);
            if (!todo) {
              errors.push(`Todo #${item.id} not found`);
              continue;
            }

            // Enforce: only one in_progress at a time
            if (item.status === "in_progress") {
              const existingInProgress = todos.find(
                (t) => t.status === "in_progress" && t.id !== item.id,
              );
              if (existingInProgress) {
                existingInProgress.status = "pending";
              }
            }

            todo.status = item.status;
            updated.push(`#${todo.id}: ${todo.content} → [${todo.status}]`);
          }

          const text =
            (updated.length > 0
              ? `Updated ${updated.length} todo(s):\n${updated.join("\n")}`
              : "") +
            (errors.length > 0 ? `\nErrors:\n${errors.join("\n")}` : "");

          return {
            content: [{ type: "text", text: text.trim() || "No changes" }],
            details: { action: "update", todos: [...todos], nextId } as TodoWriteDetails,
          };
        }

        case "delete": {
          const idsToDelete = new Set(
            params.ids ??
              params.todos?.map((t) => t.id).filter((id): id is number => id !== undefined) ??
              [],
          );

          if (idsToDelete.size === 0) {
            return {
              content: [{ type: "text", text: "Error: ids required for delete" }],
              details: {
                action: "delete",
                todos: [...todos],
                nextId,
                error: "ids required",
              } as TodoWriteDetails,
            };
          }

          const before = todos.length;
          todos = todos.filter((t) => !idsToDelete.has(t.id));
          const removed = before - todos.length;

          return {
            content: [{ type: "text", text: `Deleted ${removed} todo(s)` }],
            details: { action: "delete", todos: [...todos], nextId } as TodoWriteDetails,
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${(params as any).action}` }],
            details: {
              action: "list",
              todos: [...todos],
              nextId,
              error: `unknown action: ${(params as any).action}`,
            } as TodoWriteDetails,
          };
      }
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("todo_write ")) + theme.fg("muted", args.action);
      if (args.todos && args.todos.length > 0) {
        text += ` ${theme.fg("dim", `(${args.todos.length} item(s))`)}`;
      }
      if (args.ids) {
        text += ` ${theme.fg("dim", `ids: [${args.ids.join(",")}]`)}`;
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as TodoWriteDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const todoList = details.todos;

      switch (details.action) {
        case "list": {
          if (todoList.length === 0) {
            return new Text(theme.fg("dim", "No todos"), 0, 0);
          }
          let listText = theme.fg("muted", `${todoList.length} todo(s):`);
          const display = expanded ? todoList : todoList.slice(0, 5);
          for (const t of display) {
            const sym = STATUS_SYMBOLS[t.status] ?? "?";
            const color = STATUS_COLORS[t.status] ?? "dim";
            const check = theme.fg(color, sym);
            const itemText =
              t.status === "completed" || t.status === "cancelled"
                ? theme.fg("dim", t.content)
                : theme.fg("muted", t.content);
            listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
          }
          if (!expanded && todoList.length > 5) {
            listText += `\n${theme.fg("dim", `... ${todoList.length - 5} more`)}`;
          }
          return new Text(listText, 0, 0);
        }

        case "create": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        case "update": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        case "delete": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(theme.fg("warning", "🗑 ") + theme.fg("muted", msg), 0, 0);
        }
      }

      return new Text("", 0, 0);
    },
  });

  // /todos command for users to view the list inline
  pi.registerCommand("todos", {
    description: "Show all todos on the current branch",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/todos requires interactive mode", "error");
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new TodoWriteComponent(todos, theme, () => done());
      });
    },
  });
}
