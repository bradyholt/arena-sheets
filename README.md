# arena-sheets
Pull data out of [Shelby Arena](http://www.shelbysystems.com/products/arena/) and push to Google Sheets

## Creating Google Project

- Create Project in the [Google Developers Console](https://console.developers.google.com)
- Add credentials for "Other" application type
- Download client secrets file; rename to client_secrets.json and place in root directory
- Populate config.json with 'client_id', 'client_secret' found in client_secrets.json
- Run auth/get-google-refresh-token.rb and follow instructions
- access_token.txt and refresh_token.txt will be created after following instructions
- Populate config/app.json with 'access_token' from access_token.txt and 'refresh_token' from refresh_token.txt.

## Config
The following files need to be created before use.  There are [file].example files for each of these to guide construction.

- **config/app.json** - Application config
- **config/hosts** - Hosts inventory
- **config/group_vars/production** - Production specific config  

## Scripts

- **npm run provision** - Provisions a server to host this app (Ubuntu 14 is assumed)
- **npm run deploy** - Deploys the app to the provisioned server
- **npm run ssh** - Connects to the provisioned server via ssh
- **npm run start** - Runs arena-sheets

## Usage

```
usage: node arena-sheets.js [options]

OPTIONS:
     --no-scrape       Do not scrape Arena; only process /data directory and update sheets
     --no-sheets       Do not update Google Sheets; only scrape Arena data
     --class_id id     Only process a single class
     --trace           Output additional debug logging to console
```

## Debugging

To use the node debugger, run the app with `debug` argument and place `debugger;` statements as appropriate.

```
node debug arena-sheets.js --no-scrape --class_id 2177
```
