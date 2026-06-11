/**
 * Revert Extension
 *
 * Creates a _pi/<branch> tracking branch that auto-commits every agent turn.
 *   /revert [N]  — restore files (and conversation) to turn N
 *   /land         — squash _pi/<branch> into <branch>, delete tracking branch
 *
 * The pi branch persists across sessions until /land is called.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let currentBranch: string | null = null;
  let turnIndex = 0;
  let pendingEntryId: string | null = null;

  pi.on("session_start", async () => {
    const branchResult = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branchResult.code !== 0 || branchResult.stdout.trim() === "HEAD") {
      currentBranch = null;
      return;
    }
    currentBranch = branchResult.stdout.trim();
  });

  pi.on("turn_start", async (_event, ctx) => {
    const leaf = ctx.sessionManager.getLeafEntry();
    pendingEntryId = leaf?.id ?? null;
  });

  // Commit the files after the turn settles, then link to the user message
  pi.on("turn_end", async (_event, _ctx) => {
    if (!currentBranch) return;

    turnIndex++;
    const piBranch = `_pi/${currentBranch}`;

    await pi.exec("git", ["add", "-A"]);

    const diffResult = await pi.exec("git", ["diff", "--cached", "--name-only"]);
    const changedFiles = diffResult.stdout.trim().split("\n").filter(Boolean);
    if (changedFiles.length === 0) return;

    const names = changedFiles
      .map((f) => f.split("/").pop()!)
      .slice(0, 3)
      .join(", ");
    const more = changedFiles.length > 3 ? ` +${changedFiles.length - 3} more` : "";
    const msg = `turn ${turnIndex}: ${names}${more}\n\npi:entry:${pendingEntryId ?? ""}`;

    const treeResult = await pi.exec("git", ["write-tree"]);
    if (treeResult.code !== 0) return;
    const tree = treeResult.stdout.trim();

    const parentResult = await pi.exec("git", ["rev-parse", piBranch]);
    const parent = parentResult.code === 0 ? parentResult.stdout.trim() : null;

    let commitHash: string;
    if (parent) {
      const result = await pi.exec("git", [
        "commit-tree", tree, "-p", parent, "-m", msg,
      ]);
      if (result.code !== 0) return;
      commitHash = result.stdout.trim();
    } else {
      const result = await pi.exec("git", ["commit-tree", tree, "-m", msg]);
      if (result.code !== 0) return;
      commitHash = result.stdout.trim();
    }

    await pi.exec("git", ["update-ref", `refs/heads/${piBranch}`, commitHash]);
    pendingEntryId = null;
  });

  pi.registerCommand("revert", {
    description:
      "Restore files and conversation to a previous agent turn. /revert [N] to jump directly.",
    handler: async (args, ctx) => {
      if (!currentBranch) {
        ctx.ui.notify("Not in a git repo or detached HEAD", "error");
        return;
      }

      const piBranch = `_pi/${currentBranch}`;

      const { stdout } = await pi.exec("git", [
        "log", "--format=%h %s", piBranch,
      ]);

      if (stdout.trim() === "") {
        ctx.ui.notify("No agent commits to revert to", "info");
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);

      if (lines.length === 0) {
        ctx.ui.notify("No agent commits to revert to", "info");
        return;
      }

      let hash: string;
      let entryId: string | undefined;

      const arg = args.trim();
      if (arg && /^\d+$/.test(arg)) {
        const target = `turn ${arg}:`;
        const match = lines.find((l) => l.includes(target));
        if (!match) {
          ctx.ui.notify(`Turn ${arg} not found`, "error");
          return;
        }
        hash = match.split(" ")[0];
        // Extract entryId from the full commit message
        const bodyResult = await pi.exec("git", [
          "log", "--format=%b", "-1", hash,
        ]);
        const m2 = bodyResult.stdout.trim().match(/pi:entry:([a-f0-9]+)/);
        entryId = m2?.[1];
      } else {
        const choice = await ctx.ui.select("Revert files to:", lines);
        if (!choice) return;
        hash = choice.split(" ")[0];
        // Extract entryId from the full commit message
        const bodyResult2 = await pi.exec("git", [
          "log", "--format=%b", "-1", hash,
        ]);
        const m3 = bodyResult2.stdout.trim().match(/pi:entry:([a-f0-9]+)/);
        entryId = m3?.[1];
      }

      // Branch conversation tree first, then restore files
      if (entryId) {
        ctx.sessionManager.branch(entryId);
      }

      await pi.exec("git", ["checkout", hash, "--", "."]);
      // Remove files added after this commit (checkout won't delete them)
      await pi.exec("bash", ["-c",
        `git diff --diff-filter=A --name-only ${hash} ${piBranch} | xargs -r rm -f`,
      ]);
      await pi.exec("git", ["reset"]);

      const diffResult = await pi.exec("git", ["diff", "--stat", "HEAD"]);
      ctx.ui.notify(`Reverted.\n${diffResult.stdout.slice(0, 300)}`, "success");
    },
  });

  pi.registerCommand("land", {
    description: "Squash agent branch into current branch and delete it",
    handler: async (_args, ctx) => {
      if (!currentBranch) {
        ctx.ui.notify("Not in a git repo or detached HEAD", "error");
        return;
      }

      const piBranch = `_pi/${currentBranch}`;

      const { code } = await pi.exec("git", ["rev-parse", piBranch]);
      if (code !== 0) {
        ctx.ui.notify(`No agent branch: ${piBranch}`, "error");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        "Land changes?",
        [
          `Squash ${piBranch} into ${currentBranch}.`,
          `${piBranch} will be deleted.`,
          "Uncommitted working-tree changes will be lost.",
        ].join("\n"),
      );

      if (!confirmed) return;

      await pi.exec("git", ["checkout", "-f", piBranch]);
      await pi.exec("git", ["branch", "-f", currentBranch, "HEAD"]);
      await pi.exec("git", ["checkout", currentBranch]);
      await pi.exec("git", ["branch", "-D", piBranch]);

      pendingEntryId = null;
      turnIndex = 0;

      ctx.ui.notify(`Landed ${piBranch} → ${currentBranch}`, "success");
    },
  });
}
