'use strict';
const https = require('https');
const xml2js = require('xml2js');

//config variables
//var snapshotsOfMasterToKeep = process.env.snapshotsOfMasterToKeep;
var packageCloudUser = process.env.packageCloudUser;
var packageCloudRepository = process.env.packageCloudRepository;
var packageCloudApiKey = process.env.packageCloudApiKey;
var gitHubUserAgent = process.env.gitHubUserAgent;
var gitHubPersonalAccessToken = process.env.gitHubPersonalAccessToken;
var gitHubOrganization = process.env.gitHubOrganization;

/*
// Compares two date strings, used when sorting packages by build date
function compareDateString(a, b) {
    var dateA = new Date(a);
    var dateB = new Date(b);

    if(dateA < dateB) {
        return -1;
    }
    if(dateA > dateB) {
        return 1;
    }
    return 0;
}
*/

// Retrieves a file by filename from a given repo
function getFile(repo, pathToFile, callback) {
    console.log('Getting file ' + pathToFile + ' from repo ' + repo + '...');

    var options = {
        host: 'api.github.com',
        port: 443,
        path: '/repos/' + gitHubOrganization + '/' + repo + '/contents/' + pathToFile,
        method: 'GET'
    };

    var req = https.request(options, function(res) {
        res.setEncoding('utf8');
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function () {
            if(res.statusCode === 200) {
                console.log('Found file ' + pathToFile + '.');
                var bodyJson = JSON.parse(body);
                callback(bodyJson);
            }
        });
    });

    req.setHeader('Accept', 'application/vnd.github.v3+json');
    req.setHeader('User-Agent', gitHubUserAgent);
    req.setHeader('Authorization', 'token ' + gitHubPersonalAccessToken);

    req.on('error', function(e) {
        console.error('Error when requesting file ' + pathToFile + ': ' + e.message);
    });

    req.end();
}

// Gets the package name and version either from pom.xml or from build.gradle/versions.gradle
function getGroupIdAndVersion(repo, callback) {
    console.log('Getting Group ID and current version of repo ' + repo + '...');

    //try to get pom file
    getFile(repo, 'pom.xml', function(xmlFileJson) {
        //check if successful
        if(xmlFileJson.name === 'pom.xml') {
            //parse contents and get group ID
            var xmlFileContents = Buffer.from(xmlFileJson.content, 'base64');
            var xmlParser = new xml2js.Parser();
            xmlParser.parseString(xmlFileContents, function(err, xmlResult) {
                if(err) {
                    console.error(err);
                }
                console.log('Found Group ID ' + xmlResult.project.groupId + ' and version ' + xmlResult.project.version + '.');
                callback(xmlResult.project.groupId, xmlResult.project.version);
            });

        //else try to get build.gradle file
        } else {
            getFile(repo, 'app/build.gradle', function(gradleFileJson) {
                //parse contents and get group ID
                var gradleFileContents = Buffer.from(gradleFileJson.content, 'base64');
                var groupId = gradleFileContents.toString().match(/applicationId "(.*?)"/g)[0].replace('applicationId "', '').replace('"', '');
                console.log('Found Group ID ' + groupId + '.');

                //get versions.gradle file to grab the version
                getFile(repo, 'versions.gradle', function(versionFileJson) {
                    //parse contents and get version
                    var versionFileContents = Buffer.from(versionFileJson.content, 'base64');
                    var version = versionFileContents.toString().match(/versionName = '(.*?)'/g)[0].replace('versionName = \'', '').replace('\'', '');
                    console.log('Found version ' + version + '.');
                    callback(groupId, version);
                });
            });
        }
    });
}

// Searches packageCloud for packages with given search string
function searchPackagesInPackageCloud(searchString, callback) {
    console.log('Searching for packages on PackageCloud (' + searchString + ')...');

    var options = {
        host: 'packagecloud.io',
        port: 443,
        path: '/api/v1/repos/' + packageCloudUser + '/' + packageCloudRepository + '/search.json?q=' + searchString + '&per_page=1000',
        method: 'GET'
    };

    var req = https.request(options, function(res) {
        res.setEncoding('utf8');
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function () {
            if(res.statusCode === 200) {
                var bodyJson = JSON.parse(body);
                console.log('Search concluded with ' + bodyJson.length + ' results.');
                callback(bodyJson);
            }
        });
    });

    req.setHeader('Authorization', 'Basic ' + new Buffer(packageCloudApiKey + ':').toString('base64'));

    req.on('error', function(e) {
        console.error('Error when searching for packages: ' + e.message);
    });

    req.end();
}

// Removes a package specified by filename and group ID from package cloud
function removePackageFromPackageCloud(filename, groupId, callback) {
    console.log('Deleting package ' + filename + '...');

    var options = {
        host: 'packagecloud.io',
        port: 443,
        path: '/api/v1/repos/' + packageCloudUser + '/' + packageCloudRepository + '/java/maven2/' + groupId + '/' + filename,
        method: 'DELETE'
    };

    var req = https.request(options, function(res) {
        res.setEncoding('utf8');
        var body = '';
        res.on('data', function (chunk) {
            body += chunk;
        });
        res.on('end', function () {
            if(res.statusCode === 200) {
                var bodyJson = JSON.parse(body);
                console.log('Deleted package ' + filename + '.');
                callback(true);
            }
        });
    });

    req.setHeader('Authorization', 'Basic ' + new Buffer(packageCloudApiKey + ':').toString('base64'));

    req.on('error', function(e) {
        console.log('Error while deleting package ' + filename + ': ' + e.message);
    });

    req.end();
}

// Removes all packages of a given branch in a given repository (triggered by branch-delete)
function removeAllPackagesByBranch(repo, branch, callback) {
    //get the group ID by looking at the master branch of the same repo
    getGroupIdAndVersion(repo, function(groupId, version) {

        //assemble search string for packagecloud API
        var searchString = groupId + ':' + branch;

        //get all affected packages from packagecloud API
        searchPackagesInPackageCloud(searchString, function(packagesToBeDeleted) {
            //for each package, send a delete request
            var itemsToProcess = packagesToBeDeleted.length;
            packagesToBeDeleted.forEach(function(element) {
                removePackageFromPackageCloud(element.filename, groupId, function() {
                    itemsToProcess--;
                    //callback when all runs of the loop have completed
                    if(itemsToProcess === 0) {
                        callback(true);
                    }
                });
            });
        });
    });
}

// Removes all SNAPSHOT packages with the given tag in the given repository (triggered by tag-create)
function removeSnapshotPackagesByTag(repo, tag, callback) {
    //get the group ID
    getGroupIdAndVersion(repo, function(groupId, version) {

        //assemble search string for packagecloud API
        var searchString = groupId + ':' + tag + '-SNAPSHOT';

        //get all affected packages from packagecloud API
        searchPackagesInPackageCloud(searchString, function(packagesToBeDeleted) {
            //for each package, send a delete request
            var itemsToProcess = packagesToBeDeleted.length;
            packagesToBeDeleted.forEach(function(element) {
                removePackageFromPackageCloud(element.filename, groupId, function() {
                    itemsToProcess--;
                    //callback when all runs of the loop have completed
                    if(itemsToProcess === 0) {
                        callback(true);
                    }
                });
            });
        });
    });
}

/*
// Removes all SNAPSHOT packages from the given repository and only keeps [count] packages (triggered by master-push)
function removeOldSnapshotPackages(repo, count, callback) {
    //get the group ID
    getGroupIdAndVersion(repo, function(groupId, version) {
        //make sure we only clean up SNAPSHOT packages
        if(version.includes('-SNAPSHOT')) {
            //assemble search string for packagecloud API
            var searchString = groupId + ':' + version;

            //get all affected packages from packagecloud API
            searchPackagesInPackageCloud(searchString, function(packagesToBeDeleted) {

                //group packages by their 'name' property in sub-arrays
                var itemsToGroup = packagesToBeDeleted.length;
                var itemsToCheck = 0;
                var itemsToRemove = 0;
                var itemsRemoved = 0;
                var packagesGroupedByName = [];
                packagesToBeDeleted.forEach(function(element) {
                    if(!packagesGroupedByName[element.name]) {
                        packagesGroupedByName[element.name] = [];
                    }
                    packagesGroupedByName[element.name].push(element);
                    itemsToGroup--;
                    if(itemsToGroup === 0) {
                        console.log('Found ' + Object.keys(packagesGroupedByName).length + ' packages.');

                        //go through all sub-arrays
                        itemsToCheck = Object.keys(packagesGroupedByName).length;
                        for(var index in packagesGroupedByName) {
                            if(packagesGroupedByName.hasOwnProperty(index)) {
                                console.log('Analyzing history of package ' + index + '.');

                                //if there are more than {count} packages in a sub-array
                                if(packagesGroupedByName[index].length > count) {
                                    itemsToRemove = packagesGroupedByName[index].length - count;

                                    console.log('Found number of snapshots to be above threshold (' + packagesGroupedByName[index].length + ' > ' + count + '), deleting ' + itemsToRemove + ' snapshots...');

                                    //order the sub-array by time and date
                                    packagesGroupedByName[index].sort(compareDateString);

                                    //start deleting at index {count}
                                    for(var i = count; i < packagesGroupedByName[index].length; i++) {
                                        removePackageFromPackageCloud(packagesGroupedByName[index][i].filename, groupId, function() {
                                            itemsToRemove--;
                                            itemsRemoved++;

                                            //callback when all runs of the loop have completed
                                            //if(itemsToRemove === 0 && itemsToCheck === 0) {
                                            //    console.log('1: Deleted ' + itemsRemoved + ' snapshots.');
                                            //    callback(true);
                                            //}
                                        });
                                    }
                                } else {
                                    console.log('Found number of snapshots to be below threshold (' + packagesGroupedByName[index].length + ' > ' + count + '), not deleting anything.');
                                }
                                itemsToCheck--;

                                //callback when all runs of the loop have completed
                                //if(itemsToRemove === 0 && itemsToCheck === 0) {
                                //    console.log('2: Deleted ' + itemsRemoved + ' snapshots.');
                                //    callback(true);
                                //}
                            }
                        }
                    }
                    //callback when all runs of the loop have completed
                    if(itemsToGroup === 0 && itemsToRemove === 0 && itemsToCheck === 0) {
                        console.log('Deleted ' + itemsRemoved + ' snapshots.');
                        callback(true);
                    }
                });
            });
        } else {
            console.log('Did not delete any packages, version of package was not a SNAPSHOT.');
            callback(true);
        }
    });
}
*/

function conclude(status) {
    console.log('Finished package cleanup.');
    console.log(status);
}

exports.handler = (event, context, callback) => {

    console.log('Starting package cleanup...');

    //init status variable for future use
    var status;

    //parse message attributes first
    const messageAttributes = event.Records[0].Sns.MessageAttributes;

    //only continue if we have received a Github event
    if(messageAttributes['X-Github-Event'] && messageAttributes['X-Github-Event'].Value === 'push') {
        status = 'End Result: Found GitHub push event';

        //parse and output event message
        const message = JSON.parse(event.Records[0].Sns.Message);

        //handle event type
        if(message.deleted === true && message.after === '0000000000000000000000000000000000000000') {
            //handle removed branches
            var branchName = message.ref.replace('refs/heads/', '');
            status += ', branch ' + branchName + ' was removed';
            console.log('Found relevant event: Removal of branch ' + branchName);
            removeAllPackagesByBranch(message.repository.name, branchName, function(result) {
                if(result === true) {
                    status += ', all packages were deleted.';
                    console.log('Finished removing all packages of branch ' + branchName + '.');
                    conclude(status);
                } else {
                    status += ', encountered an error while deleting all packages.';
                    console.log('Error while removing all packages of branch ' + branchName + '.');
                    conclude(status);
                }
            });
        /*
        } else if(message.ref === 'refs/heads/master' && message.deleted === false && message.created === false && message.before !== '0000000000000000000000000000000000000000' && message.after !== '0000000000000000000000000000000000000000' && message.commits.length !== 0) {
            //handle new pushes to master
            status += ', new push to master branch';
            console.log('Found relevant event: Push to master branch');
            removeOldSnapshotPackages(message.repository.name, snapshotsOfMasterToKeep, function(result) {
                if(result === true) {
                    status += ', all snapshots but ' + snapshotsOfMasterToKeep + ' were deleted.';
                    console.log('Finished cleaning old snapshots.');
                    conclude(status);
                } else {
                    status += ', encountered an error while cleaning old snapshots.';
                    console.log('Error while cleaning old snapshots.');
                    conclude(status);
                }
            });
        */
        } else if(message.ref.startsWith('refs/tags/') && message.created === true && message.before === '0000000000000000000000000000000000000000') {
            //handle newly created tags
            var tagName = message.ref.replace('refs/tags/', '');
            status += ', new tag ' + tagName + ' was created';
            console.log('Found relevant event: Created new tag ' + tagName);
            removeSnapshotPackagesByTag(message.repository.name, tagName, function(result) {
                if(result === true) {
                    status += ', all snapshots were deleted.';
                    console.log('Finished removing snapshots of tag ' + tagName + '.');
                    conclude(status);
                } else {
                    status += ', encountered an error while deleting snapshots.';
                    console.log('Error while removing snapshots of tag ' + tagName + '.');
                    conclude(status);
                }
            });
        } else {
            status += ', but no condition for further processing was met. Nothing was cleaned.';
            console.log('Full event: ' + message);
            conclude(status);
        }
    } else {
        console.log('Cannot find a GitHub event.');
        status = 'End Result: No GitHub event found, nothing was cleaned.';
        conclude(status);
    }

    callback(null, status);
};
