# Teams Release Notes Action

A GitHub Action that automatically posts release notes to Microsoft Teams when a new release is published.

## Features

- Automatically fetches latest version from git tags
- Parses conventional commits into categorized release notes
- Posts formatted release notes to Teams channel

## Usage

1. Add this to your workflow:

```yaml
- uses: yourusername/teams-release-notes@v1
  with:
    webhook-url: ${{ secrets.TEAMS_WEBHOOK_URL }}
    product-name: "Your Product"
    github-token: ${{ secrets.GITHUB_TOKEN }}
```

2. Add your Teams webhook URL as a repository secret named `TEAMS_WEBHOOK_URL`

## Inputs

| Input        | Description                 | Required |
| ------------ | --------------------------- | -------- |
| webhook-url  | Microsoft Teams webhook URL | Yes      |
| product-name | Name of your product        | Yes      |
| github-token | GitHub token for API access | Yes      |

## Example Output

```markdown
# Release Notes - Product v1.0.0

Release Date: 2024-11-27

## 🚀 New Features

- **Add OAuth authentication - JDoe**
- **ENG-456 - Add file upload system - ASmith**
- **ENG-789 - Add dark mode support - MJohnson**

## 🔧 Improvements

- **ENG-234 - Optimize database queries - PTaylor**
- **ENG-567 - Update component architecture - RWilson**

## 🐛 Bug Fixes

- **ENG-345 - Fix memory leak in worker process - SBrown**
- **ENG-678 - Fix cache race condition - JMascall**
- **ENG-901 - Fix date formatting - LGreen**
```

## License

MIT
