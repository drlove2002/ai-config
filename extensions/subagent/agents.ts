/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	thinkingLevel?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
	enabled: boolean;
}

/**
 * Physical agent definition for management listing.
 * Includes ALL definitions (no shadowing), with enabled state and source.
 */
export interface PhysicalAgentDefinition {
	name: string;
	description: string;
	model?: string;
	thinkingLevel?: string;
	tools?: string[];
	source: "user" | "project";
	filePath: string;
	enabled: boolean;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter(content);

		if (!frontmatter || typeof frontmatter.name !== "string" || !frontmatter.name) {
			continue;
		}
		if (typeof frontmatter.description !== "string" || !frontmatter.description) {
			continue;
		}

		const tools = typeof frontmatter.tools === "string"
			? frontmatter.tools.split(",").map((t: string) => t.trim()).filter(Boolean)
			: undefined;

		// enabled defaults to true; only explicit YAML boolean false disables
		const enabled = frontmatter.enabled !== false;

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			thinkingLevel: typeof frontmatter.thinkingLevel === "string" ? frontmatter.thinkingLevel : undefined,
			systemPrompt: body,
			source,
			filePath,
			enabled,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		// Project shadows user in both scope (including disabled state)
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	// Return only enabled agents (disabled agents are excluded from runtime discovery)
	const enabledAgents = Array.from(agentMap.values()).filter((a) => a.enabled);

	return { agents: enabledAgents, projectAgentsDir };
}

/**
 * List ALL physical agent definitions (no shadowing, no filtering).
 * Used for management UI — shows every file regardless of enabled state.
 */
export function listAllPhysicalDefinitions(cwd: string): PhysicalAgentDefinition[] {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userConfigs = loadAgentsFromDir(userDir, "user");
	const projectConfigs = projectAgentsDir ? loadAgentsFromDir(projectAgentsDir, "project") : [];

	const toPhysical = (c: AgentConfig): PhysicalAgentDefinition => ({
		name: c.name,
		description: c.description,
		model: c.model,
		thinkingLevel: c.thinkingLevel,
		tools: c.tools,
		source: c.source,
		filePath: c.filePath,
		enabled: c.enabled,
	});

	return [...userConfigs.map(toPhysical), ...projectConfigs.map(toPhysical)];
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
