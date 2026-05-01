import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES } from "@mariozechner/pi-coding-agent";

export default function aiContextExtension(pi: ExtensionAPI) {
	// Append a single, powerful directive to the system prompt
	pi.on("before_agent_start", async (event) => {
		const parts = [
			"\n\n## Global AI Context\n",
			"Context rules and durable memories are stored locally in:",
			"- `~/.config/ai/rules/`",
			"- `~/.config/ai/memories/`\n",
			"If a task involves identity, technology preferences, or architectural rules, use the `search_ai_context` tool to retrieve the relevant information before proceeding."
		];

		return {
			systemPrompt: event.systemPrompt + parts.join("\n"),
		};
	});

	// Register a custom tool to easily search the context files
	pi.registerTool({
		name: "search_ai_context",
		label: "Search AI Context",
		description: "Search and retrieve rules and memories from ~/.config/ai/rules/ and ~/.config/ai/memories/. Use this when you need to know project rules, user preferences, or technology guidelines.",
		parameters: Type.Object({
			keyword: Type.String({ description: "The term or technology to search for (e.g., 'python', 'architecture', 'nextjs', 'code style')" }),
		}),
		async execute(_id, params, signal, onUpdate, ctx) {
			const keyword = params.keyword.toLowerCase();
			const result = await pi.exec("bash", ["-c", `grep -iRl "${keyword}" ~/.config/ai/rules/ ~/.config/ai/memories/ 2>/dev/null | xargs -I {} cat {}`], { signal });
			
			if (result.killed) {
				return { content: [{ type: "text", text: "Search cancelled." }], details: {} };
			}

			if (result.code !== 0 || !result.stdout.trim()) {
				return { content: [{ type: "text", text: `No relevant context found for "${keyword}".` }], details: {} };
			}

			const truncation = truncateHead(result.stdout, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let outputText = truncation.content;
			if (truncation.truncated) {
				outputText += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines. Use 'bash' tool for more specific searches.]`;
			}

			return {
				content: [{ type: "text", text: outputText }],
				details: {},
			};
		}
	});
}