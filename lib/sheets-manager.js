/**
 * Provides ability to interact with Google Sheets Spreadsheets
 */

 "use strict";

let google = require('googleapis');
let Worksheets = require('../lib/worksheets');
let _ = require('lodash');

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
            _this.drive.files.list({
                q: "mimeType='application/vnd.google-apps.spreadsheet'"
            }, function(err, resp) {
                if (err) {
                    console.log(err);
                    reject(err);
                } else {
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
        console.log("Creating new sheet from template named: " + newName);
        _this.drive.files.copy({
            fileId: templateId,
            resource: {
                'title': newName
            }
        }, function(err, resp) {
            if (err) {
                reject(err);
            } else if (!resp.id) {
                reject("id not in response when copying spreadsheet from template for: '" + newName + "'");
            } else {
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
                        reject(err);
                    }

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
