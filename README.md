# GitHub Action that automatically updates JDKs in `jdks.yaml`

Example:

```yaml
name: Update jdks.yaml

on:
  workflow_dispatch: # Allows manual triggering of the action
  schedule: # Runs the action on the first day of every month at 3:42 UTC
    - cron: '42 3 1 * *'

permissions:
  contents: write
  pull-requests: write

jobs:
  update-jdks:
    permissions:
      contents: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3
        with:
          persist-credentials: false
          fetch-depth: 0
      - name: Update jdks.yaml
        uses: gradle/update-jdks-action@main
      - name: Create Pull Request
        uses: peter-evans/create-pull-request@v7
        with:
          commit-message: 'Update jdks.yaml'
          add-paths: .teamcity/jdks.yaml
          title: 'Update jdks.yaml'
          body: 'This PR contains automated updates to the jdks.yaml file.'
          delete-branch: true
          branch-suffix: timestamp
```

## Make changes

After making changes to the TypeScript code, run the following command to
compile the code

```bash
npm run package
```
