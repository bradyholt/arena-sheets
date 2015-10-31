
module.exports = {
    startScrape: function(opts, callback) {
        var spawn = require('child_process').spawn;
        var cwd = process.cwd();

        var bin = cwd + '/node_modules/casperjs/bin/casperjs'
        var args = ['arena.js', (cwd + '/' + opts.data_path)];
        var envVars = process.env;
        envVars['PHANTOMJS_EXECUTABLE'] = cwd + '/node_modules/phantomjs/bin/phantomjs'

        var cspr = spawn(bin, args, {
            cwd: './casper',
            env: envVars
        });

        cspr.stdout.on('data', function (data) {
            var buff = new Buffer(data);
            console.log(buff.toString('utf8').replace("\n", ""));
        });

        cspr.stderr.on('data', function (data) {
            data += '';
            console.log(data.replace("\n", "\nstderr: "));
        });

        cspr.on('exit', function (code) {
            callback(code);
        });
    }
}
