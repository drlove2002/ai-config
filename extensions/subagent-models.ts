/**
 * /subagents — Interactive subagent model switcher
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
 * Optional typed shortcut (cheap): /subagents <agent> [<model>] [<thinkingLevel>]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	discoverAgents,
	listAllPhysicalDefinitions,
	type AgentConfig,
	type PhysicalAgentDefinition,
	type AgentScope,
} from "./subagent/agents.js";
import { type ExtensionAPI, getAgentDir, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem, matchesKey, Key } from "@mariozechner/pi-tui";

interface PickerItem {
	value: string;
	label: string;
	description?: string;
	search: string;
}

// Allowed thinking levels (must match pi's --thinking values).
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
// Sentinel value for "leave current thinking level unchanged".
const UNCHANGED = "__unchanged__";
// Sentinel value for "backspace with empty filter — go to prior menu".
const BACK = "__back__";

function splitModelThinking(
	model: string,
	literalModels: Set<string>,
): { model: string; thinking: string | null } {
	if (literalModels.has(model)) return { model, thinking: null };

	const idx = model.lastIndexOf(":");
	if (idx <= 0) return { model, thinking: null };

	const suffix = model.slice(idx + 1);
	if (!THINKING_LEVELS.includes(suffix)) return { model, thinking: null };

	return { model: model.slice(0, idx), thinking: suffix };
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
						: theme.fg("dim", "↑↓ navigate • enter select • esc cancel • ⌫ back • type to filter")
					: theme.fg("dim", "↑↓ navigate • enter select • esc cancel • ⌫ back"),
			);
		};

		applyFilter();

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				if (allowFilter) {
					if (matchesKey(data, Key.backspace)) {
						if (filter.length > 0) {
							filter = filter.slice(0, -1);
						} else {
							done(BACK);
							return;
						}
					} else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) < 127) {
						filter += data;
					} else {
						list.handleInput(data);
						return;
					}
					applyFilter();
					tui.requestRender();
				} else {
					if (matchesKey(data, Key.backspace)) {
						done(BACK);
						return;
					}
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
function writeAgentFrontmatterLine(filePath: string, key: string, value: string): void {
	const content = fs.readFileSync(filePath, "utf-8");

	// Detect and preserve CRLF line endings, normalize to LF for parsing
	const hasCRLF = /\r\n/.test(content);
	const normalized = hasCRLF ? content.replace(/\r\n/g, "\n") : content;

	const { frontmatter, body, hadFinalNewline } = parseFrontmatter(normalized);

	let nextFm: string;
	if (frontmatter !== null) {
		const lines = frontmatter.split("\n");
		const idx = lines.findIndex((l) => new RegExp("^" + key + "\\s*:").test(l));
		if (idx >= 0) {
			lines[idx] = `${key}: ${value}`;
		} else {
			lines.push(`${key}: ${value}`);
		}
		nextFm = lines.join("\n");
	} else {
		// No frontmatter: prepend a fenced block, keep the body verbatim.
		nextFm = `${key}: ${value}`;
	}

	const nextBody = body.length > 0 ? (hadFinalNewline ? body : body + "\n") : "";
	let updated = `---\n${nextFm}\n---\n${nextBody}`;

	// Restore original line-ending convention
	if (hasCRLF) {
		updated = updated.replace(/\n/g, "\r\n");
	}

	// Guard against a silent no-op: the resulting frontmatter must carry the field.
	if (!updated.replace(/\r\n/g, "\n").includes(`${key}: ${value}`)) {
		throw new Error(`Failed to set ${key} in ${filePath}`);
	}
	fs.writeFileSync(filePath, updated, "utf-8");
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
	pi.registerCommand("subagents", {
		description:
			"Manage subagent model, thinking level, and availability. Interactive: pick action, then configure. Optional shortcut: <agent> [<model>] [<thinkingLevel>].",
		handler: async (args: string, ctx: any) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/subagents requires interactive mode", "error");
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

			// ── Decide flow: shortcut vs interactive first action ───────
			const shortcut = args.trim();

			if (shortcut) {
				// Typed shortcut: /subagents <agent> [<model>] [<thinkingLevel>]
				await runModelThinkingFlow(ctx, shortcut, seenModels, modelItems, settingsPath, enabled);
			} else {
				// Interactive: pick action first, loop after flow completes
				while (true) {
					const actionVal = await pick(
						ctx,
						"What do you want to configure?",
						[
							{
								value: "model",
								label: "Model / Thinking",
								description: "Change the model or thinking level of an agent",
								search: "model thinking change model" ,
							},
							{
								value: "availability",
								label: "Manage availability",
								description: "Enable or disable agents",
								search: "availability enable disable toggle agent",
							},
						],
						false,
					);
					if (!actionVal || actionVal === BACK) {
						ctx.ui.notify("Canceled.", "info");
						return;
					}

					if (actionVal === "model") {
						const shouldLoop = await runModelThinkingFlow(ctx, shortcut, seenModels, modelItems, settingsPath, enabled);
						if (!shouldLoop) return;
					} else if (actionVal === "availability") {
						const shouldLoop = await runAvailabilityFlow(ctx);
						if (!shouldLoop) return;
					}
				}
			}

		},
	});
}

/**
 * Three-way confirmation dialog that distinguishes Confirm, Back, and Cancel.
 * Returns "confirm" on Enter, "back" on Backspace, "cancel" on Escape.
 */
async function confirmOrBack(
	ctx: any,
	title: string,
	message: string,
): Promise<"confirm" | "back" | "cancel"> {
	return ctx.ui.custom<"confirm" | "back" | "cancel">((tui: any, theme: any, _kb: any, done: (val: "confirm" | "back" | "cancel") => void) => {
		const titleComp = new Text(theme.fg("accent", theme.bold(title)), 1, 0);
		const msgComp = new Text(message, 1, 0);
		const helpComp = new Text(
			theme.fg("dim", "Enter confirm \u2022 \u232b back \u2022 Esc cancel"),
			1, 0,
		);
		const container = new Container();
		container.addChild(titleComp);
		container.addChild(msgComp);
		container.addChild(helpComp);

		return {
			render: (w: number) => container.render(w),
			invalidate: () => container.invalidate(),
			handleInput: (data: string) => {
				if (matchesKey(data, Key.enter)) {
					done("confirm");
				} else if (matchesKey(data, Key.escape)) {
					done("cancel");
				} else if (matchesKey(data, Key.backspace)) {
					done("back");
				}
			},
		};
	});
}

/**
 * Run the model/thinking change flow with back-navigation.
 * Returns true if caller should return to action menu, false if canceled (exit).
 */
async function runModelThinkingFlow(
	ctx: any,
	shortcut: string,
	seenModels: Set<string>,
	modelItems: PickerItem[],
	settingsPath: string,
	enabled: string[],
): Promise<boolean> {
	let presetAgent: string | null = null;
	let presetModel: string | null = null;
	let presetThinking: string | null = null;

	if (shortcut) {
		const parts = shortcut.split(/\s+/);
		presetAgent = parts[0] ?? null;
		presetModel = parts[1] ?? null;
		if (presetModel) {
			const parsed = splitModelThinking(presetModel, seenModels);
			presetModel = parsed.model;
			presetThinking = parsed.thinking;
		}
		if (parts[2]) {
			if (!THINKING_LEVELS.includes(parts[2])) {
				ctx.ui.notify(
					`Invalid thinking level "${parts[2]}". Use one of: ${THINKING_LEVELS.join(", ")}`,
					"error",
				);
				return true;
			}
			if (presetThinking && presetThinking !== parts[2]) {
				ctx.ui.notify(
					`Conflicting thinking levels: model suffix uses "${presetThinking}" but shortcut uses "${parts[2]}".`,
					"error",
				);
				return true;
			}
			presetThinking = parts[2];
		}
	}

	// In shortcut mode, Backspace cancels (no action menu to return to).
	const isShortcut = Boolean(shortcut);

	// ── State machine for nested picker steps with back-navigation ───
	// 0=scope, 1=agent, 2=model, 3=thinking, 4=confirm/write
	// Steps are always visited sequentially; presets auto-answer at each step.
	let step = 0;

	let scope: AgentScope = "user";
	let selected: AgentConfig | undefined;
	let newModel: string | undefined;
	let newThinking: string | null = null;

	while (true) {
		// ── 0: Scope pick ──────────────────────────────────────────
		if (step <= 0) {
			if (isShortcut) { scope = "user"; step = 1; continue; }

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
			if (scopeVal === null) { ctx.ui.notify("Canceled.", "info"); return false; }
			if (scopeVal === BACK) return !isShortcut;
			scope = scopeVal as AgentScope;
			step = 1;
			continue;
		}

		// ── 1: Agent pick ──────────────────────────────────────────
		if (step <= 1) {
			if (presetAgent) {
				const userMatch = discoverAgents(ctx.cwd, "user").agents.find((a) => a.name === presetAgent);
				const projMatch = discoverAgents(ctx.cwd, "project").agents.find((a) => a.name === presetAgent);
				selected = userMatch ?? projMatch;
				if (!selected) {
					ctx.ui.notify(`Agent "${presetAgent}" not found.`, "warning");
					return !isShortcut;
				}
				step = 2;
				continue;
			}

			const discovery = discoverAgents(ctx.cwd, scope);
			const agents = discovery.agents;
			if (agents.length === 0) {
				ctx.ui.notify(`No agents found for scope "${scope}".`, "warning");
				step = 0;
				continue;
			}

			const agentItems: PickerItem[] = agents.map((a) => ({
				value: a.name,
				label: `${a.name}  (${a.source})`,
				description: `model: ${a.model ?? "(none)"}; thinking: ${a.thinkingLevel ?? "(none)"}`,
				search: `${a.name} ${a.source} ${a.model ?? ""} ${a.thinkingLevel ?? ""}`.toLowerCase(),
			}));
			const agentVal = await pick(ctx, "Select agent to re-model", agentItems, false);
			if (agentVal === null) { ctx.ui.notify("Canceled.", "info"); return false; }
			if (agentVal === BACK) {
				if (isShortcut) { ctx.ui.notify("Canceled.", "info"); return false; }
				step = 0; continue;
			}
			selected = agents.find((a) => a.name === agentVal);
			if (!selected) return !isShortcut;
			step = 2;
			continue;
		}

		// ── 2: Model pick ──────────────────────────────────────────
		if (step <= 2) {
			if (presetModel) {
				newModel = presetModel;
				step = 3;
				continue;
			}

			if (modelItems.length === 0) {
				ctx.ui.notify("No models available.", "warning");
				step = 1;
				continue;
			}
			const modelVal = await pick(ctx, `Select model for ${selected!.name}`, modelItems, true);
			if (modelVal === null) { ctx.ui.notify("Canceled.", "info"); return false; }
			if (modelVal === BACK) {
				if (isShortcut) { ctx.ui.notify("Canceled.", "info"); return false; }
				newModel = undefined; newThinking = null; step = 1; continue;
			}
			newModel = modelVal;
			step = 3;
			continue;
		}

		// ── 3: Thinking pick ──────────────────────────────────────
		if (step <= 3) {
			if (presetThinking) {
				newThinking = presetThinking;
				step = 4;
				continue;
			}
			// When model was preset, skip thinking pick (thinking from model suffix).
			if (presetModel) { step = 4; continue; }

			const oldThinking = selected!.thinkingLevel ?? "(none)";
			const thinkingItems: PickerItem[] = [
				{
					value: UNCHANGED,
					label: "Leave unchanged",
					description: `current: ${oldThinking}`,
					search: "leave unchanged current skip",
				},
				...THINKING_LEVELS.map((lvl) => ({
					value: lvl,
					label: lvl,
					description: lvl === selected!.thinkingLevel ? "current" : undefined,
					search: lvl,
				})),
			];
			const thinkingVal = await pick(ctx, `Select thinking level for ${selected!.name}`, thinkingItems, true);
			if (thinkingVal === null) { ctx.ui.notify("Canceled.", "info"); return false; }
			if (thinkingVal === BACK) {
				if (isShortcut) { ctx.ui.notify("Canceled.", "info"); return false; }
				newThinking = null; step = 2; continue;
			}
			if (thinkingVal !== UNCHANGED) newThinking = thinkingVal;
			step = 4;
			continue;
		}

		// ── 4: Confirm + write ─────────────────────────────────────
		const oldModel = selected!.model ?? "(none)";
		const oldThinking = selected!.thinkingLevel ?? "(none)";
		const changeLines = [`model: ${oldModel}  →  ${newModel}`];
		if (newThinking !== null) changeLines.push(`thinkingLevel: ${oldThinking}  →  ${newThinking}`);

		const confirmResult = await confirmOrBack(ctx, `Change ${selected!.name}?`, changeLines.join("\n"));
		if (confirmResult === "cancel") {
			ctx.ui.notify("Canceled.", "info");
			return false;
		}
		if (confirmResult === "back") {
			// Go back to the last interactive pick step
			if (!presetModel && !presetThinking) step = 3;
			else if (!presetModel) step = 2;
			else if (!presetAgent) step = 1;
			else {
				// All steps were preset (full shortcut); cancel.
				ctx.ui.notify("Canceled.", "info");
				return false;
			}
			// Reset downstream state for the target step
			if (step === 3) newThinking = null;
			if (step === 2) { newModel = undefined; newThinking = null; }
			if (step === 1) { newModel = undefined; newThinking = null; }
			continue;
		}

		// Write agent frontmatter
		await withFileMutationQueue(selected!.filePath, async () => {
			writeAgentFrontmatterLine(selected!.filePath, "model", newModel!);
			if (newThinking !== null) writeAgentFrontmatterLine(selected!.filePath, "thinkingLevel", newThinking);
		});

		// Offer to enable model
		if (!enabled.includes(newModel!) && fs.existsSync(settingsPath)) {
			const add = await ctx.ui.confirm(
				"Enable model?",
				`${newModel} is not in settings.json enabledModels. Add it?`,
			);
			if (add) {
				await withFileMutationQueue(settingsPath, async () => {
					const s = readJson(settingsPath);
					const list2: string[] = Array.isArray(s.enabledModels) ? s.enabledModels : [];
					if (!list2.includes(newModel!)) list2.push(newModel!);
					s.enabledModels = list2;
					fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + "\n", "utf-8");
				});
				ctx.ui.notify(`Added ${newModel} to enabledModels.`, "info");
			}
		}

		ctx.ui.notify(`Set ${selected!.name}: ${oldModel} → ${newModel}`, "info");
		return true; // back to action menu
	}
}

/**
 * Run the availability management flow.
 *
 * Backspace / Escape / Done all return to the action menu.
 */
async function runAvailabilityFlow(ctx: any): Promise<boolean> {
	while (true) {
		const defs = listAllPhysicalDefinitions(ctx.cwd);

		// Resolve symlinks to avoid duplicates by physical file
		const seen = new Set<string>();
		const canonical: PhysicalAgentDefinition[] = [];
		for (const d of defs) {
			try {
				const resolved = fs.realpathSync(d.filePath);
				if (seen.has(resolved)) continue;
				seen.add(resolved);
				canonical.push(d);
			} catch {
				if (!seen.has(d.filePath)) {
					seen.add(d.filePath);
					canonical.push(d);
				}
			}
		}

		if (canonical.length === 0) {
			ctx.ui.notify("No agent definitions found.", "warning");
			return true;
		}

		const agentItems: PickerItem[] = canonical.map((d) => {
			const stateIcon = d.enabled ? "✓" : "✗";
			const stateLabel = d.enabled ? "enabled" : "disabled";
			const modelStr = d.model ? `model: ${d.model}` : "";
			return {
				value: d.filePath,
				label: `${stateIcon}  ${d.name}  (${d.source})`,
				description: `${stateLabel} · ${d.description}${modelStr ? " · " + modelStr : ""}`,
				search: `${d.name} ${d.source} ${d.enabled ? "enabled" : "disabled"} ${d.description} ${d.model ?? ""}`.toLowerCase(),
			};
		});

		// Add a "Done" option at the top
		agentItems.unshift({
			value: "__done__",
			label: "Done  (exit)",
			description: "Finish managing availability",
			search: "done exit finish quit complete",
		});

		const agentVal = await pick(ctx, "Toggle agent availability (select to toggle)", agentItems, true);
		if (!agentVal || agentVal === BACK || agentVal === "__done__") {
			ctx.ui.notify("Done.", "info");
			return true;
		}

		// Find the definition by filePath
		const def = canonical.find((d) => d.filePath === agentVal);
		if (!def) return true;

		const newEnabled = !def.enabled;
		const action = newEnabled ? "enable" : "disable";
		const ok = await ctx.ui.confirm(
			`${action} ${def.name}?`,
			`${def.name} (${def.source})
${def.description}
Current: ${def.enabled ? "enabled" : "disabled"} → ${newEnabled ? "enabled" : "disabled"}`,
		);
		if (!ok) {
			ctx.ui.notify("Skipped.", "info");
			continue;
		}

		// Write enabled: true|false to frontmatter
		await withFileMutationQueue(def.filePath, async () => {
			writeAgentFrontmatterLine(def!.filePath, "enabled", newEnabled ? "true" : "false");
		});

		ctx.ui.notify(`Set ${def.name} → ${newEnabled ? "enabled" : "disabled"}. Refreshing list...`, "info");
		// Loop continues with refreshed list
	}
}
