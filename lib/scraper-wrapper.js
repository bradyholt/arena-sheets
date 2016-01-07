"use strict";

let logger = require('winston');

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
        let phantomjsBin = cwd + '/node_modules/phantomjs/bin/phantomjs';
        
        if (opts.scrape_proxy) {
            phantomjsBin = phantomjsBin + ` --proxy=${opts.scrape_proxy}`
        }
        
        envVars['PHANTOMJS_EXECUTABLE'] = phantomjsBin;

        logger.info("Starting scrape process", {bin: bin, args: args});
        let cspr = spawn(bin, args, {
            cwd: './casper',
            env: envVars
        });

        cspr.stdout.on('data', function(data) {
            let buff = new Buffer(data);
            logger.info("(scrape output) " + buff.toString('utf8').replace("\n", ""));
        });

        cspr.stderr.on('data', function(data) {
            data += '';
            logger.error("(scrape error) " + data.replace("\n", "\nstderr: "));
        });

        let promise = new Promise(function(resolve, reject) {
            cspr.on('exit', function(code) {
                logger.info("Scrape process finished", {code: code});

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
