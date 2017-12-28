![Debundle](debundle_logo.png)

# debundle

This is a tool built to unpack javascript bundles prudiced by webpack and browserify.

[![Build Status](https://travis-ci.org/1egoman/debundle.svg?branch=master)](https://travis-ci.org/1egoman/debundler)

---

## :dragon: HERE BE DRAGONS! :dragon:
This was a research project I built to help me understand how javascript bundles are strutured. It works in a labratory environment most of the, but often fails on real-world bundles. It's been a while since I worked on this project so if you run into issues, I might not really be able to help you all that much.

---

## Why would I want to debundle my code?
Reasons vary, but this tool was originally developed to help me with a reverse engineering project.
Needless to say, sifting through minified bundles to try and figure out how a service works isn't
fun and is a lot easier when that bundle is broken into files and those files have semantic names. 

## Installation
```
npm i -g debundle
```

## Running
```bash
$ debundle
Usage: debundle [input file] {OPTIONS}

Options:
   --input,  -i  Bundle to debundle
   --output, -o  Directory to debundle code into.
   --config, -c  Configuration file

$ curl https://raw.githubusercontent.com/1egoman/debundle/master/test_bundles/browserify/bundle.js > bundle.js
$ curl https://raw.githubusercontent.com/1egoman/debundle/master/test_bundles/browserify/debundle.config.json > debundle.config.json
$ cat debundle.config.json
{
  "type": "browserify",
  "knownPaths": {}
}
$ debundle -i bundle.js -o dist/ -c debundle.config.json
$ tree dist/
dist/
├── index.js
└── node_modules
    ├── number
    │   └── index.js
    └── uuid
        ├── index.js
        ├── lib
        │   ├── bytesToUuid.js
        │   └── rng.js
        ├── v1.js
        └── v4.js
4 directories, 7 files
```

# Configuration

## Simple configuration
```
{
  "type": "browserify",
  "entryPoint": 1,
  "knownPaths": {}
}
```

(To debundle a simple Webpack bundle, replace `browserify` the above configuration with `webpack`)

A configuration can have a number of flags - they are documented in [DOCS.md](DOCS.md).

# FAQ

### Is debundling lossless? Ie, if I bundle my code then debundle, will I get the same source that was originally bundled? 

No. There a bunch of metadata that's lost when bundling:
- Any custom `package.json` settings for each `node_module` and the root package.
- In a webpack bundle, the names of modules aren't in the bundle. By default, debundling will produce
files named after the module id (ie, `1.js`) unless [manually overridden](https://github.com/1egoman/debundle/blob/master/DOCS.md#knownpaths-required).
- If your code was minified, the output files from the debundling process will also be minified (ie,
no whitespace, single letter variables, etc). It's up to you to run source through other tools to
make it look nicer.

### My debundled code can't be run!

- Make sure that either when rebundling or running with node that you're using the correct file as
your entrypoint. 
- Read through [all the configuration options](https://github.com/1egoman/debundle/blob/master/DOCS.md). Some of them have caveats.
- You could have run into an edge case that I haven't seen yet. Feel free to open an issue if you believe that to be the case.

### Does this tool support bundles made by tools other than Browserify and Webpack?

Not officially. However, if a bundle shares the same type module layout as Browserify or Webpack it
may be possible to set the [moduleAst](https://github.com/1egoman/debundle/blob/master/DOCS.md#moduleast)
configuration option to point to the location of the modules.

# Contributing
- After cloning down the project, run `npm install` - that should be it.
- Debundler entry point is `./src/index.js` (that's how you run it!)
- A bunch of sample bundles are in `test_bundles/`. A script, `test_bundles/run_test.sh` can run the
  debundler against a given bundle and try to debundle it into `dist/`. (CI will, as part of running
  tests, debundle all the bundles in that folder.)
- Make sure any contribution pass the tests: `npm test`

# Legal note
Some companies specify in their terms of service that their code cannot be "reverse engineered".
Debundling can definitely (depending on how you're using the code) fall under that umbrella.
Understand what you are doing so you don't break any agreements :smile:
