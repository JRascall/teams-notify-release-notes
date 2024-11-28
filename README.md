# Teams Release Notes Action

A GitHub Action that automatically posts release notes to Microsoft Teams when a new release is published. It supports linking to Linear tickets and aggregates commits between release tags.

## Features

- Generates release notes between specified release tags
- Parses conventional commits into categorized release notes
- Posts formatted release notes to Teams channel
- Optional Linear ticket linking support
- Customizable release tag format

## Usage

1. Add this to your workflow:

```yaml
- uses: JRascall/teams-notify-release-notes@v2
  with:
    webhook-url: ${{ secrets.TEAMS_WEBHOOK_URL }}
    product-name: "Your Product"
    github-token: ${{ secrets.GITHUB_TOKEN }}
    tag: "v1.0.0"
    tag-format: "{tag}-release" # Optional
    linear-url: "https://linear.app/your-org/issue" # Optional
```

2. Add your Teams webhook URL as a repository secret named `TEAMS_WEBHOOK_URL`

## Inputs

| Input        | Description                                                        | Required | Default       |
| ------------ | ------------------------------------------------------------------ | -------- | ------------- |
| webhook-url  | Microsoft Teams webhook URL                                        | Yes      | N/A           |
| product-name | Name of your product                                               | Yes      | N/A           |
| github-token | GitHub token for API access                                        | Yes      | N/A           |
| tag          | Tag to generate release notes from                                 | Yes      | N/A           |
| tag-format   | Format for release tags (e.g. "{tag}-release")                     | No       | {tag}-release |
| linear-url   | Base URL for Linear tickets (e.g., "https://linear.app/org/issue") | No       | N/A           |

## How It Works

The action works by:

1. Taking your input tag (e.g., "v1.0.0")
2. Creating a release tag using the format (e.g., "v1.0.0-release")
3. Finding the next release tag in sequence
4. Generating release notes for all commits between these two release tags

For example, if you have tags:

```
v1.0.0-release
v1.0.0
v0.9.0
v0.9.0-release
```

And you pass `tag: "v1.0.0"`, it will generate release notes for commits between `v0.9.0-release` and `v1.0.0-release`.

## Example Output

```markdown
### Release Notes - Product v1.0.0

Release Date: 2024-11-27

## 🚀 New Features

- **Add OAuth authentication - JDoe**
- **[ENG-456 - Add file upload system - ASmith](https://linear.app/org/issue/ENG-456)**
- **[ENG-789 - Add dark mode support - MJohnson](https://linear.app/org/issue/ENG-789)**

## 🔧 Improvements

- **[ENG-234 - Optimize database queries - PTaylor](https://linear.app/org/issue/ENG-234)**
- **[ENG-567 - Update component architecture - RWilson](https://linear.app/org/issue/ENG-567)**

## 🐛 Bug Fixes

- **[ENG-345 - Fix memory leak in worker process - SBrown](https://linear.app/org/issue/ENG-345)**
- **[ENG-678 - Fix cache race condition - JMascall](https://linear.app/org/issue/ENG-678)**
- **[ENG-901 - Fix date formatting - LGreen](https://linear.app/org/issue/ENG-901)**
```

## Commit Message Format

The action parses conventional commit messages in the following formats:

- `type(scope): subject` - With scope (e.g., `fix(ENG-123): fix bug`)
- `type: subject` - Without scope

Supported types:

- `feat`: New Features 🚀
- `fix`: Bug Fixes 🐛
- `perf`/`refactor`/`style`: Improvements 🔧

When Linear URL is provided and scope matches a ticket format (e.g., ENG-123), the commit will be linked to the corresponding Linear ticket.

## License

MIT
