# PackageCloud Cleanup
Automatically cleans up old packages in a PackageCloud repository upon GitHub actions.

GitHub ties into Amazon's Simple Notification Service by specifying the service in your repository's settings. The endpoint of your Amazon SNS topic must be configured to be a Lambda function based on Node.js. Use the included script.js file as the Lambda function's content.
General setup as outlined in [this AWS Compute Blog post](https://aws.amazon.com/blogs/compute/dynamic-github-actions-with-aws-lambda/).

### Variables
In the script, variables are used to hold a few configuration strings:
* **snapshotsOfMasterToKeep:** The number of snapshots of a package that should be kept before cleaning up.
* **packageCloudUser:** PackageCloud Username.
* **packageCloudRepository:** PackageCloud repository that will be cleaned.
* **packageCloudApiKey:** PackageCloud API Key.
* **gitHubUserAgent:** User Agent that should be sent with your GitHub API requests, e.g. your GitHub username.
* **gitHubOrganization:** The GitHub organization that owns your repositories.
* **gitHubPersonalAccessToken:** A personal access token enabling the script to access the GitHub API. This can either be a Personal Access Token from your personal GitHub account or an OAuth token from a GitHub OAuth app.

These variables are stored as Environment Variables in the Lambda function.

### Using an OAuth app
To use the latter alternative, create a new OAuth app, e.g. in your organization's Developer settings. The benefit of using an OAuth app is that you can somewhat restrict permissions. Due to GitHub's structure of scopes, the OAuth app will be able to read **and write** to all your public and private repositories but access to other account features is not granted.
Since we will not need a web interface, we can get the OAuth token via a simple cURL request:
`curl -H "Content-Type: application/json" -H "X-GitHub-OTP: OTP_TOKEN" -X POST -d '{ "scopes": ["repo"], "note": "PackageCloud Cleanup", "client_id": "9d87142b8e881f035f84", "client_secret": "9e0682185c78aa2b461dcfe5cfc16b32e1d5059e" }' -u 'USERNAME:PASSWORD' https://api.github.com/authorizations`
Replace the placeholders `OTP_TOKEN`, `USERNAME` and `PASSWORD`. `OTP_TOKEN` is one-time password from your two-factor authentication app. Remove the `X-GitHub-OTP` header if you're not using 2FA. The `token` field from the response is what you need to fill in for `gitHubPersonalAccessToken`.

### Triggers
There are three triggers for the cleanup:
* **Branch Cleanup** is triggered when a branch is deleted. All packages with the branch name in the version string will be deleted.
* **Snapshot Cleanup** is triggered when a new snapshot version is pushed to the master branch. Only a given amount of snapshots (see variable *snapshotsOfMasterToKeep* above) will be preserved, any packages exceeding this limit will be deleted. Older packages will be deleted first. **Note:** This function is deactivated in the code due to PackageCloud not exposing multiple builds of the same package via API. Selectively deleting builds is therefore not possible at this moment.
* **Release Cleanup** is triggered when a new tag is created. All packages with that tag/version and the *-SNAPSHOT* suffix will be deleted.
