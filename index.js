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

    // Determine if this is a hotfix
    const isHotfix = currentTag.includes("-hotfix");

    let baseTag, compareTag, releaseInfo;

    if (isHotfix) {
      // Handle hotfix logic
      releaseInfo = await findHotfixRelatedTags(octokit, context, currentTag);
      baseTag = releaseInfo.previousHotfixTag || releaseInfo.baseReleaseTag;
      compareTag = currentTag;
    } else {
      // Handle regular release logic
      releaseInfo = await findPreviousReleaseTag(
        octokit,
        context,
        currentTag,
        tagFormat,
      );
      baseTag = releaseInfo.previousTag;
      compareTag = currentTag;
    }

    // Get commits between the tags
    const commits = await getCommitsBetweenTags(
      octokit,
      context,
      baseTag,
      compareTag,
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
                  isHotfix,
                  releaseInfo,
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

async function findHotfixRelatedTags(octokit, context, hotfixTag) {
  try {
    const { data: tags } = await octokit.rest.repos.listTags({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100,
    });

    // Extract the base version and hotfix number
    const baseVersion = hotfixTag.split("-hotfix")[0];
    const currentHotfixNum = hotfixTag.includes("-hotfix")
      ? parseInt(hotfixTag.split("-hotfix")[1] || "1")
      : 1;

    // Find the base release tag
    const baseReleaseTag = `${baseVersion}-release`;
    if (!tags.some((tag) => tag.name === baseReleaseTag)) {
      throw new Error(`Could not find base release tag: ${baseReleaseTag}`);
    }

    // Find all hotfix tags for this version
    const relatedHotfixes = tags
      .filter((tag) => tag.name.startsWith(`${baseVersion}-hotfix`))
      .map((tag) => ({
        name: tag.name,
        number: parseInt(tag.name.split("-hotfix")[1] || "1"),
      }))
      .sort((a, b) => b.number - a.number);

    // Find the previous hotfix (if any)
    const previousHotfix = relatedHotfixes.find(
      (tag) => tag.number < currentHotfixNum,
    );

    return {
      baseReleaseTag,
      previousHotfixTag: previousHotfix ? previousHotfix.name : null,
      type: "hotfix",
    };
  } catch (error) {
    console.error("Error finding related tags:", error);
    throw error;
  }
}

async function findPreviousReleaseTag(octokit, context, currentTag, tagFormat) {
  try {
    const { data: tags } = await octokit.rest.repos.listTags({
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100,
    });

    // Function to extract version number from tag
    const getVersionNumber = (tag) => {
      const match = tag.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    };

    // Get the version number of the current tag
    const currentVersion = getVersionNumber(currentTag);
    if (!currentVersion) {
      throw new Error(`Invalid version format in tag: ${currentTag}`);
    }

    // Find all release tags with lower version numbers
    const releaseTags = tags
      .filter((tag) => tag.name.endsWith("-release"))
      .map((tag) => ({
        name: tag.name,
        version: getVersionNumber(tag.name),
      }))
      .filter((tag) => tag.version && tag.version < currentVersion)
      .sort((a, b) => {
        const [aMajor, aMinor, aPatch] = a.version.split(".").map(Number);
        const [bMajor, bMinor, bPatch] = b.version.split(".").map(Number);

        if (aMajor !== bMajor) return bMajor - aMajor;
        if (aMinor !== bMinor) return bMinor - aMinor;
        return bPatch - aPatch;
      });

    if (releaseTags.length === 0) {
      throw new Error(`No previous release tag found before ${currentTag}`);
    }

    return {
      previousTag: releaseTags[0].name,
      type: "release",
    };
  } catch (error) {
    console.error("Error finding previous release tag:", error);
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

function formatReleaseNotes(
  productName,
  version,
  releaseDate,
  sections,
  isHotfix,
  releaseInfo,
) {
  let markdown = `### ${isHotfix ? "Hotfix" : "Release"} Notes - ${productName} ${version}\n`;
  markdown += `**Release Date:** ${releaseDate}\n`;

  if (isHotfix) {
    markdown += `**Base Release:** ${releaseInfo.baseReleaseTag}\n`;
    if (releaseInfo.previousHotfixTag) {
      markdown += `**Changes since:** ${releaseInfo.previousHotfixTag}\n`;
    }
  }

  markdown += "\n";

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
