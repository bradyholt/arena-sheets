/**
 * Provides ability to interact with Google Sheets Worksheets
 */

var request = require("request");
var auth = require("edit-google-spreadsheet/lib/auth");
var util = require("edit-google-spreadsheet/lib/util");
var xmlutil = require('xml2json');
var _ = require("lodash");

//public api
exports.create = exports.load = function(opts, callback) {
    if (!callback)
        callback = opts.callback;
    if (!callback)
        throw "Missing callback";
    if (!(opts.username && opts.password) && !opts.oauth && !opts.oauth2 && !opts.accessToken)
        return callback("Missing authentication information");
    if (!opts.spreadsheetId && !opts.spreadsheetName)
        return callback("Missing 'spreadsheetId' or 'spreadsheetName'");

    var worksheets = new Worksheets(opts);

    //default to http's' when undefined
    opts.useHTTPS = opts.useHTTPS === false ? '' : 's';
    worksheets.protocol += opts.useHTTPS;

    //add to spreadsheet
    _.extend(worksheets, _.pick(opts,
        'spreadsheetId', 'spreadsheetName'
    ));

    auth(opts, function(err, token) {
        if (err) return callback(err);
        worksheets.setToken(token);
        worksheets.init(callback);
    });
};

//Worksheets class
function Worksheets(opts) {
    this.opts = opts;
    this.raw = {};
    this.inventory = null;
    this.protocol = 'http';
}

Object.defineProperty(Worksheets.prototype, "worksheetsUrl", {
    get: function worksheetsUrl() {
        return `${this.protocol}://spreadsheets.google.com/feeds/worksheets/${this.spreadsheetId}/private/full`;
    }
});

Worksheets.prototype.init = function(callback) {
    var _this = this;
    this.getSheetId('spread', function(err) {
        if (err) return callback(err, null);
        _this.getWorksheets({}, function(err, response) {
            callback(err, _this);
        });
    });
};

Worksheets.prototype.log = function() {
    if (this.debug) console.log.apply(console, arguments);
};

Worksheets.prototype.request = function(opts, callback) {

    if (!_.isPlainObject(opts) || !opts.url) {
        return callback("Invalid request");
    }

    if (!this.authHeaders) {
        return callback("No authorization token. Use auth() first.");
    }

    //use pre-generated authenication headers
    opts.headers = this.authHeaders;

    //default to GET
    if (!opts.method) {
        opts.method = 'GET';
    }

    //follow redirects - even from POSTs
    opts.followAllRedirects = true;

    var _this = this;
    request(opts, function(err, response, body) {
        //show error
        if (err) {
            return callback(err);
        }
        //missing the response???
        if (!response) {
            return callback('no response');
        }

        //reauth
        if (response.statusCode === 401 && typeof _this.opts.accessToken !== 'object') {
            _this.log('Authentication token expired. Logging into Google again...'.grey);
            return auth(_this.opts, function(err, token) {
                if (err) return callback(err);
                _this.setToken(token);
                _this.request(opts, callback);
            });
        }

        //body is error
        if (response.statusCode.toString()[0] !== "2") { //i.e. 200, 201
            return callback(body);
        }

        //try to parse XML
        var result;
        try {
            result = xmlutil.toJson(body, {
                object: true,
                sanitize: false,
                trim: false
            });
        } catch (e) {
            return callback('Bad response format (' + e + ')');
        }

        return callback(null, result);
    });
};

//get spreadsheet/worksheet ids by name
Worksheets.prototype.getSheetId = function(type, callback) {

    var _this = this;
    var id = type + 'sheetId';
    var display = type.charAt(0).toUpperCase() + type.substr(1) + 'sheet';
    var name = this[type + 'sheetName'];
    var spreadsheetUrlId = type === 'work' ? ('/' + this.spreadsheetId) : '';

    //already have id
    if (this[id])
        return callback(null);

    this.log(("Searching for " + display + " '" + name + "'...").grey);

    this.request({
        url: this.protocol + '://spreadsheets.google.com/feeds/' +
            type + 'sheets' + spreadsheetUrlId + '/private/full'
    }, function(err, result) {
        if (err) return callback(err);

        var entries = result.feed.entry || [];

        // Force array format for result
        if (!(entries instanceof Array)) {
            entries = [entries];
        }

        //store raw mapped results
        _this.raw[type + 'sheets'] = entries.map(function(e1) {
            var e2 = {};
            for (var prop in e1) {
                var val = e1[prop];
                //remove silly $t object
                if (typeof val === 'object') {
                    var keys = Object.keys(val);
                    if (keys.length === 1 && keys[0] === "$t")
                        val = val.$t;
                }
                //remove silly gs$
                if (/^g[a-z]\$(\w+)/.test(prop))
                    e2[RegExp.$1] = val;
                else
                    e2[prop] = val;
            }
            //search for 'name', extract only end portion of URL!
            if (e2.title === name && e2.id && /([^\/]+)$/.test(e2.id))
                _this[id] = RegExp.$1;

            return e2;
        });

        var m = null;
        if (!_this[id])
            return callback(type + "sheet '" + name + "' not found");

        _this.log(("Tip: Use option '" + type + "sheetId: \"" + _this[id] + "\"' for improved performance").yellow);
        callback(null);

    });
};

Worksheets.prototype.setToken = function(token) {
    this.authHeaders = {
        'Authorization': token.type + ' ' + token.token,
        'Content-Type': 'application/atom+xml',
        'GData-Version': '3.0'
    };
};

Worksheets.prototype.getWorksheets = function(opts, callback) {

    if (this.inventory) {
        //we already have the worksheet list
        callback(null, this.inventory);
    }

    var _this = this;
    this.request({
        url: _this.worksheetsUrl,
        method: 'GET'
    }, function(error, response, body) {
        if (error)
            callback(error);
        else if (!response.feed || !response.feed.entry) {
            callback('Response did not contain expected data:' + response);
        } else {
            _this.inventory = new Object();
            response.feed.entry.forEach(function(w) {
                var id = w.id.match(/(\S*)\/(\S*)/i)[2];
                _this.inventory[w.title] = id;
            });

            callback(null, _this.inventory);
        }
    });
}

Worksheets.prototype.createWorksheetsIfMissing = function(opts, callback) {
    var _this = this;
    var promises = [];

    if (opts.worksheets) {
        var worksheets = opts.worksheets;
        worksheets.forEach(function(ws) {
            if (!_this.inventory.hasOwnProperty(ws.name)) {
                promises.push(new Promise(function(resolve, reject) {
                    _this.request({
                        url: _this.worksheetsUrl,
                        method: 'POST',
                        body: generateNewSheetXMLBody(ws.name, ws.rows || 100, ws.col || 5)
                    }, function(error, response, body) {
                        if (error) {
                            reject(error);
                        } else {
                            var newId = response.entry.id.match(/(\S*)\/(\S*)/i)[2];
                            _this.inventory[ws.name] = newId;
                            resolve(newId);
                        }
                    });
                }));
            }
        });
    }

    return Promise.all(promises);
};

function generateNewSheetXMLBody(worksheetName, rows, cols) {
    return '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gs="http://schemas.google.com/spreadsheets/2006"> <title>' + worksheetName + '</title> <gs:rowCount>' + rows + '</gs:rowCount> <gs:colCount>' + cols + '</gs:colCount> </entry>';
}
