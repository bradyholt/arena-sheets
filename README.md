# arena-sheets
Pulls data out of Shelby Arena and pushes to Google Sheets

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
- Change the way raw scrape files are organized
- Implement Google Sheets *prepend* functionality to prevent overwriting
- Format out data that gets written to Google Sheets
