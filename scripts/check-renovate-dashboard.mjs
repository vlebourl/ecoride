const repository = process.env.GITHUB_REPOSITORY || "vlebourl/ecoride";
const response = await fetch(`https://api.github.com/repos/${repository}/issues/344`, {
  headers: {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  },
});

if (!response.ok) {
  throw new Error(`Could not read Renovate Dependency Dashboard: HTTP ${response.status}`);
}

const { body = "" } = await response.json();
const awaitingSchedule = body.split(/^## Awaiting Schedule\r?$/m)[1]?.split(/^## /m)[0] ?? "";
const count = (awaitingSchedule.match(/<!-- unschedule-branch=/g) ?? []).length;

if (count > 0) {
  throw new Error(`${count} Renovate updates are stuck in Awaiting Schedule (issue #344)`);
}

console.log("Renovate Dependency Dashboard has no updates awaiting schedule.");
