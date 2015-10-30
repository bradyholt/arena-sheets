var _ = require('lodash');
var google = require('googleapis');
var Worksheets = require('../lib/worksheets.js');

function SpreadsheetManager(oauth2) {
    this.oauth2 = oauth2;
    this.spreadsheetInventory = null;
    this.drive = google.drive({
        version: 'v2',
        auth: oauth2
    });
}

SpreadsheetManager.prototype.fetchList = function() {
    var _this = this;

    if (_this.spreadsheetInventory) {
        return Promise.resolve(_this.spreadsheetInventory);
    } else {
        var promise = new Promise(function(resolve, reject) {
            _this.drive.files.list({
                auth: _this.oauth2,
                q: "mimeType='application/vnd.google-apps.spreadsheet'"
            }, function(err, resp) {
                if (err) {
                    console.log(err);
                    reject(err);
                } else {
                    _this.spreadsheetInventory = new Object();
                    resp.items.forEach(function(s) {
                        if (!s.labels.trashed) {
                            _this.spreadsheetInventory[s.title] = s.id;
                        }
                    });
                }

                resolve(_this.spreadsheetInventory);
            });
        });

        return promise;
    }
};

SpreadsheetManager.prototype.copyFromTemplate = function(templateId, newName) {
    var _this = this;

    var promise = new Promise(function(resolve, reject) {
        _this.drive.files.copy({
            fileId: templateId,
            resource: {
                'title': newName
            }
        }, function(err, resp) {
            if (err) {
                reject(err);
            } else {
                _this.spreadsheetInventory[newName] = resp.id;
                resolve(resp.id);
            }
        });
    });

    return promise;
};

SpreadsheetManager.prototype.getId = function(name, templateId) {
    var _this = this;

    var promise = new Promise(function(resolve, reject) {
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

SpreadsheetManager.prototype.prepSheet = function(opts) {
    var _this = this;

    var promise = new Promise(function(resolve, reject) {
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

                    worksheets.createWorksheetsIfMissing({
                        rows: opts.worksheetRows || 500,
                        col: opts.worksheetColumns || 10,
                        names: opts.worksheetNames
                    }).then(function() {
                        resolve({
                            spreadsheetId: id,
                            worksheets: worksheets.worksheets
                        });
                    });
                });
            });
    });

    return promise;
};

module.exports = SpreadsheetManager;
