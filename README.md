# arena-sheets
Pulls data out of Shelby Arena and pushes to Google Sheets

## Creating Google Project

- Create Project in the [Google Developers Console](https://console.developers.google.com)
- Add credentials for "Other" application type
- Download client secrets file; rename to client_secrets.json and place in root directory
- Populate config.json with 'client_id', 'client_secret' found in client_secrets.json
- Run auth/get-google-refresh-token.rb and follow instructions
- access_token.txt and refresh_token.txt will be created after following instructions
- Populate config.json with 'access_token' from access_token.txt and 'refresh_token' fromrefresh_token.txt.

## Config
The following files need to be created before use.  There are [file].example files for each of these to guide construction.

- config.json
- ansible/production
- ansible/group_vars/production

## Scripts

- **npm run provision** - Provisions a server to host this app (Ubuntu 14 is assumed)
- **npm run deploy** - Deploys the app to the provisioned server

## TODO

- Logging
- Exception handling
- Format out data that gets written to Google Sheets
- Email list of failures
