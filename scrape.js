var casper = require('casper').create();
var util = require('utils');
var fs = require('fs');
var config = require('config');

casper.start('http://lbs.hfbc.org/default.aspx?page=3062', function() {
    this.fill('form', {
	'ctl08$ctl01$txtLoginId': config.arena_username,
        'ctl08$ctl01$txtPassword': config.arena_password
    }, false);
});

casper.thenClick('#ctl08_ctl01_btnSignin').waitForText("Welcome!", function(){
	this.echo("Login successful.");
});

casper.thenOpen('http://lbs.hfbc.org/default.aspx?page=3077&group=2177').waitForText("CLICK HERE TO LOG OUT", function(){
     this.echo("Members page loaded.");
     var form_info = this.evaluate(function(){
        var res={};
        f=document.forms[0];
        f.onsubmit= function() {
            //iterate the form fields
            var post={};
            for(i=0; i<f.elements.length; i++) {
               post[f.elements[i].name]=f.elements[i].value;
            }

            post["ctl08$ctl11$stGroupMain$ctl22$dgMembers$ctl28$dgMembers_ibExport.x"] = "8";
            post["ctl08$ctl11$stGroupMain$ctl22$dgMembers$ctl28$dgMembers_ibExport.y"] = "7";

            res.action = f.action;
            res.post = post;
            return false; //Stop form submission
        }

        //Trigger the click on the link.
        var l = $("#ctl08_ctl11_stGroupMain_ctl22_dgMembers_ctl28_dgMembers_ibExport");
        l.removeAttr("onclick");
        l.click();

        return res; //Return the form data to casper
     });

     this.echo("Downloading roster...");
     casper.download(form_info.action, "data/roster.html", "POST", form_info.post);
});

casper.thenOpen('http://lbs.hfbc.org/default.aspx?page=3077&group=2177&tab=AggregateMembers').waitForText("CLICK HERE TO LOG OUT", function(){
     this.echo("Members page loaded.");
     var form_info = this.evaluate(function(){
        var res={};
        f=document.forms[0];
        f.onsubmit= function() {
            //iterate the form fields
            var post={};
            for(i=0; i<f.elements.length; i++) {
               post[f.elements[i].name]=f.elements[i].value;
            }

            post["ctl08$ctl11$stGroupMain$ctl22$dgPersons$ctl28$dgPersons_ibExport.x"] = "4";
            post["ctl08$ctl11$stGroupMain$ctl22$dgPersons$ctl28$dgPersons_ibExport.y"] = "10";

            res.action = f.action;
            res.post = post;
            return false; //Stop form submission
        }

        //Trigger the click on the link.
        var l = $("#ctl08_ctl11_stGroupMain_ctl22_dgPersons_ctl28_dgPersons_ibExport");
        l.removeAttr("onclick");
        l.click();

        return res; //Return the form data to casper
     });

     this.echo("Downloading attendance...");
     casper.download(form_info.action, "data/attendance.html", "POST", form_info.post);
});

casper.run();
