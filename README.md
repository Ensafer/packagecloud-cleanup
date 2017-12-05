# PackageCloud Cleanup
Automatically cleans up old packages in a PackageCloud repository upon GitHub actions.

GitHub ties into Amazon's Simple Notification Service by specifying the service in your repository's settings. The endpoint of your Amazon SNS topic must be configured to be a Lambda function based on Node.js. Use the included script.js file as the Lambda function's content.
General setup as outlined in this AWS Compute Blog (https://aws.amazon.com/blogs/compute/dynamic-github-actions-with-aws-lambda/) post.

In the script, variables are used to hold a few configuration strings:
* **snapshotsOfMasterToKeep:** The number of snapshots of a package that should be kept before cleaning up.
* **packageCloudUser:** PackageCloud Username.
* **packageCloudRepository:** PackageCloud repository that will be cleaned.
* **packageCloudApiKey:** PackageCloud API Key.
* **gitHubUserAgent:** User Agent that should be sent with your GitHub API requests, e.g. your GitHub username.
* **gitHubPersonalAccessToken:** A personal access token generated in your GitHub account settings.
* **gitHubOrganization:** The GitHub organization that owns your repositories.

There are three triggers for the cleanup:
* **Branch Cleanup** is triggered when a branch is deleted. All packages with the branch name in the version string will be deleted.
* **Snapshot Cleanup** is triggered when a new snapshot version is pushed to the master branch. Only a given amount of snapshots (see variable *snapshotsOfMasterToKeep* above) will be preserved, any packages exceeding this limit will be deleted. Older packages will be deleted first.
* **Release Cleanup** is triggered when a new tag is created. All packages with that tag/version and the *-SNAPSHOT* suffix will be deleted.
