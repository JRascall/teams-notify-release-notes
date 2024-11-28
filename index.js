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
    const linearBaseUrl = getInput("linear-url") || null;
    const currentTag = getInput("tag");
    const tagFormat = getInput("tag-format") || "{tag}-release";
    const releaseDate = new Date().toISOString().split("T")[0];

    const octokit = github.getOctokit(githubToken);
    const { context } = github;

    // Create the current release tag
    const currentReleaseTag = tagFormat.replace("{tag}", currentTag);

    // Find the next release tag
    const nextReleaseTag = await findNextReleaseTag(
      octokit,
      context,
      currentTag,
      tagFormat,
    );

    // Get commits between the two release tags
    const commits = await getCommitsBetweenTags(
      octokit,
      context,
      nextReleaseTag,
      currentReleaseTag,
    );
    const sections = parseCommits(commits, linearBaseUrl);

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
                  currentTag,
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

async function findNextReleaseTag(octokit, context, currentTag, tagFormat) {
  try {
    // Get all tags
    const { data: tags } = await octokit.rest.repos.listTags({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100,
    });

    // Create the current release tag
    const currentReleaseTag = tagFormat.replace("{tag}", currentTag);

    // Find the index of our current release tag
    const currentIndex = tags.findIndex(
      (tag) => tag.name === currentReleaseTag,
    );

    if (currentIndex === -1) {
      throw new Error(`Could not find release tag ${currentReleaseTag}`);
    }

    // Find the next release tag after our current position
    for (let i = currentIndex + 1; i < tags.length; i++) {
      if (tags[i].name.endsWith("-release")) {
        return tags[i].name;
      }
    }

    throw new Error(
      `No previous release tag found before ${currentReleaseTag}`,
    );
  } catch (error) {
    console.error("Error finding next release tag:", error);
    throw error;
  }
}

async function getCommitsBetweenTags(octokit, context, baseTag, headTag) {
  try {
    const commits = await octokit.rest.repos.compareCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      base: baseTag,
      head: headTag,
    });

    return commits.data.commits;
  } catch (error) {
    console.error("API Error:", error.message);
    throw error;
  }
}

function parseConventionalCommit(message) {
  const scopeRegex = /^(?<type>\w+)\((?<scope>[^)]+)\):\s*(?<subject>.+)$/;
  const noScopeRegex = /^(?<type>\w+):\s*(?<subject>.+)$/;

  const scopeMatch = message.match(scopeRegex);
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

function parseCommits(commits, linearBaseUrl = null) {
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

    if (section) {
      const authorName = commit.commit.author.name;
      const baseTitle = scope
        ? `${scope} - ${subject} - ${authorName}`
        : `${subject} - ${authorName}`;

      // Only add Linear links if linearBaseUrl is provided
      let title;
      if (linearBaseUrl && scope && scope.match(/^[A-Za-z]+-\d+$/)) {
        const linearUrl = `${linearBaseUrl}/${scope}`;
        title = `[${baseTitle}](${linearUrl})`;
      } else {
        title = baseTitle;
      }

      sections[section].push({
        title,
        details: [],
      });
    }
  });

  return sections;
}

function formatReleaseNotes(productName, version, releaseDate, sections) {
  let markdown = `### Release Notes - ${productName} ${version}\n`;
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
