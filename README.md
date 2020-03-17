# Debundle, V2

I needed to somewhat recently reverse engineer a few webpack bundles. I rebuilt debundle to be a bit
easier to use and to do a few more things automatically. I give no support to this code right now -
it's not being published on npm, any issues will be closed, etc.

However, I think, it's a much more streamlined way of doing things.

## Getting Started
```sh
$ # Install Dependencies
$ npm install
$
$ # This is where the main "debundle" script lives right now.
$ node src/index.js
Error: the path to a javascript bundle is required.
ie: debundle ./path/to/javascript/bundle.js
$
$ # Here's a sample create-react-app production application that I found online:
$ curl --head http://sample-react-production-app.herokuapp.com/
HTTP/1.1 200 OK
Server: Cowboy
Connection: keep-alive
X-Powered-By: Express
Accept-Ranges: bytes
Cache-Control: public, max-age=0
Last-Modified: Fri, 03 Aug 2018 00:24:41 GMT
Etag: W/"224-164fd2c1128"
Content-Type: text/html; charset=UTF-8
Content-Length: 548
Date: Thu, 12 Mar 2020 11:50:04 GMT
Via: 1.1 vegur
$
$ # I'll download the javascript bundle from the application
$ curl http://sample-react-production-app.herokuapp.com/static/js/main.a285be49.js >
createreactapp.js
$
$ # And then, I'll "debundle" it:
$ node src/index.js createreactapp.js
[LOG] Read bundle /home/ryan/w/1egoman/debundle-2/createreactapp.js (118190 bytes)
[LOG] Looking for webpackBootstrap in bundle...
[LOG] Found webpackBootstrap!
[LOG] webpackBootstrap module call expression: e[r].call(o.exports, o, o.exports, t)
[LOG] Found 28 modules in main bundle
[LOG] Discovered module 0 (chunk ["default"])
[LOG] Discovered module 1 (chunk ["default"], depends on 14)
[LOG] Discovered module 2 (chunk ["default"], depends on 9)
[LOG] Discovered module 3 (chunk ["default"])
[LOG] Discovered module 4 (chunk ["default"])
[LOG] Discovered module 5 (chunk ["default"])
[LOG] Discovered module 6 (chunk ["default"], depends on 7, 13)
[LOG] Discovered module 7 (chunk ["default"], depends on 8, 11, 12)
[LOG] Discovered module 8 (chunk ["default"], depends on 2)
[LOG] Discovered module 9 (chunk ["default"], depends on 10)
[LOG] Discovered module 10 (chunk ["default"])
[LOG] Discovered module 11 (chunk ["default"], depends on 2)
[LOG] Discovered module 12 (chunk ["default"])
[LOG] Discovered module 13 (chunk ["default"], depends on 1, 15, 23, and 2 more)
[LOG] Discovered module 14 (chunk ["default"], depends on 3, 4, 5)
[LOG] Discovered module 15 (chunk ["default"], depends on 16)
[LOG] Discovered module 16 (chunk ["default"], depends on 3, 1, 17, and 5 more)
[LOG] Discovered module 17 (chunk ["default"])
[LOG] Discovered module 18 (chunk ["default"])
[LOG] Discovered module 19 (chunk ["default"])
[LOG] Discovered module 20 (chunk ["default"], depends on 21)
[LOG] Discovered module 21 (chunk ["default"], depends on 22)
[LOG] Discovered module 22 (chunk ["default"])
[LOG] Discovered module 23 (chunk ["default"])
[LOG] Discovered module 24 (chunk ["default"], depends on 1, 25, 26)
[LOG] Discovered module 25 (chunk ["default"])
[LOG] Discovered module 26 (chunk ["default"])
[LOG] Discovered module 27 (chunk ["default"])
[LOG] Writing all modules to ./dist...
[LOG] Finished writing all modules to ./dist: wrote 28 files.
$
$ # Now, I can take a look in `./dist`, and see all the modules within the bundle listed out:
$ ls dist/
default-0.js   default-12.js  default-15.js  default-18.js  default-20.js  default-23.js default-26.js  default-3.js  default-6.js  default-9.js
default-10.js  default-13.js  default-16.js  default-19.js  default-21.js  default-24.js default-27.js  default-4.js  default-7.js
default-11.js  default-14.js  default-17.js  default-1.js   default-22.js  default-25.js default-2.js   default-5.js  default-8.js
$
$ # And finally, here's one module. Looks like an `Object.assign` polyfill of some sort?
$ cat dist/default-0.js 
'use strict';
function r(e) {
    if (null === e || void 0 === e)
        throw new TypeError('Object.assign cannot be called with null or undefined');
    return Object(e);
}
var o = Object.getOwnPropertySymbols, i = Object.prototype.hasOwnProperty, a = Object.prototype.propertyIsEnumerable;
module.exports = function () {
    try {
        if (!Object.assign)
            return !1;
        var e = new String('abc');
        if (e[5] = 'de', '5' === Object.getOwnPropertyNames(e)[0])
            return !1;
        for (var t = {}, n = 0; n < 10; n++)
            t['_' + String.fromCharCode(n)] = n;
        if ('0123456789' !== Object.getOwnPropertyNames(t).map(function (e) {
                return t[e];
            }).join(''))
            return !1;
        var r = {};
        return 'abcdefghijklmnopqrst'.split('').forEach(function (e) {
            r[e] = e;
        }), 'abcdefghijklmnopqrst' === Object.keys(Object.assign({}, r)).join('');
    } catch (e) {
        return !1;
    }
}() ? Object.assign : function (e, t) {
    for (var n, l, u = r(e), c = 1; c < arguments.length; c++) {
        n = Object(arguments[c]);
        for (var s in n)
            i.call(n, s) && (u[s] = n[s]);
        if (o) {
            l = o(n);
            for (var f = 0; f < l.length; f++)
                a.call(n, l[f]) && (u[l[f]] = n[l[f]]);
        }
    }
    return u;
};
$
$ # After debundling, a new file is generated alongside the original bundle file, which can be used
$ # to configure additional runs of debundle. The `.info` suffix is old and outdated, this should be
$ # changed.
$ cat createreactapp.js.info 
// This auto-generated file defines some options used when "createreactapp.js" is debundled.
module.exports = {
  "version": 1,
  "options": {}
}
$
$ # The idea is, you could modify the file to look something like the below to do things like set
$ # specific configuration options, or run code during specific parts of the debundling workflow ("hooks")
$ cat createreactapp.js.info 
// A modified version of the above file
module.exports = {
  "version": 1,
  "options": {
    "distPath": "./my-cool-dist",
    // There are more, take a look at "settings.js" for the default list that is merged with this
  },

  hooks: {
    // There's also a "preParse" right now, that's all. There maybe should be more?
    postParse: bundle => {
      // In here, you have access to the `bundle` instance and can do whatever you want, before the
      // modules are exported to disk. None of this is documented yet, sorry :(

      bundle.getModule(5).path = 'dom-polyfills.js';
      bundle.getModule(6).path = 'constants.js';

      bundle.getModule(14).path = 'more-utility-functions.js';

      // NOTE: default-15.js contains a place where module was renamed in error
      bundle.getModule(15).path = 'type-guesser-wrapper.js';
      bundle.getModule(15).comment = 'This module is a relatively thin wrapper around default-108.js ("type-guesser.js")';
      //                              ^ This line lets you set a comment at the top of the file when
      //                                it is exported to disk.

      // You can also log things out, too:
      /* console.log('Entrypoint Module Id:', bundle.webpackBootstrap.entrypointModuleId); */
    },
  },
}
$
$ # Now, at any time, you can rerun the original debundling process, and "re-debundle" it. This
$ # effectively acts as a build step and the .js.info file acts as configuration. Doing it this way
$ # means that (in theory) doing things like getting updated bundles and re-debundling them should be
$ # doable in the future (some work would have to be done to make a mapping of old module ids to new
$ # module ids), which is something that I wanted to attempt at some point. 
$
$ # All this is still tentative, though. Anything is up for debate / change if there's a good reason
$ # to change it - this was just what I arrived at and it worked to solve my problem.
```
