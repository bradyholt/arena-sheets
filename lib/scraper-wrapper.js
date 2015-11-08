"use strict";

module.exports = {
    startScrape: function(opts, callback) {
        let spawn = require('child_process').spawn;
        let cwd = process.cwd();

        let bin = cwd + '/node_modules/casperjs/bin/casperjs'
        let args = ['arena.js', (cwd + '/' + opts.data_path)];
        if (opts.class_id) {
            args.push(opts.class_id);
        }

        let envVars = process.env;
        envVars['PHANTOMJS_EXECUTABLE'] = cwd + '/node_modules/phantomjs/bin/phantomjs'

        let cspr = spawn(bin, args, {
            cwd: './casper',
            env: envVars
        });

        cspr.stdout.on('data', function(data) {
            let buff = new Buffer(data);
            console.log(buff.toString('utf8').replace("\n", ""));
        });

        cspr.stderr.on('data', function(data) {
            data += '';
            console.log(data.replace("\n", "\nstderr: "));
        });

        let promise = new Promise(function(resolve, reject) {
            cspr.on('exit', function(code) {
                if (code == 0) {
                    resolve(code);
                } else {
                    reject(code);
                }
            });
        });

        return promise;
    }
}
