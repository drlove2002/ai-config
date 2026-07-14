/**
 * /subagent-model — Interactive subagent model switcher
 *
 * Lets the user change the `model:` frontmatter line of a subagent definition
 * through a fully interactive, no-typing-required flow:
 *
 *   1. Pick scope: user agents / project agents / both
 *   2. Pick agent from a list showing current model + source
 *   3. Pick model from a searchable list (enabledModels first, then all known)
 *   4. Confirm the change
 *   5. Write only the selected agent's `model:` line
 *   6. If the model isn't enabled, offer to add it to settings.json
 *   7. For user agents, sync agents/AGENTS.md model table
 *
 * Optional typed shortcut (cheap): /subagent-model <agent> [<model>]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { discoverAgents, type AgentConfig, type AgentScope } from "./subagent/agents.js";
import { type ExtensionAPI, getAgentDir, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@mariozechner/pi-tui";

interface PickerItem {
	value: string;
	label: string;
	description?: string;
	search: string;
}

/**
 * Generic interactive picker built on the pi-tui SelectList.
 * When `allowFilter` is true, printable keystrokes filter the list (substring match).
 */
function pick(
	ctx: any,
	title: string,
	items: PickerItem[],
	allowFilter: boolean,
): Promise<string | null> {
	return ctx.ui.custom<string | null>((tui: any, theme: any, _kb: any, done: (val: string | null) => void) => {
		let filter = "";
		let list: SelectList;

		const titleComp = new Text(theme.fg("accent", theme.bold(title)), 1, 0);
		const filterComp = new Text("", 1, 0);
		const container = new Container();

		const listTheme = {
			selectedPrefix: (t: string) => theme.fg("accent", t),
			selectedText: (t: string) => theme.fg("accent", t),
			description: (t: string) => theme.fg("muted", t),
			scrollInfo: (t: string) => theme.fg("dim", t),
			noMatch: (t: string) => theme.fg("warning", t),
		};

		const applyFilter = () => {
			const q = filter.toLowerCase();
			const active = q ? items.filter((it) => it.search.includes(q)) : items;
			const sel: SelectItem[] = active.map((it) => ({
				value: it.value,
				label: it.label,
				description: it.description,
			}));
			list = new SelectList(sel, Math.min(Math.max(sel.length, 1), 15), listTheme);
			list.onSelect = (item: SelectItem) => done(item.value);
			list.onCancel = () => done(null);

			container.clear();
			container.addChild(titleComp);
			container.addChild(list);
			container.addChild(filterComp);

			filterComp.setText(
				allowFilter
					? filter
						? theme.fg("dim", `filter: ${filter} (${active.length})`)
						: theme.fg("dim", "↑↓ navigate • enter select • esc cancel • type to filter")
					: theme.fg("dim", "↑↓ navigate • enter select • esc cancel"),
			);
		};

		applyFilter();

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				if (allowFilter) {
					if (data === "\x7f" || data === "\x08") {
						filter = filter.slice(0, -1);
					} else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
						filter += data;
					} else {
						list.handleInput(data);
						return;
					}
					applyFilter();
					tui.requestRender();
				} else {
					list.handleInput(data);
				}
			},
		};
	});
}

function readJson(filePath: string): any {
	return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

/**
 * Parse a document into frontmatter (YAML between leading `---` fences) and body.
 * Returns `frontmatter: null` when no frontmatter block is present.
 */
function parseFrontmatter(content: string): { frontmatter: string | null; body: string; hadFinalNewline: boolean } {
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
	if (!match) {
		return { frontmatter: null, body: content, hadFinalNewline: content.endsWith("\n") };
	}
	const after = content.slice(match[0].length);
	return { frontmatter: match[1], body: after, hadFinalNewline: after.endsWith("\n") };
}

/**
 * Set the `model` field inside frontmatter without touching the body.
 * Replaces only the frontmatter `model:` line, adds it if missing, or prepends
 * a fenced frontmatter block when none exists. The body is always preserved.
 * Never rewrites arbitrary `model:` lines that appear in the body.
 */
function writeAgentModelLine(filePath: string, newModel: string): void {
	const content = fs.readFileSync(filePath, "utf-8");
	const { frontmatter, body, hadFinalNewline } = parseFrontmatter(content);

	let nextFm: string;
	if (frontmatter !== null) {
		const lines = frontmatter.split("\n");
		const idx = lines.findIndex((l) => /^model\s*:\s*/.test(l));
		if (idx >= 0) {
			lines[idx] = `model: ${newModel}`;
		} else {
			lines.push(`model: ${newModel}`);
		}
		nextFm = lines.join("\n");
	} else {
		// No frontmatter: prepend a fenced block, keep the body verbatim.
		nextFm = `model: ${newModel}`;
	}

	const nextBody = body.length > 0 ? (hadFinalNewline ? body : body + "\n") : "";
	const updated = `---\n${nextFm}\n---\n${nextBody}`;

	// Guard against a silent no-op: the resulting frontmatter must carry the model.
	if (!updated.includes(`model: ${newModel}`)) {
		throw new Error(`Failed to set model in ${filePath}`);
	}
	fs.writeFileSync(filePath, updated, "utf-8");
}

/**
 * Update the `model` cell for an agent row in agents/AGENTS.md.
 *
 * The row marker and the per-line replacement use a function (not a `$`-interpolated
 * string), so a model ID containing `$` cannot corrupt the output. Returns true when a
 * matching row was found and updated, false otherwise, so the caller can warn if the
 * doc table was not synced.
 */
function syncAgentsDocTable(agentName: string, newModel: string): boolean {
	const docPath = path.join(getAgentDir(), "agents", "AGENTS.md");
	if (!fs.existsSync(docPath)) return false;

	const escaped = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const rowMarker = new RegExp("\\*\\*`" + escaped + "`\\*\\*");
	const content = fs.readFileSync(docPath, "utf-8");
	if (!rowMarker.test(content)) return false;

	const cellRe = /^(\| \*\*`.*?`\*\* \| )`[^`]*`/;
	const replaced = content
		.split("\n")
		.map((line) => {
			if (!rowMarker.test(line)) return line;
			// Replacement function: `$` in newModel is treated literally.
			return line.replace(cellRe, (_m, prefix: string) => `${prefix}\`${newModel}\``);
		})
		.join("\n");

	const updated = replaced !== content;
	if (updated) fs.writeFileSync(docPath, replaced, "utf-8");
	return updated;
}

function collectKnownModels(): { full: string; provider: string }[] {
	const modelsPath = path.join(getAgentDir(), "models.json");
	if (!fs.existsSync(modelsPath)) return [];
	const data = readJson(modelsPath);
	const out: { full: string; provider: string }[] = [];
	for (const [provider, cfg] of Object.entries<any>(data.providers ?? {})) {
		for (const m of cfg.models ?? []) {
			out.push({ full: `${provider}/${m.id}`, provider });
		}
	}
	return out;
}

export default function subagentModelsExtension(pi: ExtensionAPI) {
	pi.registerCommand("subagent-model", {
		description:
			"Interactively change a subagent's model. Pick scope, agent, and model; writes the model: frontmatter line. Optional args: <agent> [<model>].",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/subagent-model requires interactive mode", "error");
				return;
			}

			// Gather known models, enabled first.
			const settingsPath = path.join(getAgentDir(), "settings.json");
			const settings = fs.existsSync(settingsPath) ? readJson(settingsPath) : {};
			const enabled: string[] = Array.isArray(settings.enabledModels) ? settings.enabledModels : [];

			const known = collectKnownModels();
			const knownFull = new Set(known.map((m) => m.full));
			const modelItems: PickerItem[] = [];
			for (const id of enabled) {
				const info = known.find((m) => m.full === id);
				modelItems.push({
					value: id,
					label: id,
					description: info ? `enabled · ${info.provider}` : "enabled",
					search: `${id} ${info?.provider ?? ""}`.toLowerCase(),
				});
			}
			for (const m of known) {
				if (enabled.includes(m.full)) continue;
				modelItems.push({
					value: m.full,
					label: m.full,
					description: m.provider,
					search: `${m.full} ${m.provider}`.toLowerCase(),
				});
			}
			// Also surface any enabled id not present in models.json (still selectable).
			for (const id of enabled) {
				if (!knownFull.has(id)) {
					modelItems.push({ value: id, label: id, description: "enabled", search: id.toLowerCase() });
				}
			}

			// Dedupe by value (first occurrence wins; enabled IDs added above are kept).
			const seenModels = new Set<string>();
			const dedupedModels = modelItems.filter((it) => {
				if (seenModels.has(it.value)) return false;
				seenModels.add(it.value);
				return true;
			});
			modelItems.length = 0;
			modelItems.push(...dedupedModels);

			// Optional typed shortcut: <agent> [<model>]
			const shortcut = args.trim();
			let presetAgent: string | null = null;
			let presetModel: string | null = null;
			if (shortcut) {
				const parts = shortcut.split(/\s+/);
				presetAgent = parts[0] ?? null;
				presetModel = parts[1] ?? null;
			}

			// 1. Scope
			let scope: AgentScope = "user";
			if (!presetAgent) {
				const scopeVal = await pick(
					ctx,
					"Select agent scope",
					[
						{ value: "user", label: "User agents  (~/.config/ai/agents)", search: "user agents" },
						{ value: "project", label: "Project agents  (.pi/agents)", search: "project agents" },
						{ value: "both", label: "Both  (user + project)", search: "both user project" },
					],
					false,
				);
				if (!scopeVal) {
					ctx.ui.notify("Canceled.", "info");
					return;
				}
				scope = scopeVal as AgentScope;
			} else {
				// When a shortcut names an agent, search across both scopes to find it.
				scope = "both";
			}

			// 2. Agent
			const discovery = discoverAgents(ctx.cwd, scope);
			const agents = discovery.agents;
			if (agents.length === 0) {
				ctx.ui.notify(`No agents found for scope "${scope}".`, "warning");
				return;
			}

			let selected: AgentConfig | undefined;
			if (presetAgent) {
				// Prefer the user agent when both user and project agents share the name.
				const userMatch = discoverAgents(ctx.cwd, "user").agents.find((a) => a.name === presetAgent);
				const projMatch = discoverAgents(ctx.cwd, "project").agents.find((a) => a.name === presetAgent);
				selected = userMatch ?? projMatch;
				if (!selected) {
					ctx.ui.notify(`Agent "${presetAgent}" not found.`, "warning");
					return;
				}
			} else {
				const agentItems: PickerItem[] = agents.map((a) => ({
					value: a.name,
					label: `${a.name}  (${a.source})`,
					description: `model: ${a.model ?? "(none)"}`,
					search: `${a.name} ${a.source} ${a.model ?? ""}`.toLowerCase(),
				}));
				const agentVal = await pick(ctx, "Select agent to re-model", agentItems, false);
				if (!agentVal) {
					ctx.ui.notify("Canceled.", "info");
					return;
				}
				selected = agents.find((a) => a.name === agentVal);
			}
			if (!selected) return;

			// 3. Model
			let newModel: string;
			if (presetModel) {
				newModel = presetModel;
			} else {
				if (modelItems.length === 0) {
					ctx.ui.notify("No models available.", "warning");
					return;
				}
				const modelVal = await pick(ctx, `Select model for ${selected.name}`, modelItems, true);
				if (!modelVal) {
					ctx.ui.notify("Canceled.", "info");
					return;
				}
				newModel = modelVal;
			}

			const oldModel = selected.model ?? "(none)";

			// 4. Confirm
			const ok = await ctx.ui.confirm(
				`Change ${selected.name}?`,
				`${oldModel}  →  ${newModel}`,
			);
			if (!ok) {
				ctx.ui.notify("Canceled.", "info");
				return;
			}

			// 5. Write agent model line
			await withFileMutationQueue(selected.filePath, async () => {
				writeAgentModelLine(selected!.filePath, newModel);
			});

			if (selected.source === "user") {
				const docUpdated = await withFileMutationQueue(
					path.join(getAgentDir(), "agents", "AGENTS.md"),
					async () => syncAgentsDocTable(selected!.name, newModel),
				);
				if (!docUpdated) {
					ctx.ui.notify(
						`Wrote ${selected.name} model, but agents/AGENTS.md row was not updated (no matching row).`,
						"warning",
					);
				}
			}

			// 6. Offer to enable model if not already enabled
			if (!enabled.includes(newModel) && fs.existsSync(settingsPath)) {
				const add = await ctx.ui.confirm(
					"Enable model?",
					`${newModel} is not in settings.json enabledModels. Add it?`,
				);
				if (add) {
					await withFileMutationQueue(settingsPath, async () => {
						const s = readJson(settingsPath);
						const list2: string[] = Array.isArray(s.enabledModels) ? s.enabledModels : [];
						if (!list2.includes(newModel)) list2.push(newModel);
						s.enabledModels = list2;
						fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n", "utf-8");
					});
					ctx.ui.notify(`Added ${newModel} to enabledModels.`, "info");
				}
			}

			ctx.ui.notify(`Set ${selected.name}: ${oldModel} → ${newModel}`, "info");
		},
	});
}
