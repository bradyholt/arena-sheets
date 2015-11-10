/**
 * Provides ability to interact with Google Sheets Spreadsheets
 */

 "use strict";

let _ = require('lodash');
let logger = require('winston');
let google = require('googleapis');

let Worksheets = require('../lib/worksheets');

function Spreadsheets(oauth2) {
    this.oauth2 = oauth2;
    this.inventory = null;
    this.drive = google.drive({
        version: 'v2',
        auth: oauth2
    });
}

Spreadsheets.prototype.fetchList = function() {
    let _this = this;

    if (_this.inventory) {
        return Promise.resolve(_this.inventory);
    } else {
        let promise = new Promise(function(resolve, reject) {
            logger.info("Will fetch list of existing spreadsheets");
            _this.drive.files.list({
                q: "mimeType='application/vnd.google-apps.spreadsheet'"
            }, function(err, resp) {
                if (err) {
                    logger.error("Error when fetching existing list of spreadsheets", {error: err});
                    reject(err);
                } else {
                    logger.info("Successfully fetched list of existing spreadsheets", {count: resp.items.length});
                    _this.inventory = new Object();
                    resp.items.forEach(function(s) {
                        if (!s.labels.trashed) {
                            _this.inventory[s.title] = s.id;
                        }
                    });
                }

                resolve(_this.inventory);
            });
        });

        return promise;
    }
};

Spreadsheets.prototype.copyFromTemplate = function(templateId, newName) {
    let _this = this;

    let promise = new Promise(function(resolve, reject) {
        logger.info("Creating new spreadsheet from template", { templateId: templateId, spreadSheetName: newName});
        _this.drive.files.copy({
            fileId: templateId,
            resource: {
                'title': newName
            }
        }, function(err, resp) {
            if (err) {
                logger.error("Error when creating new spreadsheet", {error: err});
                reject(err);
            } else if (!resp.id) {
                logger.error("Error when creating new spreadsheet", {error: "id was not in response"});
            } else {
                logger.info("Successfully copied spreadsheet from template", {templateId: templateId});
                _this.inventory[newName] = resp.id;
                resolve(resp.id);
            }
        });
    });

    return promise;
};

Spreadsheets.prototype.getId = function(name, templateId) {
    let _this = this;

    let promise = new Promise(function(resolve, reject) {
        _this.fetchList()
            .then(function(list) {
                if (list.hasOwnProperty(name)) {
                    resolve(list[name]);
                } else {
                    resolve(_this.copyFromTemplate(templateId, name));
                }
            });
    });

    return promise;
};

Spreadsheets.prototype.prepSheet = function(opts) {
    let _this = this;

    let promise = new Promise(function(resolve, reject) {
        _this.getId(opts.name, opts.templateId)
            .then(function(id) {
                logger.info("Fetch list of existing worksheets", {spreadsheetId: id});
                Worksheets.load({
                    debug: true,
                    spreadsheetId: id,
                    oauth2: {
                        client_id: _this.oauth2.clientId_,
                        client_secret: _this.oauth2.clientSecret_,
                        refresh_token: _this.oauth2.credentials.refresh_token
                    }
                }, function(err, worksheets) {
                    if (err) {
                        logger.error("Error when fetching list of worksheets", {spreadsheetId: id});
                        reject(err);
                    }

                    logger.info("Creating any missing worksheets if necessary", {spreadsheetId: id});
                    worksheets.prepWorksheets({
                        worksheets: opts.worksheets
                    }).then(function() {
                        resolve({
                            spreadsheetId: id,
                            worksheets: worksheets.inventory
                        });
                    });
                });
            });
    });

    return promise;
};

module.exports = Spreadsheets;
