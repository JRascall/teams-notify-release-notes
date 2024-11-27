const core = require("@actions/core");
const github = require("@actions/github");
const axios = require("axios");

require("dotenv").config();

const getInput = (name) => {
  return (
    process.env[`INPUT_${name.replace(/-/g, "_").toUpperCase()}`] ||
    core.getInput(name)
  );
};

async function run() {
  try {
    const webhookUrl = getInput("webhook-url");
    const productName = getInput("product-name");
    const githubToken = getInput("github-token");
    const releaseDate = new Date().toISOString().split("T")[0];

    const octokit = github.getOctokit(githubToken);
    const { context } = github;

    const latestTag = await getLatestTag(octokit, context);
    const commits = await getCommitsSinceLastRelease(octokit, context);
    const sections = parseCommits(commits);

    const message = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            body: [
              {
                type: "TextBlock",
                text: formatReleaseNotes(
                  productName,
                  latestTag,
                  releaseDate,
                  sections,
                ),
                wrap: true,
              },
            ],
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.2",
          },
        },
      ],
    };

    await axios.post(webhookUrl, message);
    core.setOutput("status", "Release notes posted successfully");
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

async function getLatestTag(octokit, context) {
  const tags = await octokit.rest.repos.listTags({
    owner: context.repo.owner,
    repo: context.repo.repo,
    per_page: 1,
  });

  return tags.data[0]?.name || "v1.0.0";
}

async function getCommitsSinceLastRelease(octokit, context) {
  try {
    const releases = await octokit.rest.repos.listReleases({
      owner: context.repo.owner,
      repo: context.repo.repo,
    });

    const latestTwoReleases = releases.data.slice(0, 2);

    const commits = await octokit.rest.repos.compareCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      base: latestTwoReleases[1].tag_name,
      head: latestTwoReleases[0].tag_name,
    });

    return commits.data.commits;
  } catch (error) {
    console.error("API Error:", error.message);
    throw error;
  }
}

function parseConventionalCommit(message) {
  // Try matching with scope first
  const scopeRegex = /^(?<type>\w+)\((?<scope>[^)]+)\):\s*(?<subject>.+)$/;
  const scopeMatch = message.match(scopeRegex);

  // If no scope, try matching without scope
  const noScopeRegex = /^(?<type>\w+):\s*(?<subject>.+)$/;
  const noScopeMatch = message.match(noScopeRegex);

  if (scopeMatch) {
    return scopeMatch.groups;
  } else if (noScopeMatch) {
    return {
      ...noScopeMatch.groups,
      scope: "",
    };
  }

  return {
    type: "other",
    scope: "",
    subject: message.split("\n")[0],
  };
}

function parseCommits(commits) {
  const sections = {
    features: [],
    improvements: [],
    bugfixes: [],
  };

  const commitTypeMap = {
    feat: "features",
    fix: "bugfixes",
    perf: "improvements",
    refactor: "improvements",
    style: "improvements",
  };

  commits.forEach((commit) => {
    const { type, scope, subject } = parseConventionalCommit(
      commit.commit.message,
    );
    const section = commitTypeMap[type];

    if (section && type != "other") {
      const authorName = commit.commit.author.name;
      const title = scope
        ? `${scope} - ${subject} - ${authorName}`
        : `${subject} - ${authorName}`;

      sections[section].push({
        title,
        details: [],
      });
    }
  });

  return sections;
}

function formatReleaseNotes(productName, version, releaseDate, sections) {
  let markdown = `# Release Notes - ${productName} ${version}\n`;
  markdown += `**Release Date:** ${releaseDate}\n\n`;

  if (sections.features.length > 0) {
    markdown += "## 🚀 New Features\n";
    sections.features.forEach((feature) => {
      markdown += `* **${feature.title}**\n`;
    });
    markdown += "\n";
  }

  if (sections.improvements.length > 0) {
    markdown += "## 🔧 Improvements\n";
    sections.improvements.forEach((improvement) => {
      markdown += `* **${improvement.title}**\n`;
    });
    markdown += "\n";
  }

  if (sections.bugfixes.length > 0) {
    markdown += "## 🐛 Bug Fixes\n";
    sections.bugfixes.forEach((bugfix) => {
      markdown += `* **${bugfix.title}**\n`;
    });
  }

  return markdown;
}

run();
